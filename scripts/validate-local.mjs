/**
 * Validates generator output against forsyteco-spec services.
 * Run: pnpm build && node scripts/validate-local.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildForm } from "./lib/build-form.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outDir = join(repoRoot, "test-output");

const require = createRequire(import.meta.url);
const { generateNestJsDtos } = require(join(repoRoot, "dist/generators/implementations/nestjs-dtos/generate-dtos"));
const { generateNestJsControllers } = require(
  join(repoRoot, "dist/generators/implementations/nestjs-controllers/generate-controllers"),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fileMap(files) {
  return Object.fromEntries(files.map((f) => [f.name, f]));
}

function countAbstractClasses(content) {
  return (content.match(/export abstract class /g) ?? []).length;
}

const cases = [
  {
    name: "healthcheck",
    form: () => buildForm("healthcheck.json"),
    expectDtos: {
      files: ["healthcheck-dtos.ts"],
      skipEnums: true,
      classes: ["HealthcheckDto"],
      dir: "generated/healthcheck",
    },
    expectControllers: {
      files: ["healthcheck-controllers.ts"],
      classes: ["HealthchecksController"],
      methods: ["healthz", "readyz"],
      returnTypes: ["Promise<HealthcheckDto>"],
      dir: "generated/healthcheck",
    },
  },
  {
    name: "error",
    form: () => buildForm("error.json"),
    expectDtos: {
      files: ["error-dtos.ts"],
      skipEnums: true,
      classes: ["ErrorDto"],
      dir: "generated/error",
    },
    expectControllers: null,
  },
  {
    name: "address",
    form: () => buildForm("address.json"),
    expectDtos: {
      files: ["address-enums.ts", "address-dtos.ts"],
      classes: [
        "CountryDto",
        "AddressDto",
        "AddressFormDto",
        "AddressPutFormDto",
        "AddressParseFormDto",
        "AddressParseResultDto",
        "AddressResolveFormDto",
        "AddressResolveResultDto",
      ],
      enums: ["AddressParseSource", "AddressResolveSource"],
      enumValues: ['RULES = "rules"', 'LLM = "llm"'],
      fields: ["countryId", "useLlm", "addressFound"],
      dir: "generated/address",
    },
    expectControllers: {
      files: ["address-controllers.ts"],
      classes: ["AddressesController", "HealthchecksController"],
      methods: ["parse", "resolve", "findAll", "create", "findOne", "update", "remove", "healthz"],
      returnTypes: [
        "Promise<AddressParseResultDto>",
        "Promise<AddressDto>",
        "Promise<AddressDto[]>",
        "Promise<void>",
      ],
      routes: [
        '@Post("parse")',
        '@Post("resolve")',
        "@Controller(':organisationIdOrSlug/addresses')",
        ":addressId",
      ],
      nestPatterns: ["Consumer global prefix: /v1alpha"],
      nestPatterns: ["@HttpCode(HttpStatus.OK)", "@HttpCode(HttpStatus.NO_CONTENT)", "@ApiCreatedResponse", "@ApiNoContentResponse"],
      noPatterns: ["AddressesPostParseHTTP200", "AddressesPutAddressIdResponse", "Hook(", "abstract findOne("],
      imports: ["AddressDto", "AddressParseResultDto", "AddressResolveResultDto"],
      dir: "generated/address",
    },
  },
  {
    name: "feature_flag",
    form: () => buildForm("feature_flag.json"),
    expectDtos: {
      files: ["feature-flag-dtos.ts"],
      skipEnums: true,
      classes: ["FeatureFlagDto", "FeatureFlagAssignmentDto", "MeFeatureFlagDto"],
      fields: ["featureFlagId", "organisationId", "effectiveEnabled"],
      dir: "generated/feature-flag",
    },
    expectControllers: {
      files: ["feature-flag-controllers.ts"],
      classes: ["FeatureFlagsController", "FeatureFlagAssignmentsController", "HealthchecksController"],
      methods: ["findAll", "findOne"],
      noPatterns: ["FlagsController", "AssignmentsController", "Hook("],
      dir: "generated/feature-flag",
    },
  },
  {
    name: "data_gateway",
    form: () => buildForm("data_gateway.json"),
    expectDtos: {
      files: ["data-gateway-enums.ts", "data-gateway-dtos.ts"],
      classes: ["DataGatewayDto", "DataGatewayFormDto", "AuthorizeConnectionFormDto"],
      fields: ["connected", "enrollmentTokenTtlMinutes", "configuration"],
      dir: "generated/data-gateway",
    },
    expectControllers: {
      files: ["data-gateway-controllers.ts"],
      classes: [
        "DataGatewaysController",
        "DataGatewayEnrollmentsController",
        "DataGatewaySessionsController",
        "HealthchecksController",
      ],
      methods: [
        "create",
        "find",
        "findOne",
        "update",
        "remove",
        "enroll",
        "completeEnrollment",
        "authorizeConnection",
        "organisationsConnected",
        "connectedOrganisations",
        "postConnectedOrganisations",
        "healthz",
      ],
      routes: [":dataGatewayId", "@Controller('data-gateway-sessions')", "@Controller(':organisationIdOrSlug/data/gateways')"],
      noPatterns: ["GatewaysController", "Hook(", "getDataGatewayId", "postHook"],
      dir: "generated/data-gateway",
      uniqueClasses: 4,
    },
  },
];

let passed = 0;
let failed = 0;
const failures = [];

mkdirSync(outDir, { recursive: true });

for (const testCase of cases) {
  const label = testCase.name;
  try {
    const form = testCase.form();
    const dtoFiles = await generateNestJsDtos(form);
    const dtoByName = fileMap(dtoFiles);

    assert(dtoFiles.length > 0, `${label}: expected DTO files`);
    for (const expectedFile of testCase.expectDtos.files) {
      assert(dtoByName[expectedFile], `${label}: missing ${expectedFile}`);
      assert(dtoByName[expectedFile].dir === testCase.expectDtos.dir, `${label}: wrong dir for ${expectedFile}`);
      writeFileSync(join(outDir, expectedFile.replace(".ts", `.${label}.ts`)), dtoByName[expectedFile].contents);
    }

    if (testCase.expectDtos.skipEnums) {
      const enumsName = testCase.expectDtos.files[0].replace("-dtos.ts", "-enums.ts");
      assert(!dtoByName[enumsName], `${label}: should not emit Enums file`);
    }

    const dtosContent = testCase.expectDtos.files
      .filter((f) => f.endsWith("-dtos.ts"))
      .map((f) => dtoByName[f]?.contents ?? "")
      .join("\n");
    const enumsContent = dtoByName[testCase.expectDtos.files.find((f) => f.endsWith("-enums.ts")) ?? ""]?.contents ?? "";

    for (const className of testCase.expectDtos.classes ?? []) {
      assert(dtosContent.includes(`export class ${className}`), `${label}: missing class ${className}`);
    }
    for (const enumName of testCase.expectDtos.enums ?? []) {
      assert(enumsContent.includes(`export enum ${enumName}`), `${label}: missing enum ${enumName}`);
    }
    for (const enumValue of testCase.expectDtos.enumValues ?? []) {
      assert(enumsContent.includes(enumValue), `${label}: missing enum value ${enumValue}`);
    }
    for (const field of testCase.expectDtos.fields ?? []) {
      assert(dtosContent.includes(field), `${label}: missing camelCase field ${field}`);
    }

    if (testCase.expectControllers) {
      const controllerFiles = await generateNestJsControllers(form);
      const ctrlByName = fileMap(controllerFiles);
      for (const expectedFile of testCase.expectControllers.files) {
        assert(ctrlByName[expectedFile], `${label}: missing ${expectedFile}`);
        assert(ctrlByName[expectedFile].dir === testCase.expectControllers.dir, `${label}: wrong controller dir`);
        writeFileSync(
          join(outDir, expectedFile.replace(".ts", `.${label}.ts`)),
          ctrlByName[expectedFile].contents,
        );
      }
      const controllersContent = testCase.expectControllers.files
        .map((f) => ctrlByName[f]?.contents ?? "")
        .join("\n");
      for (const className of testCase.expectControllers.classes ?? []) {
        assert(
          controllersContent.includes(`export abstract class ${className}`),
          `${label}: missing abstract class ${className}`,
        );
      }
      if (testCase.expectControllers.uniqueClasses) {
        assert(
          countAbstractClasses(controllersContent) === testCase.expectControllers.uniqueClasses,
          `${label}: expected ${testCase.expectControllers.uniqueClasses} unique abstract controller classes`,
        );
      }
      for (const method of testCase.expectControllers.methods ?? []) {
        assert(
          controllersContent.includes(`${method}(`) && !controllersContent.includes(`abstract ${method}(`),
          `${label}: missing concrete operation ${method}`,
        );
      }
      for (const route of testCase.expectControllers.routes ?? []) {
        assert(controllersContent.includes(route), `${label}: missing route ${route}`);
      }
      for (const returnType of testCase.expectControllers.returnTypes ?? []) {
        assert(controllersContent.includes(returnType), `${label}: missing return type ${returnType}`);
      }
      for (const pattern of testCase.expectControllers.nestPatterns ?? []) {
        assert(controllersContent.includes(pattern), `${label}: missing NestJS pattern ${pattern}`);
      }
      for (const pattern of testCase.expectControllers.noPatterns ?? []) {
        if (pattern.endsWith("Controller")) {
          assert(
            !controllersContent.includes(`export abstract class ${pattern}`),
            `${label}: should not contain abstract class ${pattern}`,
          );
        } else {
          assert(!controllersContent.includes(pattern), `${label}: should not contain ${pattern}`);
        }
      }
      for (const importName of testCase.expectControllers.imports ?? []) {
        assert(controllersContent.includes(importName), `${label}: missing import ${importName}`);
      }
    } else {
      const controllerFiles = await generateNestJsControllers(form);
      assert(controllerFiles.length === 0, `${label}: expected no controller files`);
    }

    console.log(`PASS  ${label}`);
    passed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL  ${label}: ${message}`);
    failures.push({ label, message });
    failed += 1;
  }
}

try {
  const form = buildForm("address.json");
  const dtoFiles = await generateNestJsDtos(form);
  const addressDtos = fileMap(dtoFiles)["address-dtos.ts"].contents;
  const formSection = addressDtos.split("export class AddressFormDto")[1]?.split("export class")[0] ?? "";
  for (const field of ["street?", "city?", "county?", "postcode?", "countryId?"]) {
    assert(formSection.includes(field), `address-handwritten: AddressFormDto missing ${field}`);
  }
  console.log("PASS  address-handwritten (AddressFormDto field parity)");
  passed += 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAIL  address-handwritten: ${message}`);
  failures.push({ label: "address-handwritten", message });
  failed += 1;
}

try {
  const form = buildForm("data_gateway.json");
  const dtoFiles = await generateNestJsDtos(form);
  const dgDtos = fileMap(dtoFiles)["data-gateway-dtos.ts"].contents;
  assert(dgDtos.includes("@IsObject()"), "data_gateway-dto-fidelity: map fields should use @IsObject()");
  assert(dgDtos.includes("@Type(() => Date)"), "data_gateway-dto-fidelity: date-time fields should use @Type(() => Date)");
  assert(dgDtos.includes("enrollmentTokenTtlMinutes"), "data_gateway-dto-fidelity: enrollment token ttl field");
  assert(dgDtos.includes("= 15"), "data_gateway-dto-fidelity: default value for enrollment token ttl");
  console.log("PASS  data_gateway-dto-fidelity");
  passed += 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAIL  data_gateway-dto-fidelity: ${message}`);
  failures.push({ label: "data_gateway-dto-fidelity", message });
  failed += 1;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.message}`);
  }
  process.exit(1);
}

console.log(`\nSample output written to ${outDir}/`);
