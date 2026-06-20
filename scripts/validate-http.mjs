/**
 * HTTP validation against running generator service (localhost:7050).
 * Run: pnpm start:dev (separate terminal) && node scripts/validate-http.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildForm, STANDARD_IMPORTS, APP_EXTRA_IMPORTS } from "./lib/build-form.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.GENERATOR_URL ?? "http://127.0.0.1:7050";

function importFilesForSpec(specFile) {
  const key = specFile.replace(".json", "");
  if (key === "healthcheck") {
    return [];
  }
  const extra = APP_EXTRA_IMPORTS[key] ?? [];
  return [...STANDARD_IMPORTS, ...extra];
}

async function invoke(generatorKey, form) {
  const response = await fetch(`${baseUrl}/invocations/${generatorKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  const body = await response.json();
  return { status: response.status, body };
}

const checks = [
  {
    spec: "healthcheck.json",
    dtoFiles: ["healthcheck-dtos.ts"],
    ctrlFiles: ["healthcheck-controllers.ts"],
  },
  { spec: "error.json", dtoFiles: ["error-dtos.ts"], ctrlFiles: [] },
  {
    spec: "address.json",
    dtoFiles: ["address-dtos.ts"],
    ctrlFiles: ["address-controllers.ts"],
  },
  {
    spec: "address_match.json",
    dtoFiles: ["address-match-enums.ts", "address-match-dtos.ts"],
    ctrlFiles: ["address-match-controllers.ts"],
  },
  {
    spec: "feature_flag.json",
    dtoFiles: ["feature-flag-dtos.ts"],
    ctrlFiles: ["feature-flag-controllers.ts"],
  },
  {
    spec: "data_gateway.json",
    dtoFiles: ["data-gateway-dtos.ts"],
    ctrlFiles: ["data-gateway-controllers.ts"],
  },
];

let failed = 0;

console.log(`Testing HTTP generator at ${baseUrl}\n`);

try {
  const health = await fetch(`${baseUrl}/_internal_/healthcheck`);
  if (health.status !== 200) {
    throw new Error(`Healthcheck failed: ${health.status}`);
  }
  console.log("PASS  server healthcheck");
} catch {
  console.error("FAIL  server not reachable. Start with: pnpm start:dev");
  process.exit(1);
}

for (const check of checks) {
  const form = buildForm(check.spec, { importFiles: importFilesForSpec(check.spec) });
  const label = form.service.name;

  for (const generatorKey of ["forsyte_nestjs_dtos", "forsyte_nestjs_controllers"]) {
    const expectedFiles = generatorKey.includes("dtos") ? check.dtoFiles : check.ctrlFiles;
    if (expectedFiles.length === 0 && generatorKey.includes("controllers")) {
      const { status, body } = await invoke(generatorKey, form);
      if (status !== 200 || body.files.length !== 0) {
        console.log(`FAIL  ${label} ${generatorKey}: expected empty files, got ${body.files?.length}`);
        failed += 1;
      } else {
        console.log(`PASS  ${label} ${generatorKey} (no resources)`);
      }
      continue;
    }

    const { status, body } = await invoke(generatorKey, form);
    if (status !== 200) {
      console.log(`FAIL  ${label} ${generatorKey}: HTTP ${status}`);
      failed += 1;
      continue;
    }

    const names = body.files.map((f) => f.name);
    const missing = expectedFiles.filter((f) => !names.includes(f));
    if (missing.length > 0) {
      console.log(`FAIL  ${label} ${generatorKey}: missing files ${missing.join(", ")}`);
      failed += 1;
    } else {
      console.log(`PASS  ${label} ${generatorKey} -> ${names.join(", ")}`);
    }
  }
}

if (failed > 0) {
  console.log(`\n${failed} HTTP check(s) failed`);
  process.exit(1);
}

console.log("\nAll HTTP checks passed");
