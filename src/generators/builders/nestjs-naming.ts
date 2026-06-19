import pluralize from "pluralize";
import { toPascalCase } from "./naming";
import { normalizeControllerPath } from "./type-mapping";

export interface OperationNamingInput {
  method: string;
  path?: string;
  body?: { type: string };
  parameters?: Array<{ name: string; type: string; required?: boolean }>;
  responses: Record<string, { type: string }>;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function segmentToCamel(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : capitalize(part)))
    .join("");
}

function pathSegments(path: string): { staticParts: string[]; paramParts: string[] } {
  const normalized = normalizeControllerPath(path.replace(/^\//, ""));
  const parts = normalized.split("/").filter(Boolean);
  return {
    staticParts: parts.filter((part) => !part.startsWith(":")),
    paramParts: parts.filter((part) => part.startsWith(":")),
  };
}

function pickSuccessResponseType(responses: Record<string, { type: string }>): string | undefined {
  for (const status of ["200", "201", "202", "204"]) {
    if (responses[status]) {
      return responses[status].type;
    }
  }
  const twoxx = Object.keys(responses)
    .filter((status) => {
      const code = Number.parseInt(status, 10);
      return code >= 200 && code < 300;
    })
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  return twoxx[0] ? responses[twoxx[0]]?.type : undefined;
}

function isArrayResponseType(type: string | undefined): boolean {
  return type?.startsWith("[") === true;
}

function actionNameFromPath(path: string): string {
  const { staticParts } = pathSegments(path);
  if (staticParts.length === 0) {
    return "";
  }
  if (staticParts.length === 1) {
    return segmentToCamel(staticParts[0]);
  }
  const reversed = [...staticParts].reverse();
  return reversed
    .map((part, index) => (index === 0 ? segmentToCamel(part) : capitalize(segmentToCamel(part))))
    .join("");
}

function hasListQueryParameters(operation: OperationNamingInput): boolean {
  return (operation.parameters ?? []).some(
    (parameter) => parameter.name === "page" || parameter.name === "per_page" || parameter.name === "perPage",
  );
}

function resolveCrudMethodName(operation: OperationNamingInput): string | null {
  const opPath = operation.path ?? "";
  const { staticParts, paramParts } = pathSegments(opPath);
  const responseType = pickSuccessResponseType(operation.responses);
  const method = operation.method.toUpperCase();

  if (method === "GET") {
    if (paramParts.length === 1 && staticParts.length === 0) {
      return "findOne";
    }
    if (!opPath && isArrayResponseType(responseType)) {
      return "findAll";
    }
    if (!opPath && !isArrayResponseType(responseType) && !hasListQueryParameters(operation)) {
      return "find";
    }
    if (!opPath && hasListQueryParameters(operation)) {
      return "findAll";
    }
    return null;
  }

  if (method === "POST" && !opPath && operation.body) {
    return "create";
  }

  if ((method === "PUT" || method === "PATCH") && paramParts.length >= 1 && operation.body) {
    return "update";
  }

  if (method === "DELETE" && paramParts.length >= 1) {
    return "remove";
  }

  return null;
}

export function resourceToControllerClassName(resourceKey: string): string {
  const localKey = resourceKey.includes(".") ? (resourceKey.split(".").pop() ?? resourceKey) : resourceKey;
  const pascal = toPascalCase(localKey);
  return `${pluralize(pascal)}Controller`;
}

export function operationMethodName(
  operation: OperationNamingInput,
  usedNames: Set<string>,
  resourceKey: string,
): string {
  const crudName = resolveCrudMethodName(operation);
  if (crudName) {
    return ensureUniqueMethodName(crudName, usedNames, resourceKey, operation.method);
  }

  const opPath = operation.path ?? "";
  if (!opPath) {
    return ensureUniqueMethodName(operation.method.toLowerCase(), usedNames, resourceKey, operation.method);
  }

  const actionName = actionNameFromPath(opPath);
  if (actionName) {
    return ensureUniqueMethodName(actionName, usedNames, resourceKey, operation.method);
  }

  return ensureUniqueMethodName(operation.method.toLowerCase(), usedNames, resourceKey, operation.method);
}

function ensureUniqueMethodName(
  baseName: string,
  usedNames: Set<string>,
  resourceKey: string,
  httpMethod?: string,
): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  if (httpMethod) {
    const verbPrefixed = `${httpMethod.toLowerCase()}${capitalize(baseName)}`;
    if (!usedNames.has(verbPrefixed)) {
      usedNames.add(verbPrefixed);
      return verbPrefixed;
    }
  }

  const suffix = toPascalCase(resourceKey.includes(".") ? (resourceKey.split(".").pop() ?? resourceKey) : resourceKey);
  const suffixed = `${baseName}${suffix}`;
  if (!usedNames.has(suffixed)) {
    usedNames.add(suffixed);
    return suffixed;
  }

  let counter = 2;
  while (usedNames.has(`${suffixed}${counter}`)) {
    counter += 1;
  }
  const unique = `${suffixed}${counter}`;
  usedNames.add(unique);
  return unique;
}
