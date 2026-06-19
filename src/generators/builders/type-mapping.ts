import { ApibuilderServiceJson } from "../types";
import {
  GeneratorContext,
  importLineForEnum,
  importLineForModel,
  isTypeImported,
  mergeImportLines,
  ownerApplicationKey,
  resolveTypeOwner,
} from "./context";
import { enumKeyToClassName, modelKeyToClassName, snakeToCamel } from "./naming";

export interface TypeResolution {
  tsType: string;
  imports: Set<string>;
}

function parseArrayType(type: string): string | null {
  const match = /^\[(.+)\]$/.exec(type);
  return match?.[1] ?? null;
}

function parseMapType(type: string): string | null {
  const match = /^map\[(.+)\]$/.exec(type);
  return match?.[1] ?? null;
}

function resolveLocalTypeName(typeName: string, context: GeneratorContext): TypeResolution | null {
  const imports = new Set<string>();

  if (context.rootService.enums?.[typeName]) {
    return { tsType: enumKeyToClassName(typeName), imports };
  }

  if (context.rootService.models?.[typeName]) {
    return { tsType: modelKeyToClassName(typeName), imports };
  }

  if (context.rootService.unions?.[typeName]) {
    return { tsType: modelKeyToClassName(typeName), imports };
  }

  return null;
}

function resolveExternalType(type: string, context: GeneratorContext): TypeResolution | null {
  const owner = resolveTypeOwner(context, type);
  if (!owner || !owner.imported) {
    return null;
  }

  const imports = new Set<string>();
  const appKey = ownerApplicationKey(owner);

  if (owner.kind === "enum") {
    imports.add(importLineForEnum(owner.name, appKey));
    return { tsType: enumKeyToClassName(owner.name), imports };
  }

  if (owner.kind === "model" || owner.kind === "union") {
    imports.add(importLineForModel(owner.name, appKey));
    return { tsType: modelKeyToClassName(owner.name), imports };
  }

  return null;
}

export function resolveType(type: string, context: GeneratorContext): TypeResolution;
export function resolveType(
  type: string,
  rootService: ApibuilderServiceJson,
  importedServices: ApibuilderServiceJson[],
): TypeResolution;
export function resolveType(
  type: string,
  contextOrRoot: GeneratorContext | ApibuilderServiceJson,
  importedServices?: ApibuilderServiceJson[],
): TypeResolution {
  const context =
    importedServices !== undefined
      ? ({
          rootService: contextOrRoot as ApibuilderServiceJson,
          importedServices,
          allServices: [...importedServices, contextOrRoot as ApibuilderServiceJson],
          typesByName: new Map(),
          sortedModelKeys: [],
          sortedEnumKeys: [],
          sortedUnionKeys: [],
          unresolvedTypes: [],
        } as GeneratorContext)
      : (contextOrRoot as GeneratorContext);

  const imports = new Set<string>();

  if (type === "unit") {
    return { tsType: "void", imports };
  }

  const arrayInner = parseArrayType(type);
  if (arrayInner) {
    const inner = resolveType(arrayInner, context);
    inner.imports.forEach((line) => imports.add(line));
    return { tsType: `${inner.tsType}[]`, imports };
  }

  if (type === "map") {
    return { tsType: "Record<string, unknown>", imports };
  }

  const mapInner = parseMapType(type);
  if (mapInner) {
    const inner = resolveType(mapInner, context);
    inner.imports.forEach((line) => imports.add(line));
    return { tsType: `Record<string, ${inner.tsType}>`, imports };
  }

  const external = resolveExternalType(type, context);
  if (external) {
    external.imports.forEach((line) => imports.add(line));
    return external;
  }

  const local = resolveLocalTypeName(type, context);
  if (local) {
    return local;
  }

  if (isTypeImported(context, type)) {
    const owner = resolveTypeOwner(context, type);
    if (owner) {
      const appKey = ownerApplicationKey(owner);
      if (owner.kind === "enum") {
        imports.add(importLineForEnum(owner.name, appKey));
        return { tsType: enumKeyToClassName(owner.name), imports };
      }
      imports.add(importLineForModel(owner.name, appKey));
      return { tsType: modelKeyToClassName(owner.name), imports };
    }
  }

  switch (type) {
    case "string":
    case "uuid":
    case "date-iso8601":
      return { tsType: "string", imports };
    case "date-time-iso8601":
      return { tsType: "Date", imports };
    case "integer":
    case "long":
      return { tsType: "number", imports };
    case "double":
    case "decimal":
      return { tsType: "number", imports };
    case "boolean":
      return { tsType: "boolean", imports };
    case "json":
    case "object":
      return { tsType: "Record<string, unknown>", imports };
    default:
      return { tsType: "unknown", imports };
  }
}

export { mergeImportLines };

export { resourceToControllerClassName, operationMethodName } from "./nestjs-naming";

export function normalizeControllerPath(resourcePath: string): string {
  if (!resourcePath) {
    return "";
  }

  return resourcePath
    .replace(/^\//, "")
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) {
        return segment;
      }
      return `:${snakeToCamel(segment.slice(1))}`;
    })
    .join("/");
}
