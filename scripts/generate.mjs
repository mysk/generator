/**
 * Generate code from forsyteco-spec via the local generator service.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applicationDirsFor,
  buildForm,
  bundleImportsFor,
  specKey,
} from "./lib/build-form.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function resolveOutRoot() {
  const consumerRoot = process.env.GENERATED_OUTPUT_ROOT;
  if (consumerRoot) {
    return join(consumerRoot, "src", "generated");
  }
  return join(repoRoot, "generated");
}

function appOutputDir(appName) {
  return specKey(appName).replace(/_/g, "-");
}

const outRoot = resolveOutRoot();
const isConsumerOutput = Boolean(process.env.GENERATED_OUTPUT_ROOT);
const baseUrl = process.env.GENERATOR_URL ?? "http://127.0.0.1:7050";
const HEALTHCHECK_RETRIES = 30;
const HEALTHCHECK_INTERVAL_MS = 1000;
const GENERATORS = ["forsyte_nestjs_dtos", "forsyte_nestjs_controllers"];

async function waitForServer() {
  for (let attempt = 1; attempt <= HEALTHCHECK_RETRIES; attempt += 1) {
    try {
      const health = await fetch(`${baseUrl}/_internal_/healthcheck`);
      if (health.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }
    if (attempt === 1) {
      console.log(`Waiting for generator at ${baseUrl}...`);
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTHCHECK_INTERVAL_MS));
  }
  console.error(`Generator not reachable at ${baseUrl}`);
  console.error("Start it first: pnpm start:dev");
  process.exit(1);
}

async function invoke(generatorKey, form) {
  const response = await fetch(`${baseUrl}/invocations/${generatorKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${generatorKey} failed (${response.status}): ${text}`);
  }
  return response.json();
}

function writeGeneratedTsconfig() {
  const extendsPath = isConsumerOutput ? "../../tsconfig.json" : "../tsconfig.json";
  const tsconfig = `{
  "extends": "${extendsPath}",
  "compilerOptions": {
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false
  },
  "include": ["./**/*.ts"]
}
`;
  const path = join(outRoot, "tsconfig.json");
  writeFileSync(path, tsconfig, "utf8");
  console.log(`  wrote ${path}`);
}

function writeFiles(files) {
  for (const file of files) {
    const dir = join(outRoot, file.dir.replace(/^generated\//, ""));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, file.name);
    writeFileSync(path, file.contents, "utf8");
    console.log(`  wrote ${path}`);
  }
}

async function generateApp(specName) {
  const form = buildForm(specName);
  const label = form.service.name ?? specName;

  console.log(`\n${label} (from ${specKey(specName)}.json)`);

  for (const generatorKey of GENERATORS) {
    const { files } = await invoke(generatorKey, form);
    if (files.length === 0) {
      console.log(`  ${generatorKey}: (no files)`);
      continue;
    }
    console.log(`  ${generatorKey}:`);
    writeFiles(files);
  }
}

const apps = process.argv.slice(2);
if (apps.length === 0) {
  console.error("Usage: pnpm generate <app> [app2 ...]");
  console.error("Example: pnpm generate address feature_flag");
  process.exit(1);
}

await waitForServer();

mkdirSync(outRoot, { recursive: true });
for (const appDir of applicationDirsFor(apps)) {
  rmSync(join(outRoot, appOutputDir(appDir)), { recursive: true, force: true });
}
writeGeneratedTsconfig();

console.log(`Generating into ${outRoot}/`);
console.log(`Server: ${baseUrl}`);

const bundled = bundleImportsFor(apps);
for (const importApp of bundled) {
  await generateApp(importApp);
}

for (const app of apps) {
  await generateApp(app);
}

console.log(`\nDone. Open: ${outRoot}`);
