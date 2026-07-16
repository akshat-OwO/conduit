import type SwaggerParser from "@apidevtools/swagger-parser";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe } from "vitest";

import { makeOpenApiDocumentLoaderLayer } from "../../../../src/utils/services/openapi-spec/openapi-document-loader";
import {
  OpenApiSpecLayer,
  OpenApiSpecLive,
  OpenApiSpecService,
} from "../../../../src/utils/services/openapi-spec/openapi-spec";

const SPEC_URL = "https://fixtures.example/openapi.json";
const SECURITY_SCHEME_URL = "https://fixtures.example/bearer.json";
const OPTIONAL_AUTH_SPEC_URL = "https://fixtures.example/optional-auth.json";
const INVALID_SPEC_URL = "https://fixtures.example/invalid.json";
const OPEN_ID_SPEC_URL = "https://fixtures.example/open-id.json";
const PATHLESS_SPEC_URL = "https://fixtures.example/pathless.json";

const bearerSecurityScheme = {
  scheme: "bearer",
  type: "http",
};

const openApiDocument = {
  components: {
    securitySchemes: {
      bearerToken: { $ref: SECURITY_SCHEME_URL },
    },
  },
  info: {
    description: "A stable OpenAPI fixture for service tests.",
    title: "Fixture API",
    version: "1.0.0",
  },
  openapi: "3.0.3",
  paths: {
    "/health": {
      get: {
        responses: { "200": { description: "OK" } },
        security: [],
      },
    },
    "/widgets/{id}": {
      get: {
        operationId: "getWidget",
        responses: { "200": { description: "OK" } },
        security: [{ bearerToken: [] }],
      },
    },
  },
};

const optionalAuthenticationDocument = {
  components: {
    securitySchemes: { bearerToken: bearerSecurityScheme },
  },
  info: {
    title: "Optional Authentication API",
    version: "1.0.0",
  },
  openapi: "3.0.3",
  paths: {
    "/widgets": {
      get: {
        responses: { "200": { description: "OK" } },
        security: [{}, { bearerToken: [] }],
      },
    },
  },
};

const invalidOpenApiDocument = {
  info: { title: "Missing required version" },
  openapi: "3.0.3",
  paths: {},
};

const openIdDocument = {
  components: {
    securitySchemes: {
      openId: {
        openIdConnectUrl:
          "https://identity.example/.well-known/openid-configuration",
        type: "openIdConnect",
      },
    },
  },
  info: { title: "OpenID API", version: "1.0.0" },
  openapi: "3.0.3",
  paths: {
    "/profile": {
      get: {
        responses: { "200": { description: "OK" } },
        security: [{ openId: ["openid", "profile"] }],
      },
    },
  },
};

const pathlessOpenApiDocument = {
  info: { title: "Webhook API", version: "1.0.0" },
  openapi: "3.1.0",
  webhooks: {
    newMessage: {
      post: {
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

const fixtureDocuments = new Map<string, unknown>([
  [SPEC_URL, openApiDocument],
  [SECURITY_SCHEME_URL, bearerSecurityScheme],
  [OPTIONAL_AUTH_SPEC_URL, optionalAuthenticationDocument],
  [INVALID_SPEC_URL, invalidOpenApiDocument],
  [OPEN_ID_SPEC_URL, openIdDocument],
  [PATHLESS_SPEC_URL, pathlessOpenApiDocument],
]);

const fixtureResolver = {
  canRead: ({ url }: SwaggerParser.FileInfo) => fixtureDocuments.has(url),
  read: ({ url }: SwaggerParser.FileInfo) => {
    const document = fixtureDocuments.get(url);
    if (document === undefined) {
      throw new Error(`No OpenAPI fixture registered for ${url}`);
    }

    return Buffer.from(JSON.stringify(document));
  },
} satisfies SwaggerParser.ResolverOptions;

const OpenApiSpecTest = OpenApiSpecLayer.pipe(
  Layer.provide(makeOpenApiDocumentLoaderLayer(fixtureResolver))
);

describe("OpenApiSpecService", () => {
  it.effect("validates a fixture and resolves referenced authentication", () =>
    Effect.gen(function* verifySpec() {
      const service = yield* OpenApiSpecService;
      const result = yield* service.verify(SPEC_URL);

      expect(result).toEqual({
        authentication: {
          mode: "mixed",
          requirements: [
            {
              credentials: [
                {
                  scheme: "bearer",
                  schemeName: "bearerToken",
                  type: "http",
                },
              ],
            },
          ],
        },
        description: "A stable OpenAPI fixture for service tests.",
        title: "Fixture API",
        url: SPEC_URL,
      });
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("returns paths from the fixture", () =>
    Effect.gen(function* getSpecPaths() {
      const service = yield* OpenApiSpecService;
      const paths = yield* service.getPaths(SPEC_URL);

      expect(Object.keys(paths)).toHaveLength(2);
      expect(paths["/widgets/{id}"]?.get).toMatchObject({
        operationId: "getWidget",
        security: [{ bearerToken: [] }],
      });
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("treats an empty security alternative as anonymous access", () =>
    Effect.gen(function* verifyOptionalAuthentication() {
      const service = yield* OpenApiSpecService;
      const result = yield* service.verify(OPTIONAL_AUTH_SPEC_URL);

      expect(result.authentication).toEqual({ mode: "none", requirements: [] });
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("rejects structurally invalid OpenAPI documents", () =>
    Effect.gen(function* rejectInvalidDocument() {
      const service = yield* OpenApiSpecService;
      const error = yield* service.verify(INVALID_SPEC_URL).pipe(Effect.flip);

      expect(error.reason).toBe("invalid-spec");
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("rejects non-HTTP URLs before loading them", () =>
    Effect.gen(function* rejectInvalidUrl() {
      const service = yield* OpenApiSpecService;
      const error = yield* service
        .verify("file:///tmp/openapi.json")
        .pipe(Effect.flip);

      expect(error.reason).toBe("invalid-url");
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("rejects private network URLs", () =>
    Effect.gen(function* rejectPrivateUrl() {
      const service = yield* OpenApiSpecService;
      const error = yield* service
        .verify("http://127.0.0.1/openapi.json")
        .pipe(Effect.flip);

      expect(error.reason).toBe("invalid-spec");
    }).pipe(Effect.provide(OpenApiSpecLive))
  );

  it.effect("preserves required OpenID Connect scopes", () =>
    Effect.gen(function* verifyOpenIdScopes() {
      const service = yield* OpenApiSpecService;
      const result = yield* service.verify(OPEN_ID_SPEC_URL);

      expect(result.authentication).toEqual({
        mode: "required",
        requirements: [
          {
            credentials: [
              {
                openIdConnectUrl:
                  "https://identity.example/.well-known/openid-configuration",
                schemeName: "openId",
                scopes: ["openid", "profile"],
                type: "openIdConnect",
              },
            ],
          },
        ],
      });
    }).pipe(Effect.provide(OpenApiSpecTest))
  );

  it.effect("accepts OpenAPI 3.1 documents without paths", () =>
    Effect.gen(function* verifyPathlessDocument() {
      const service = yield* OpenApiSpecService;
      const verification = yield* service.verify(PATHLESS_SPEC_URL);
      const paths = yield* service.getPaths(PATHLESS_SPEC_URL);

      expect(verification.title).toBe("Webhook API");
      expect(verification.authentication.mode).toBe("none");
      expect(paths).toEqual({});
    }).pipe(Effect.provide(OpenApiSpecTest))
  );
});
