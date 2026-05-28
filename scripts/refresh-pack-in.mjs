import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, "tmp", "pack-in-refresh");

const sources = [
  {
    id: "rbi-scheduled-banks",
    label: "RBI scheduled commercial banks",
    url: "https://m.rbi.org.in/scripts/bs_viewcontent.aspx?Id=3657",
    kind: "banks",
    parser: "bank-list"
  },
  {
    id: "rbi-card-statistics",
    label: "RBI bank-wise card statistics",
    url: "https://www.rbi.org.in/Scripts/ATMView.aspx/ATMView.aspx",
    kind: "credit-card-issuers",
    parser: "link-list"
  },
  {
    id: "sahamati-entity-coverage-proxy",
    label: "Sahamati AA ecosystem page as a coverage proxy for missing regulated entities",
    url: "https://sahamati.org.in/fip-fiu-in-account-aggregators-ecosystem/",
    kind: "coverage-proxy",
    parser: "sahamati-ecosystem-table"
  },
  {
    id: "sebi-stock-brokers",
    label: "SEBI registered stock brokers",
    url: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=30",
    kind: "brokers",
    parser: "sebi-rows"
  },
  {
    id: "sebi-recognised-intermediaries",
    label: "SEBI recognised intermediaries",
    url: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognised=yes",
    kind: "investment-platforms",
    parser: "link-list"
  },
  {
    id: "irdai-life-insurers",
    label: "IRDAI life insurers",
    url: "https://irdai.gov.in/en/insurers/life-insurers",
    kind: "insurers",
    parser: "link-list"
  },
  {
    id: "irdai-health-insurers",
    label: "IRDAI health insurers",
    url: "https://irdai.gov.in/insurers/health-insurers",
    kind: "insurers",
    parser: "link-list"
  },
  {
    id: "irdai-general-insurers",
    label: "IRDAI general insurers",
    url: "https://irdai.gov.in/insurers/general-insurers",
    kind: "insurers",
    parser: "link-list"
  },
  {
    id: "amfi-members",
    label: "AMFI members",
    url: "https://www.amfiindia.com/aboutamfi?tab=members",
    kind: "asset-managers",
    parser: "link-list"
  },
  {
    id: "pfrda-pension-funds",
    label: "PFRDA pension funds",
    url: "https://www.pfrda.org.in/web/pfrda/intermediaries/registered-intermediaries/pension-funds",
    kind: "pension-funds",
    parser: "link-list"
  },
  {
    id: "npci-upi-members",
    label: "NPCI UPI live members",
    url: "https://www.npci.org.in/product/upi/all-members",
    kind: "upi-apps",
    parser: "link-list"
  },
  {
    id: "rbi-nbfc-registry",
    label: "RBI NBFC registry",
    url: "https://www.rbi.org.in/Scripts/NBFCCitiChart.aspx",
    kind: "lenders",
    parser: "link-list"
  },
  {
    id: "bankbazaar-credit-card-products",
    label: "BankBazaar credit card product catalog",
    url: "https://www.bankbazaar.com/credit-card.html",
    kind: "card-products",
    parser: "link-list"
  },
  {
    id: "cardinsider-credit-card-products",
    label: "Card Insider credit card product catalog",
    url: "https://cardinsider.com/",
    kind: "card-products",
    parser: "link-list"
  }
];

function parseArgs(argv) {
  const args = {
    listSources: false,
    selectedIds: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list-sources") {
      args.listSources = true;
    } else if (arg === "--source") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--source requires a source id");
      }
      args.selectedIds.push(next);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function compactText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function extractLinks(html) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const label = compactText(match[2]).replace(/\s+/g, " ").trim();
    if (label.length >= 3) {
      links.push({
        label,
        href: match[1]
      });
    }
  }
  return links.slice(0, 250);
}

