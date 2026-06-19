import { ApibuilderServiceJson, InvocationForm } from "../types";
import { applicationKeyToKebab, enumKeyToClassName, modelKeyToClassName, resolveApplicationKey } from "./naming";

export type TypeKind = "model" | "enum" | "union" | "primitive";

export interface TypeRecord {
  kind: TypeKind;
  name: string;
  service: ApibuilderServiceJson;
  namespace: string;
  imported: boolean;
}

export interface GeneratorContext {
  rootService: ApibuilderServiceJson;
  importedServices: ApibuilderServiceJson[];
  allServices: ApibuilderServiceJson[];
  typesByName: Map<string, TypeRecord>;
  sortedModelKeys: string[];
  sortedEnumKeys: string[];
  sortedUnionKeys: string[];
  unresolvedTypes: string[];
}

const PRIMITIVE_TYPES = new Set([
  "string",
  "uuid",
  "boolean",
  "integer",
  "long",
  "double",
  "decimal",
  "json",
  "object",
  "map",
  "unit",
  "date-iso8601",
  "date-time-iso8601",
]);

function shortNameCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

function parseFqType(type: string): { namespace: string; kind: TypeKind; name: string } | null {
  const match = /^(.+)\.(models|enums|unions)\.([a-z_]+)$/.exec(type);
  if (!match) {
    return null;
  }
  const [, namespace, kindSegment, name] = match;
  const kind = kindSegment === "models" ? "model" : kindSegment === "enums" ? "enum" : "union";
  return { namespace, kind, name };
}

function findServiceByNamespace(services: ApibuilderServiceJson[], namespace: string): ApibuilderServiceJson | null {
  return services.find((service) => service.namespace === namespace) ?? null;
}

function collectDependencies(typeName: string, service: ApibuilderServiceJson): Set<string> {
  const dependencies = new Set<string>();

  const model = service.models?.[typeName];
  if (model) {
    for (const field of model.fields) {
      addTypeDependency(field.type, dependencies);
    }
    return dependencies;
  }

  const union = service.unions?.[typeName];
  if (union) {
    for (const member of union.types) {
      dependencies.add(member.type);
    }
  }

  return dependencies;
}

function addTypeDependency(type: string, dependencies: Set<string>): void {
  if (PRIMITIVE_TYPES.has(type)) {
    return;
  }

  const arrayInner = /^\[(.+)\]$/.exec(type);
  if (arrayInner) {
    addTypeDependency(arrayInner[1], dependencies);
    return;
  }

  const mapInner = /^map\[(.+)\]$/.exec(type);
  if (mapInner) {
    addTypeDependency(mapInner[1], dependencies);
    return;
  }

  if (type === "map") {
    return;
  }

  const fq = parseFqType(type);
  if (fq) {
    dependencies.add(fq.name);
    return;
  }

  dependencies.add(type);
}

