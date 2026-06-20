import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specDir = join(__dirname, "../../../forsyteco-spec");
const outDir = join(__dirname, "forms");

function loadSpec(filename) {
  return JSON.parse(readFileSync(join(specDir, filename), "utf8"));
}

function wrapService(spec, applicationKey) {
  return {
    ...spec,
    organization: { key: "forsyte" },
    application: { key: applicationKey },
    version: "0.0.1",
  };
}

mkdirSync(outDir, { recursive: true });

const healthcheckSpec = loadSpec("healthcheck.json");
writeFileSync(
  join(outDir, "healthcheck-invocation.json"),
  JSON.stringify(
    {
      service: wrapService(healthcheckSpec, "healthcheck"),
      imported_services: [],
      attributes: [],
    },
    null,
    2,
  ),
);

const addressSpec = loadSpec("address.json");
const errorSpec = loadSpec("error.json");
const commonSpec = loadSpec("common.json");

writeFileSync(
  join(outDir, "address-invocation.json"),
  JSON.stringify(
    {
      service: wrapService(addressSpec, "address"),
      imported_services: [
        wrapService(errorSpec, "error"),
        wrapService(healthcheckSpec, "healthcheck"),
        wrapService(commonSpec, "common"),
      ],
      attributes: [],
    },
    null,
    2,
  ),
);

const addressMatchSpec = loadSpec("address_match.json");
writeFileSync(
  join(outDir, "address-match-invocation.json"),
  JSON.stringify(
    {
      service: wrapService(addressMatchSpec, "address_match"),
      imported_services: [
        wrapService(errorSpec, "error"),
        wrapService(healthcheckSpec, "healthcheck"),
        wrapService(commonSpec, "common"),
      ],
      attributes: [],
    },
    null,
    2,
  ),
);

console.log("Wrote test/fixtures/forms/*.json");
