import {
  operationMethodName,
  OperationNamingInput,
  resourceToControllerClassName,
} from "./nestjs-naming";

describe("resourceToControllerClassName", () => {
  it("names address resource", () => {
    expect(resourceToControllerClassName("address")).toBe("AddressesController");
  });

  it("names data_gateway resources without path-tail collision", () => {
    expect(resourceToControllerClassName("data_gateway")).toBe("DataGatewaysController");
    expect(resourceToControllerClassName("data_gateway_enrollment")).toBe("DataGatewayEnrollmentsController");
  });

  it("names imported healthcheck resource", () => {
    expect(resourceToControllerClassName("co.forsyte.healthcheck.v0.models.healthcheck")).toBe(
      "HealthchecksController",
    );
  });

  it("names feature_flag resource", () => {
    expect(resourceToControllerClassName("feature_flag")).toBe("FeatureFlagsController");
  });
});

describe("operationMethodName", () => {
  const used = () => new Set<string>();

  function name(operation: OperationNamingInput, resourceKey = "address"): string {
    return operationMethodName(operation, used(), resourceKey);
  }

  it("uses NestJS CRUD names", () => {
    expect(
      name({
        method: "GET",
        responses: { "200": { type: "[address]" } },
        parameters: [{ name: "page", type: "integer", required: false }],
      }),
    ).toBe("findAll");

    expect(
      name({
        method: "GET",
        path: "/:address_id",
        responses: { "200": { type: "address" } },
      }),
    ).toBe("findOne");

    expect(
      name({
        method: "POST",
        body: { type: "address_form" },
        responses: { "201": { type: "address" } },
      }),
    ).toBe("create");

    expect(
      name({
        method: "PUT",
        path: "/:address_id",
        body: { type: "address_put_form" },
        responses: { "200": { type: "address" } },
      }),
    ).toBe("update");

    expect(
      name({
        method: "DELETE",
        path: "/:address_id",
        responses: { "204": { type: "unit" } },
      }),
    ).toBe("remove");
  });

  it("uses action verbs for non-CRUD paths", () => {
    expect(
      name({
        method: "POST",
        path: "/parse",
        body: { type: "address_parse_form" },
        responses: { "200": { type: "address_parse_result" } },
      }),
    ).toBe("parse");

    expect(
      name({
        method: "POST",
        path: "/enrollment/complete",
        body: { type: "data_gateway_enrollment_complete_form" },
        responses: { "200": { type: "data_gateway" } },
      }, "data_gateway_enrollment"),
    ).toBe("completeEnrollment");

    expect(
      name({
        method: "POST",
        path: "/:data_gateway_id/enroll",
        body: { type: "data_gateway_enroll_form" },
        responses: { "201": { type: "data_gateway_enroll" } },
      }, "data_gateway"),
    ).toBe("enroll");

    expect(
      name({
        method: "GET",
        path: "/healthz",
        responses: { "200": { type: "healthcheck" } },
      }, "co.forsyte.healthcheck.v0.models.healthcheck"),
    ).toBe("healthz");
  });

  it("prefixes HTTP verb when action names collide", () => {
    const used = new Set<string>();
    const resourceKey = "data_gateway_session";

    const getName = operationMethodName(
      {
        method: "GET",
        path: "/organisations/:organisation_id_or_slug/connected",
        responses: { "200": { type: "connection_status" } },
      },
      used,
      resourceKey,
    );

    const postName = operationMethodName(
      {
        method: "POST",
        path: "/organisations/:organisation_id_or_slug/connected",
        body: { type: "mark_connected_form" },
        responses: { "200": { type: "ok_result" } },
      },
      used,
      resourceKey,
    );

    expect(getName).toBe("connectedOrganisations");
    expect(postName).toBe("postConnectedOrganisations");
  });
});