function topologicalSort(keys: string[], dependencyFor: (key: string) => Set<string>): string[] {
  const nodes = new Map<string, { after: Set<string> }>();
  for (const key of keys) {
    nodes.set(key, { after: new Set() });
  }

  for (const key of keys) {
    for (const dependency of dependencyFor(key)) {
      if (nodes.has(dependency)) {
        nodes.get(key)?.after.add(dependency);
      }
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    if (visiting.has(key)) {
      return;
    }
    visiting.add(key);
    const node = nodes.get(key);
    if (node) {
      for (const dependency of node.after) {
        visit(dependency);
      }
    }
    visiting.delete(key);
    visited.add(key);
    sorted.push(key);
  };

  for (const key of keys) {
    visit(key);
  }

  return sorted;
}

function indexServiceTypes(
  service: ApibuilderServiceJson,
  rootNamespace: string,
  typesByName: Map<string, TypeRecord>,
): void {
  const imported = service.namespace !== rootNamespace;

  for (const name of Object.keys(service.enums ?? {})) {
    typesByName.set(name, { kind: "enum", name, service, namespace: service.namespace, imported });
  }

  for (const name of Object.keys(service.models ?? {})) {
    typesByName.set(name, { kind: "model", name, service, namespace: service.namespace, imported });
  }

  for (const name of Object.keys(service.unions ?? {})) {
    typesByName.set(name, { kind: "union", name, service, namespace: service.namespace, imported });
  }
}

export function buildContext(form: InvocationForm): GeneratorContext {
  const rootService = form.service;
  const importedServices = form.imported_services ?? [];
  const allServices = [...importedServices, rootService];
  const typesByName = new Map<string, TypeRecord>();

  for (const service of allServices) {
    indexServiceTypes(service, rootService.namespace, typesByName);
  }

  const sortedModelKeys = topologicalSort(
    Object.keys(rootService.models ?? {}).sort(shortNameCompare),
    (key) => collectDependencies(key, rootService),
  );

  const sortedEnumKeys = Object.keys(rootService.enums ?? {}).sort(shortNameCompare);
  const sortedUnionKeys = topologicalSort(
    Object.keys(rootService.unions ?? {}).sort(shortNameCompare),
    (key) => collectDependencies(key, rootService),
  );

  const unresolvedTypes: string[] = [];

  const trackUnresolved = (type: string): void => {
    if (PRIMITIVE_TYPES.has(type) || type === "map") {
      return;
    }
    const arrayInner = /^\[(.+)\]$/.exec(type);
    if (arrayInner) {
      trackUnresolved(arrayInner[1]);
      return;
    }
    const mapInner = /^map\[(.+)\]$/.exec(type);
    if (mapInner) {
      trackUnresolved(mapInner[1]);
      return;
    }
    const fq = parseFqType(type);
    if (fq) {
      const owner = findServiceByNamespace(allServices, fq.namespace);
      if (!owner) {
        unresolvedTypes.push(type);
      }
      return;
    }
    if (!typesByName.has(type) && !rootService.models?.[type] && !rootService.enums?.[type] && !rootService.unions?.[type]) {
      unresolvedTypes.push(type);
    }
  };

  for (const model of Object.values(rootService.models ?? {})) {
    for (const field of model.fields) {
      trackUnresolved(field.type);
    }
  }

  for (const resource of Object.values(rootService.resources ?? {})) {
    for (const operation of resource.operations) {
      for (const parameter of operation.parameters ?? []) {
        trackUnresolved(parameter.type);
      }
      if (operation.body) {
        trackUnresolved(operation.body.type);
      }
      for (const response of Object.values(operation.responses)) {
        trackUnresolved(response.type);
      }
    }
  }

  return {
    rootService,
    importedServices,
    allServices,
    typesByName,
    sortedModelKeys,
    sortedEnumKeys,
    sortedUnionKeys,
    unresolvedTypes: [...new Set(unresolvedTypes)].sort(shortNameCompare),
  };
}

export function isTypeImported(context: GeneratorContext, typeName: string): boolean {
  const fq = parseFqType(typeName);
  if (fq) {
    return fq.namespace !== context.rootService.namespace;
  }

  const record = context.typesByName.get(typeName);
  if (record) {
    return record.imported;
  }

  return false;
}

export function resolveTypeOwner(context: GeneratorContext, typeName: string): TypeRecord | null {
  const fq = parseFqType(typeName);
  if (fq) {
    const service = findServiceByNamespace(context.allServices, fq.namespace);
    if (!service) {
      return null;
    }
    return {
      kind: fq.kind,
      name: fq.name,
      service,
      namespace: fq.namespace,
      imported: fq.namespace !== context.rootService.namespace,
    };
  }

  return context.typesByName.get(typeName) ?? null;
}

export function importLineForModel(modelKey: string, ownerAppKey: string): string {
  const appKebab = applicationKeyToKebab(ownerAppKey);
  return `import { ${modelKeyToClassName(modelKey)} } from "../${appKebab}/${appKebab}-dtos";`;
}

export function importLineForEnum(enumKey: string, ownerAppKey: string): string {
  const appKebab = applicationKeyToKebab(ownerAppKey);
  return `import { ${enumKeyToClassName(enumKey)} } from "../${appKebab}/${appKebab}-enums";`;
}

export function ownerApplicationKey(record: TypeRecord): string {
  return resolveApplicationKey(record.service);
}

export function mergeImportLines(importLines: Set<string>): string[] {
  const byPath = new Map<string, Set<string>>();

  for (const line of importLines) {
    const match = /^import \{ (.+) \} from "(.+)";$/.exec(line);
    if (!match) {
      byPath.set(line, new Set([line]));
      continue;
    }
    const symbols = match[1].split(",").map((part) => part.trim());
    const path = match[2];
    const existing = byPath.get(path) ?? new Set<string>();
    for (const symbol of symbols) {
      existing.add(symbol);
    }
    byPath.set(path, existing);
  }

  const merged: string[] = [];
  for (const [path, symbols] of [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (symbols.has(path)) {
      merged.push(path);
      continue;
    }
    const sorted = [...symbols].sort();
    merged.push(`import { ${sorted.join(", ")} } from "${path}";`);
  }

  return merged;
}
