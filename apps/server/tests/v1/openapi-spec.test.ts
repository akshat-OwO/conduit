import { NodeHttpServer } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpApiTest } from "effect/unstable/httpapi";

import { ConduitApi } from "../../src/api";
import { V1Handlers } from "../../src/handlers/v1/index";
import { OpenApiSpecError } from "../../src/utils/errors/openapi-spec/openapi-spec";
import { OpenApiSpecService } from "../../src/utils/services/openapi-spec/openapi-spec";

const SPEC_URL = "https://fixtures.example/openapi.json";
const INVALID_SPEC_URL = "not-a-url";

const API_ERROR_CASES = [
  ["invalid-url", 400],
  ["forbidden-address", 403],
  ["document-too-large", 413],
  ["upstream-error", 502],
  ["upstream-timeout", 504],
  ["invalid-document", 422],
  ["strict-validation-failed", 422],
] as const;

const failInvalidSpec = (url: string) =>
  new OpenApiSpecError({
    cause: url,
    message: "The OpenAPI spec URL must be valid",
    reason:
      API_ERROR_CASES.find(([reason]) => reason === url)?.[0] ?? "invalid-url",
    url,
  });

const OpenApiSpecTest = Layer.succeed(
  OpenApiSpecService,
  OpenApiSpecService.of({
    getPaths: (url) =>
      url === SPEC_URL
        ? Effect.succeed({
            "/widgets": {
              get: { operationId: "listWidgets" },
            },
          })
        : Effect.fail(failInvalidSpec(url)),
    verify: (url) =>
      url === SPEC_URL
        ? Effect.succeed({
            authentication: { mode: "none", requirements: [] },
            description: "API route fixture",
            title: "Fixture API",
            url,
          })
        : Effect.fail(failInvalidSpec(url)),
  })
);

const makeTestClient = HttpApiTest.groups(ConduitApi, ["v1"]).pipe(
  Effect.provide(V1Handlers),
  Effect.provide(OpenApiSpecTest),
  Effect.provide(NodeHttpServer.layerHttpServices)
);

it("declares the versioned OpenAPI spec routes", () => {
  const { getOpenApiSpecPaths, verifyOpenApiSpec } =
    ConduitApi.groups.v1.endpoints;

  expect(verifyOpenApiSpec.method).toBe("POST");
  expect(verifyOpenApiSpec.path).toBe("/v1/openapi-spec/verify");
  expect(getOpenApiSpecPaths.method).toBe("POST");
  expect(getOpenApiSpecPaths.path).toBe("/v1/openapi-spec/paths");
});

it.effect("verifies an OpenAPI spec through the generated client", () =>
  Effect.gen(function* verifyOpenApiSpec() {
    const client = yield* makeTestClient;
    const response = yield* client.v1.verifyOpenApiSpec({
      payload: { url: SPEC_URL },
    });

    expect(response).toEqual({
      authentication: { mode: "none", requirements: [] },
      description: "API route fixture",
      title: "Fixture API",
      url: SPEC_URL,
    });
  })
);

it.effect("gets OpenAPI paths through the generated client", () =>
  Effect.gen(function* getOpenApiSpecPaths() {
    const client = yield* makeTestClient;
    const response = yield* client.v1.getOpenApiSpecPaths({
      payload: { url: SPEC_URL },
    });

    expect(response).toEqual({
      "/widgets": {
        get: { operationId: "listWidgets" },
      },
    });
  })
);

it.effect("returns the status mapped to each OpenAPI failure", () =>
  Effect.gen(function* verifyOpenApiSpecFailures() {
    const client = yield* makeTestClient;

    for (const [reason, status] of API_ERROR_CASES) {
      const response = yield* client.v1.verifyOpenApiSpec({
        payload: { url: reason },
        responseMode: "response-only",
      });

      expect(response.status).toBe(status);
    }
  })
);

it.effect("returns HTTP 400 when getting OpenAPI paths fails", () =>
  Effect.gen(function* getOpenApiSpecPathsFailure() {
    const client = yield* makeTestClient;
    const response = yield* client.v1.getOpenApiSpecPaths({
      payload: { url: INVALID_SPEC_URL },
      responseMode: "response-only",
    });

    expect(response.status).toBe(400);
  })
);
