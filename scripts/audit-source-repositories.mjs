import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const productRoot = path.resolve(scriptDirectory, "..");
const workspaceRoot = path.resolve(productRoot, "..");
const outputDirectory = path.join(productRoot, "docs", "backend-source-audit");

const repositoryNames = [
  "langfuse-main",
  "AIOstack-main",
  "Claw-Hunter-main",
  "shadow-ai-guard-main",
  "mem0-main",
  "forge-orchestrator-main",
  "claw-orchestrator-main",
];

const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const sourceExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".ps1",
  ".py",
  ".rs",
  ".sh",
  ".ts",
  ".tsx",
]);

const textExtensions = new Set([
  ...sourceExtensions,
  ".css",
  ".env",
  ".graphql",
  ".html",
  ".json",
  ".md",
  ".sql",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const licenseByRepository = {
  "langfuse-main": "MIT_CORE_WITH_SEPARATE_ENTERPRISE_DIRECTORIES",
  "AIOstack-main": "APACHE-2.0",
  "Claw-Hunter-main": "MIT",
  "shadow-ai-guard-main": "APACHE-2.0_WITH_NOTICE",
  "mem0-main": "APACHE-2.0",
  "forge-orchestrator-main": "FSL-1.1-ALV2_REFERENCE_ONLY_UNTIL_CONVERSION",
  "claw-orchestrator-main": "MIT",
};

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function classifyFile(relativePath, extension) {
  const normalized = relativePath.toLowerCase();
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(normalized) || /\.(test|spec)\./.test(normalized)) return "test";
  if (/(^|\/)(docs?|examples?)(\/|$)/.test(normalized) || [".md", ".txt"].includes(extension)) return "documentation";
  if (/(^|\/)(deploy|deployment|charts?|helm|docker|k8s|kubernetes|terraform)(\/|$)/.test(normalized) || /dockerfile|compose/.test(normalized)) return "deployment";
  if (sourceExtensions.has(extension)) return "source";
  if ([".json", ".yaml", ".yml", ".toml", ".env"].includes(extension) || /(^|\/)(package-lock|pnpm-lock|yarn\.lock)/.test(normalized)) return "configuration";
  if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2"].includes(extension)) return "asset";
  return "other";
}

function candidateDomain(relativePath) {
  const value = relativePath.toLowerCase();
  const matches = [];
  const rules = [
    ["discovery", /(discover|scanner|scan|census|inventory|shadow|endpoint|extension|browser)/],
    ["identity-authority", /(identity|passport|auth|permission|policy|mandate|governance|rbac|access)/],
    ["telemetry-evidence", /(trace|telemetry|event|observ|audit|evidence|log|metric|score)/],
    ["orchestration", /(orchestrat|workflow|session|run|kernel|queue|worker|executor|handoff|circuit)/],
    ["human-approval", /(human|approval|gate|review|decision)/],
    ["memory", /(memory|mem0|vector|embedding|knowledge)/],
    ["deployment", /(deploy|docker|compose|helm|chart|install|setup|k8s|kubernetes)/],
    ["api-contract", /(api|route|server|contract|schema|openapi)/],
  ];
  for (const [label, expression] of rules) if (expression.test(value)) matches.push(label);
  return matches.join("|") || "general";
}

function licenseScope(repository, relativePath) {
  if (repository === "langfuse-main" && /(^|\/)(ee|web\/src\/ee|worker\/src\/ee)(\/|$)/i.test(relativePath)) {
    return "EXCLUDE_ENTERPRISE_LICENSE";
  }
  if (repository === "forge-orchestrator-main") return "REFERENCE_ONLY";
  return "REUSE_SUBJECT_TO_LICENSE_AND_ATTRIBUTION";
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function locateRepositoryRoot(containerPath) {
  const children = await readdir(containerPath, { withFileTypes: true });
  const visible = children.filter((entry) => !entry.name.startsWith("."));
  if (visible.length === 1 && visible[0].isDirectory()) return path.join(containerPath, visible[0].name);
  return containerPath;
}

async function walk(directory, repositoryRoot, repositoryName, rows) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(repositoryRoot, absolutePath));
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(absolutePath, repositoryRoot, repositoryName, rows);
      continue;
    }
    if (!entry.isFile()) continue;
    const metadata = await stat(absolutePath);
    const extension = path.extname(entry.name).toLowerCase();
    rows.push({
      repository: repositoryName,
      relativePath,
      extension: extension || "[none]",
      bytes: metadata.size,
      sha256: await sha256(absolutePath),
      classification: classifyFile(relativePath, extension),
      candidateDomain: candidateDomain(relativePath),
      repositoryLicense: licenseByRepository[repositoryName],
      licenseScope: licenseScope(repositoryName, relativePath),
      absolutePath,
    });
  }
}

