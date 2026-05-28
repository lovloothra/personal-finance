import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const providerFiles = [
  "packs/in/banks.json",
  "packs/in/credit-cards.json",
  "packs/in/brokers.json",
  "packs/in/investment-platforms.json",
  "packs/in/lenders.json",
  "packs/in/insurers.json"
];

const regulatedProviderFiles = [
  "packs/in/banks.json",
  "packs/in/brokers.json",
  "packs/in/investment-platforms.json",
  "packs/in/lenders.json",
  "packs/in/insurers.json"
];

const requiredMerchantFiles = [
  "ai-tools.json",
  "cabs.json",
  "food.json",
  "gyms.json",
  "ott.json",
  "pharmacies.json",
  "quick-commerce.json",
  "travel.json"
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const confidenceValues = new Set(["high", "medium", "low"]);
const statusValues = new Set(["active", "inactive", "merged", "watch"]);
const sourceTypes = new Set(["official", "provider", "trusted_aggregator", "curated"]);
const blockedPatterns = [
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /client[_-]?secret/i,
  new RegExp("\\." + "env", "i"),
  /\/Users\//,
  /(?:^|["'\s])(attachments|data|exports)\//
];

async function readJson(relativePath, errors) {
  try {
    const raw = await readFile(path.join(repoRoot, relativePath), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function requireString(row, field, label, errors) {
  if (typeof row[field] !== "string" || row[field].trim() === "") {
    errors.push(`${label}: missing string field ${field}`);
  }
}

function validateSources(row, label, errors) {
  if (!Array.isArray(row.sources) || row.sources.length === 0) {
    errors.push(`${label}: sources must be a non-empty array`);
    return;
  }

  for (const [index, source] of row.sources.entries()) {
    const sourceLabel = `${label}.sources[${index}]`;
    if (!sourceTypes.has(source.source_type)) {
      errors.push(`${sourceLabel}: invalid source_type ${source.source_type}`);
    }
    requireString(source, "name", sourceLabel, errors);
    if (typeof source.url !== "string" || !source.url.startsWith("https://")) {
      errors.push(`${sourceLabel}: url must start with https://`);
    }
    if (typeof source.retrieved_at !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(source.retrieved_at)) {
      errors.push(`${sourceLabel}: retrieved_at must be YYYY-MM-DD`);
    }
  }
}

function validateSeedRow(row, label, errors) {
  requireString(row, "id", label, errors);
  requireString(row, "display_name", label, errors);
  requireString(row, "legal_name", label, errors);
  requireString(row, "category", label, errors);
  if (typeof row.id === "string" && !slugPattern.test(row.id)) {
    errors.push(`${label}: id must be a lowercase stable slug`);
  }
  if (!Array.isArray(row.aliases) || row.aliases.some((alias) => typeof alias !== "string" || alias.trim() === "")) {
    errors.push(`${label}: aliases must be non-empty strings`);
  }
  if (!confidenceValues.has(row.confidence)) {
    errors.push(`${label}: confidence must be high, medium, or low`);
  }
  if (!statusValues.has(row.status)) {
    errors.push(`${label}: status must be active, inactive, merged, or watch`);
  }
  validateSources(row, label, errors);
}

function validateMetadata(doc, label, errors) {
  for (const field of ["pack_id", "country", "version", "coverage", "retrieved_at"]) {
    requireString(doc, field, label, errors);
  }
  if (doc.pack_id !== "in") {
    errors.push(`${label}: pack_id must be in`);
  }
  if (doc.country !== "IN") {
    errors.push(`${label}: country must be IN`);
  }
}

function rowsForProviderDoc(doc) {
  if (Array.isArray(doc.providers)) return doc.providers;
  if (Array.isArray(doc.issuers)) return doc.issuers;
  return [];
}

function validateProviderDoc(doc, relativePath, errors) {
  validateMetadata(doc, relativePath, errors);
  const rows = rowsForProviderDoc(doc);
  if (rows.length === 0) {
    errors.push(`${relativePath}: expected providers or issuers array`);
  }
  for (const row of rows) {
    validateSeedRow(row, `${relativePath}:${row?.id ?? "unknown"}`, errors);
  }
}

function validateCreditCards(doc, errors) {
  if (!Array.isArray(doc.products) || doc.products.length === 0) {
    errors.push("packs/in/credit-cards.json: products must be a non-empty array");
    return;
  }
  const issuerIds = new Set(doc.issuers.map((issuer) => issuer.id));
  const productIds = new Set();
  for (const product of doc.products) {
    validateSeedRow(product, `packs/in/credit-cards.json:${product?.id ?? "unknown"}`, errors);
    requireString(product, "issuer_id", `packs/in/credit-cards.json:${product?.id ?? "unknown"}`, errors);
    if (!issuerIds.has(product.issuer_id)) {
      errors.push(`packs/in/credit-cards.json:${product.id}: unknown issuer_id ${product.issuer_id}`);
    }
    if (productIds.has(product.id)) {
      errors.push(`packs/in/credit-cards.json:${product.id}: duplicate product id`);
    }
    productIds.add(product.id);
  }
}

function validateGmailTemplates(doc, knownProviderIds, errors) {
  validateMetadata(doc, "packs/in/gmail-templates.json", errors);
  if (!Array.isArray(doc.templates) || doc.templates.length === 0) {
    errors.push("packs/in/gmail-templates.json: templates must be a non-empty array");
    return;
  }

  const templateIds = new Set();
  for (const template of doc.templates) {
    const label = `packs/in/gmail-templates.json:${template?.id ?? "unknown"}`;
    requireString(template, "id", label, errors);
    requireString(template, "provider_id", label, errors);
    requireString(template, "doc_type", label, errors);
    if (template.id && !slugPattern.test(template.id)) {
      errors.push(`${label}: id must be a lowercase stable slug`);
    }
    if (templateIds.has(template.id)) {
      errors.push(`${label}: duplicate template id`);
    }
    templateIds.add(template.id);
    if (!knownProviderIds.has(template.provider_id)) {
      errors.push(`${label}: unknown provider_id ${template.provider_id}`);
    }
    for (const field of ["sender_hints", "subject_hints", "query_fragments", "attachment_mime_hints", "password_rule_tags"]) {
      if (!Array.isArray(template[field]) || template[field].some((item) => typeof item !== "string" || item.trim() === "")) {
        errors.push(`${label}: ${field} must be an array of non-empty strings`);
      }
    }
    if (!template.query_fragments?.includes("-in:spam") || !template.query_fragments?.includes("-in:trash")) {
      errors.push(`${label}: query_fragments must include -in:spam and -in:trash`);
    }
  }
}

async function validateMerchants(errors) {
  const merchantDir = "packs/in/merchants";
  let files = [];
  try {
    files = await readdir(path.join(repoRoot, merchantDir));
  } catch (error) {
    errors.push(`${merchantDir}: ${error.message}`);
    return;
  }

  for (const expectedFile of requiredMerchantFiles) {
    if (!files.includes(expectedFile)) {
      errors.push(`${merchantDir}: missing ${expectedFile}`);
    }
  }

  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const relativePath = `${merchantDir}/${file}`;
    const doc = await readJson(relativePath, errors);
    if (!doc) continue;
    validateMetadata(doc, relativePath, errors);
    if (doc.coverage !== "aggregator_expanded") {
      errors.push(`${relativePath}: coverage must be aggregator_expanded`);
    }
    if (!Array.isArray(doc.merchants) || doc.merchants.length === 0) {
      errors.push(`${relativePath}: merchants must be a non-empty array`);
      continue;
    }
    const merchantIds = new Set();
    for (const merchant of doc.merchants) {
      validateSeedRow(merchant, `${relativePath}:${merchant?.id ?? "unknown"}`, errors);
      if (merchantIds.has(merchant.id)) {
        errors.push(`${relativePath}:${merchant.id}: duplicate merchant id`);
      }
      merchantIds.add(merchant.id);
    }
  }
}

async function scanForBlockedText(errors) {
  const roots = ["packs", "schemas", "scripts", "tools"];
  const pending = roots.map((root) => path.join(repoRoot, root));

  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        const text = await readFile(fullPath, "utf8");
        for (const pattern of blockedPatterns) {
          if (pattern.test(text)) {
            errors.push(`${path.relative(repoRoot, fullPath)}: blocked local secret or runtime path pattern`);
          }
        }
      }
    }
  }
}

export async function validatePack() {
  const errors = [];
  const docs = new Map();
  const providerIds = new Set();

  for (const file of providerFiles) {
    const doc = await readJson(file, errors);
    if (!doc) continue;
    docs.set(file, doc);
    validateProviderDoc(doc, file, errors);
    for (const row of rowsForProviderDoc(doc)) {
      if (providerIds.has(row.id)) {
        errors.push(`${file}:${row.id}: duplicate provider id across files`);
      }
      providerIds.add(row.id);
    }
  }

  for (const file of regulatedProviderFiles) {
    const doc = docs.get(file);
    if (!doc) continue;
    for (const row of rowsForProviderDoc(doc)) {
      if (!row.sources?.some((source) => source.source_type === "official")) {
        errors.push(`${file}:${row.id}: regulated row must include an official source`);
      }
    }
  }

  const cards = docs.get("packs/in/credit-cards.json");
  if (cards) {
    validateCreditCards(cards, errors);
  }

  const gmailTemplates = await readJson("packs/in/gmail-templates.json", errors);
  if (gmailTemplates) {
    validateGmailTemplates(gmailTemplates, providerIds, errors);
  }

  await validateMerchants(errors);
  await scanForBlockedText(errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await validatePack();
  if (!result.ok) {
    console.error(result.errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log("India pack validation passed");
}
