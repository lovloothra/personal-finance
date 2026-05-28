import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  const raw = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(raw);
}

function runValidator() {
  return spawnSync(process.execPath, ["tools/validate-pack-in.mjs"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("India pack validation CLI exits cleanly", () => {
  const result = runValidator();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("all provider IDs are lowercase stable slugs and unique across provider files", async () => {
  const files = [
    "packs/in/banks.json",
    "packs/in/credit-cards.json",
    "packs/in/brokers.json",
    "packs/in/investment-platforms.json",
    "packs/in/lenders.json",
    "packs/in/insurers.json"
  ];

  const ids = [];
  for (const file of files) {
    const doc = await readJson(file);
    const rows = Array.isArray(doc.providers) ? doc.providers : doc.issuers;
    for (const row of rows) {
      ids.push(row.id);
      assert.match(row.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${file}: ${row.id}`);
    }
  }

  assert.equal(new Set(ids).size, ids.length, "provider IDs must be globally unique");
});

test("regulated institution rows include official provenance", async () => {
  const files = [
    "packs/in/banks.json",
    "packs/in/brokers.json",
    "packs/in/investment-platforms.json",
    "packs/in/lenders.json",
    "packs/in/insurers.json"
  ];

  for (const file of files) {
    const doc = await readJson(file);
    for (const row of doc.providers) {
      assert.ok(row.sources.some((source) => source.source_type === "official"), `${file}: ${row.id}`);
      assert.ok(row.sources.some((source) => source.url.startsWith("https://")), `${file}: ${row.id}`);
    }
  }
});

test("credit-card product rows include provenance and confidence labels", async () => {
  const doc = await readJson("packs/in/credit-cards.json");
  assert.ok(doc.products.length >= 25, "seed should include common card products");

  for (const product of doc.products) {
    assert.ok(product.issuer_id, product.id);
    assert.ok(product.sources.length > 0, product.id);
    assert.match(product.confidence, /^(high|medium|low)$/);
  }
});

test("merchant seed files are marked aggregator-expanded and have confidence labels", async () => {
  const merchantFiles = [
    "packs/in/merchants/ai-tools.json",
    "packs/in/merchants/cabs.json",
    "packs/in/merchants/food.json",
    "packs/in/merchants/gyms.json",
    "packs/in/merchants/ott.json",
    "packs/in/merchants/pharmacies.json",
    "packs/in/merchants/quick-commerce.json",
    "packs/in/merchants/travel.json"
  ];

  for (const file of merchantFiles) {
    const doc = await readJson(file);
    assert.equal(doc.coverage, "aggregator_expanded", file);
    assert.ok(doc.merchants.length >= 4, file);
    for (const merchant of doc.merchants) {
      assert.match(merchant.confidence, /^(high|medium|low)$/);
      assert.ok(merchant.sources.length > 0, merchant.id);
    }
  }
});

test("Gmail templates reference known providers and include base exclusions", async () => {
  const templates = await readJson("packs/in/gmail-templates.json");
  const banks = await readJson("packs/in/banks.json");
  const cards = await readJson("packs/in/credit-cards.json");
  const knownProviders = new Set([
    ...banks.providers.map((row) => row.id),
    ...cards.issuers.map((row) => row.id)
  ]);

  assert.ok(templates.templates.length >= 12, "seed should include common statement templates");
  for (const template of templates.templates) {
    assert.ok(knownProviders.has(template.provider_id), template.provider_id);
    assert.ok(template.query_fragments.includes("-in:spam"));
    assert.ok(template.query_fragments.includes("-in:trash"));
    assert.ok(template.sender_hints.length > 0, template.id);
    assert.ok(template.subject_hints.length > 0, template.id);
  }
});

test("pack files do not contain local secrets, tokens, or runtime paths", () => {
  const result = spawnSync("rg", ["-n", "(oauth|refresh_token|access_token|client_secret|\\.env|/Users/|attachments/|data/|exports/)", "packs", "schemas", "scripts", "tools"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.notEqual(result.error?.code, "ENOENT", "ripgrep must be available for secret scan");
  assert.equal(result.status, 1, result.stdout);
});

test("refresh script can list source-backed inputs without network access", () => {
  const result = spawnSync(process.execPath, ["scripts/refresh-pack-in.mjs", "--list-sources"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const listed = JSON.parse(result.stdout);
  assert.ok(listed.some((source) => source.id === "rbi-scheduled-banks"));
  assert.ok(listed.some((source) => source.id === "sebi-stock-brokers"));
  assert.ok(listed.some((source) => source.id === "irdai-life-insurers"));
  assert.ok(listed.every((source) => source.url.startsWith("https://")));
});
