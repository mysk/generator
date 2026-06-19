import { buildContext, isTypeImported, mergeImportLines } from "./context";

const rootService = {
  namespace: "co.forsyte.address.v0",
  name: "address",
  models: {
    address: {
      fields: [{ name: "id", type: "string" }],
    },
    address_form: {
      fields: [{ name: "street", type: "string", required: false }],
    },
  },
  resources: {
    address: {
      path: "/:organisation_id_or_slug/addresses",
      operations: [
        {
          method: "GET",
          path: "/:address_id",
          responses: {
            "200": { type: "address" },
            "404": { type: "co.forsyte.error.v0.models.error" },
          },
        },
      ],
    },
  },
};

const errorService = {
  namespace: "co.forsyte.error.v0",
  name: "error",
  models: {
    error: {
      fields: [{ name: "message", type: "string" }],
    },
  },
};

describe("buildContext", () => {
  it("indexes local and imported types", () => {
    const context = buildContext({
      service: rootService,
      imported_services: [errorService],
    });

    expect(context.typesByName.has("address")).toBe(true);
    expect(context.typesByName.has("error")).toBe(true);
    expect(isTypeImported(context, "co.forsyte.error.v0.models.error")).toBe(true);
    expect(isTypeImported(context, "address")).toBe(false);
  });

  it("sorts models by dependency order", () => {
    const context = buildContext({
      service: {
        ...rootService,
        models: {
          child: {
            fields: [{ name: "parent", type: "parent" }],
          },
          parent: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      },
      imported_services: [],
    });

    expect(context.sortedModelKeys.indexOf("parent")).toBeLessThan(context.sortedModelKeys.indexOf("child"));
  });
});

describe("mergeImportLines", () => {
  it("merges imports from the same module", () => {
    const merged = mergeImportLines(
      new Set([
        'import { FooDto } from "../error/error-dtos";',
        'import { BarDto } from "../error/error-dtos";',
      ]),
    );

    expect(merged).toEqual(['import { BarDto, FooDto } from "../error/error-dtos";']);
  });
});