function extractSymbols(extension, content) {
  const symbols = new Set();
  const expressions = [];
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extension)) {
    expressions.push(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
      /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    );
  } else if (extension === ".py") {
    expressions.push(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm, /^class\s+([A-Za-z_]\w*)/gm);
  } else if (extension === ".rs") {
    expressions.push(/\b(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/g, /\b(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g);
  } else if ([".sh", ".ps1"].includes(extension)) {
    expressions.push(/^function\s+([A-Za-z_][\w-]*)/gm, /^([A-Za-z_][\w-]*)\s*\(\)\s*\{/gm);
  } else if ([".go", ".java", ".cs", ".c", ".cc", ".cpp"].includes(extension)) {
    expressions.push(/\b(?:class|interface|struct|enum|func)\s+([A-Za-z_]\w*)/g);
  }
  for (const expression of expressions) {
    for (const match of content.matchAll(expression)) symbols.add(match[1]);
  }
  return [...symbols].sort();
}

const inventory = [];
const roots = new Map();
for (const repositoryName of repositoryNames) {
  const root = await locateRepositoryRoot(path.join(workspaceRoot, repositoryName));
  roots.set(repositoryName, root);
  await walk(root, root, repositoryName, inventory);
}

await mkdir(outputDirectory, { recursive: true });

const inventoryHeader = ["repository", "relative_path", "extension", "bytes", "sha256", "classification", "candidate_domain", "repository_license", "license_scope"];
const inventoryLines = [inventoryHeader.map(csvCell).join(",")];
for (const row of inventory) {
  inventoryLines.push([
    row.repository,
    row.relativePath,
    row.extension,
    row.bytes,
    row.sha256,
    row.classification,
    row.candidateDomain,
    row.repositoryLicense,
    row.licenseScope,
  ].map(csvCell).join(","));
}
await writeFile(path.join(outputDirectory, "FILE_INVENTORY.csv"), `${inventoryLines.join("\n")}\n`, "utf8");

const symbolLines = [["repository", "relative_path", "extension", "symbols"].map(csvCell).join(",")];
for (const row of inventory) {
  if (!sourceExtensions.has(row.extension) || row.bytes > 2_000_000) continue;
  const content = await readFile(row.absolutePath, "utf8");
  const symbols = extractSymbols(row.extension, content);
  if (symbols.length > 0) symbolLines.push([row.repository, row.relativePath, row.extension, symbols.join("|")].map(csvCell).join(","));
}
await writeFile(path.join(outputDirectory, "SYMBOL_INDEX.csv"), `${symbolLines.join("\n")}\n`, "utf8");

const summary = [
  "# Candidate backend source inventory",
  "",
  "This inventory covers every regular file in the seven supplied source trees after excluding generated dependency and build directories (`.git`, `node_modules`, `.venv`, `dist`, `build`, `.next`, `target`, caches and vendored dependencies). It is an audit aid, not a statement that every file is safe or useful to copy.",
  "",
  "| Repository | Root | Files | Source | Tests | Deployment | License posture |",
  "|---|---|---:|---:|---:|---:|---|",
];
for (const repositoryName of repositoryNames) {
  const rows = inventory.filter((row) => row.repository === repositoryName);
  const count = (classification) => rows.filter((row) => row.classification === classification).length;
  summary.push(`| ${repositoryName} | \`${toPosix(roots.get(repositoryName))}\` | ${rows.length} | ${count("source")} | ${count("test")} | ${count("deployment")} | ${licenseByRepository[repositoryName]} |`);
}
summary.push(
  "",
  "## Generated outputs",
  "",
  "- `FILE_INVENTORY.csv`: path, size, digest, classification, candidate domain and license scope for each retained file.",
  "- `SYMBOL_INDEX.csv`: statically extracted named functions/classes/exports for supported source languages. It is intentionally mechanical and must be validated against the source before reuse.",
  "",
  `Generated at ${new Date().toISOString()}.`,
  "",
);
await writeFile(path.join(outputDirectory, "README.md"), summary.join("\n"), "utf8");

console.log(`Indexed ${inventory.length} files across ${repositoryNames.length} repositories.`);
console.log(outputDirectory);
