import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const specDir = join(repoRoot, "../forsyteco-spec");

export const STANDARD_IMPORTS = ["error.json", "healthcheck.json", "common.json"];

export const APP_EXTRA_IMPORTS = {
  data_gateway: ["data_gateway_broker.json"],
};

export function loadSpec(filename) {
  return JSON.parse(readFileSync(join(specDir, filename), "utf8"));
}

export function wrapService(spec, applicationKey) {
  return {
    ...spec,
    organization: { key: "forsyte" },
    application: { key: applicationKey },
    version: "0.0.1",
  };
}

export function specKey(specName) {
  return specName.endsWith(".json") ? specName.slice(0, -5) : specName;
}

export function importFilesFor(specName) {
  const key = specKey(specName);
  if (key === "healthcheck") {
    return [];
  }
  const extra = APP_EXTRA_IMPORTS[key] ?? [];
  return [...STANDARD_IMPORTS, ...extra];
}

export function getAttribute(form, name, fallback) {
  const attribute = (form.attributes ?? []).find((entry) => entry.name === name);
  return attribute?.value ?? fallback;
}

export function buildForm(specName, options = {}) {
  const specFile = specName.endsWith(".json") ? specName : `${specName}.json`;
  const spec = loadSpec(specFile);
  const importFiles = options.importFiles ?? importFilesFor(specName);
  const attributes = options.attributes ?? [
    { name: "api_prefix", value: "/v1alpha" },
    { name: "bundle_imports", value: STANDARD_IMPORTS.join(",") },
  ];

  return {
    service: wrapService(spec, spec.name),
    imported_services: importFiles.map((file) => {
      const imported = loadSpec(file);
      return wrapService(imported, imported.name);
    }),
    attributes,
  };
}

export function bundleImportsFor(requestedApps) {
  const bundled = new Set();
  for (const app of requestedApps) {
    for (const file of importFilesFor(app)) {
      bundled.add(specKey(file));
    }
  }
  return [...bundled];
}

export function applicationDirsFor(apps) {
  const dirs = new Set(bundleImportsFor(apps));
  for (const app of apps) {
    dirs.add(specKey(app));
  }
  return [...dirs];
}