function extractBankList(html) {
  const lines = compactText(html).split("\n");
  const rows = [];
  let currentSection = "";
  for (const line of lines) {
    if (/List of Scheduled/i.test(line)) {
      currentSection = line;
      continue;
    }
    if (/^\d+\.\s+/.test(line) && currentSection) {
      rows.push({
        section: currentSection,
        name: line.replace(/^\d+\.\s+/, "")
      });
    }
  }
  return rows;
}

function extractSebiRows(html) {
  const lines = compactText(html).split("\n");
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "Name" && lines[index + 1] && lines[index + 2] === "Trade Name") {
      rows.push({
        name: lines[index + 1],
        trade_name: lines[index + 3] ?? lines[index + 1]
      });
    }
  }
  return rows.slice(0, 500);
}

function extractSahamatiCoverageCandidates(html) {
  const rows = [];
  const table = html.match(/<table\b[^>]*id=["']tablepress-35["'][^>]*>[\s\S]*?<\/table>/i)?.[0] ?? html;
  for (const rowMatch of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cellMatch) => compactText(cellMatch[1]).replace(/\s+/g, " ").trim());
    if (cells.length < 8) continue;
    const serialNumber = Number(cells[0].replace(/\D/g, ""));
    if (!Number.isFinite(serialNumber) || serialNumber <= 0) continue;
    rows.push({
      serial_number: serialNumber,
      organisation_name: cells[1],
      member_type: cells[2],
      category: cells[3],
      regulator: cells[4],
      aa_implementation_stage: cells[5],
      fip_implementation_stage: cells[6],
      fiu_implementation_stage: cells[7]
    });
  }
  return rows;
}

function parseSnapshot(source, html) {
  if (source.parser === "bank-list") {
    return extractBankList(html);
  }
  if (source.parser === "sebi-rows") {
    return extractSebiRows(html);
  }
  if (source.parser === "sahamati-ecosystem-table") {
    return extractSahamatiCoverageCandidates(html);
  }
  return extractLinks(html);
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "personal-finance-pack-refresh/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`${source.id}: HTTP ${response.status}`);
  }
  return response.text();
}

async function readCurrentPackSummary() {
  const files = [
    "packs/in/banks.json",
    "packs/in/credit-cards.json",
    "packs/in/brokers.json",
    "packs/in/investment-platforms.json",
    "packs/in/lenders.json",
    "packs/in/insurers.json"
  ];
  const summary = {};
  for (const file of files) {
    const doc = JSON.parse(await readFile(path.join(repoRoot, file), "utf8"));
    const rows = doc.providers ?? doc.issuers ?? [];
    summary[file] = rows.map((row) => row.id).sort();
  }
  return summary;
}

async function refresh(selectedIds) {
  const selected = selectedIds.length > 0
    ? sources.filter((source) => selectedIds.includes(source.id))
    : sources;

  const missing = selectedIds.filter((id) => !sources.some((source) => source.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown source id(s): ${missing.join(", ")}`);
  }

  await mkdir(path.join(outputRoot, "snapshots"), { recursive: true });
  const results = [];
  for (const source of selected) {
    const html = await fetchSource(source);
    const parsed = parseSnapshot(source, html);
    await writeFile(path.join(outputRoot, "snapshots", `${source.id}.html`), html);
    await writeFile(path.join(outputRoot, "snapshots", `${source.id}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
    results.push({
      id: source.id,
      label: source.label,
      url: source.url,
      parsed_count: parsed.length
    });
  }

  const summary = {
    refreshed_at: new Date().toISOString(),
    sources: results,
    current_pack_ids: await readCurrentPackSummary()
  };
  await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

const args = parseArgs(process.argv.slice(2));

if (args.listSources) {
  console.log(JSON.stringify(sources.map(({ id, label, url, kind }) => ({ id, label, url, kind })), null, 2));
} else {
  const summary = await refresh(args.selectedIds);
  console.log(`Wrote ${summary.sources.length} source snapshot(s) to ${path.relative(repoRoot, outputRoot)}`);
}
