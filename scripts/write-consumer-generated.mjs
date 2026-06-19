/**
 * Write generated output to a consumer repo without the HTTP server.
 * Usage: node scripts/write-consumer-generated.mjs <consumer-root> <app> [app2...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { applicationDirsFor, buildForm, bundleImportsFor, specKey } from "./lib/build-form.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const require = createRequire(import.meta.url);

const { generateNestJsDtos } = require(join(repoRoot, "dist/generators/implementations/nestjs-dtos/generate-dtos"));
const { generateNestJsControllers } = require(
  join(repoRoot, "dist/generators/implementations/nestjs-controllers/generate-controllers"),
);

function appOutputDir(appName) {
  return specKey(appName).replace(/_/g, "-");
}

async function writeApp(outRoot, specName) {
  const form = buildForm(specName);
  const files = [...(await generateNestJsDtos(form)), ...(await generateNestJsControllers(form))];
  for (const file of files) {
    const dir = join(outRoot, file.dir.replace(/^generated\//, ""));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file.name), file.contents, "utf8");
  }
}

const consumerRoot = process.argv[2];
const apps = process.argv.slice(3);

if (!consumerRoot || apps.length === 0) {
  console.error("Usage: node scripts/write-consumer-generated.mjs <consumer-root> <app> [app2...]");
  process.exit(1);
}

const outRoot = join(consumerRoot, "src", "generated");
mkdirSync(outRoot, { recursive: true });

const bundled = bundleImportsFor(apps);
for (const importApp of bundled) {
  await writeApp(outRoot, importApp);
}
for (const app of apps) {
  await writeApp(outRoot, app);
}

for (const appDir of applicationDirsFor(apps)) {
  console.log(`  wrote ${join(outRoot, appOutputDir(appDir))}`);
}

const tsconfig = {
  extends: "../../tsconfig.json",
  compilerOptions: {
    noEmit: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    strictPropertyInitialization: false,
  },
  include: ["./**/*.ts"],
};
writeFileSync(join(outRoot, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
console.log(`Done. Output: ${outRoot}`);
