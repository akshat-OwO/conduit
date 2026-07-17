import type SwaggerParser from "@apidevtools/swagger-parser";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";

import {
  makeOpenApiDocumentLoaderLayer,
  OpenApiDocumentLoader,
} from "../../../../src/utils/services/openapi-spec/openapi-document-loader";

const FIRST_SPEC_URL = "https://fixtures.example/first.json";
const SECOND_SPEC_URL = "https://fixtures.example/second.json";
const REFERENCED_SPEC_URL = "https://fixtures.example/referenced.json";
const SECURITY_SCHEME_URL = "https://fixtures.example/security.json";
const INVALID_SPEC_URL = "https://fixtures.example/invalid.json";
const FILE_REFERENCE_SPEC_URL = "https://fixtures.example/file-reference.json";
const RECURSIVE_SPEC_URL = "https://fixtures.example/recursive.json";

const makeDocument = (title: string) => ({
  info: { title, version: "1.0.0" },
  openapi: "3.0.3",
  paths: {},
});

const documents = new Map<string, unknown>([
  [FIRST_SPEC_URL, makeDocument("First API")],
  [SECOND_SPEC_URL, makeDocument("Second API")],
  [
    REFERENCED_SPEC_URL,
    {
      ...makeDocument("Referenced API"),
      components: {
        securitySchemes: {
          bearerToken: { $ref: SECURITY_SCHEME_URL },
        },
      },
    },
  ],
  [SECURITY_SCHEME_URL, { scheme: "bearer", type: "http" }],
  [
    INVALID_SPEC_URL,
    { info: { title: "No version" }, openapi: "3.0.3", paths: {} },
  ],
  [
    FILE_REFERENCE_SPEC_URL,
    {
      ...makeDocument("Unsafe Reference API"),
      components: {
        securitySchemes: {
          localFile: { $ref: "file:///etc/passwd" },
        },
      },
    },
  ],
  [
    RECURSIVE_SPEC_URL,
    {
      ...makeDocument("Recursive API"),
      components: {
        schemas: {
          Node: {
            properties: {
              child: { $ref: "#/components/schemas/Node" },
            },
            type: "object",
          },
        },
      },
      paths: {
        "/node": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Node" },
                  },
                },
                description: "OK",
              },
            },
          },
        },
      },
    },
  ],
]);

const fixtureResolver = {
  canRead: ({ url }: SwaggerParser.FileInfo) => documents.has(url),
  read: ({ url }: SwaggerParser.FileInfo) => {
    const document = documents.get(url);
    if (document === undefined) {
      throw new Error(`No loader fixture registered for ${url}`);
    }

    return Buffer.from(JSON.stringify(document));
  },
} satisfies SwaggerParser.ResolverOptions;

const OpenApiDocumentLoaderTest =
  makeOpenApiDocumentLoaderLayer(fixtureResolver);

describe("OpenApiDocumentLoader", () => {
  it.effect("dereferences external documents", () =>
    Effect.gen(function* loadReferencedDocument() {
      const loader = yield* OpenApiDocumentLoader;
      const document = yield* loader.load(REFERENCED_SPEC_URL);

      expect(document).toMatchObject({
        components: {
          securitySchemes: {
            bearerToken: { scheme: "bearer", type: "http" },
          },
        },
      });
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );

  it.effect("uses compatible validation by default", () =>
    Effect.gen(function* loadCompatibleDocument() {
      const loader = yield* OpenApiDocumentLoader;
      const document = yield* loader.load(INVALID_SPEC_URL);

      expect(document).toMatchObject({ openapi: "3.0.3" });
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );

  it.effect("supports strict schema validation", () =>
    Effect.gen(function* rejectInvalidDocument() {
      const loader = yield* OpenApiDocumentLoader;
      const error = yield* loader
        .load(INVALID_SPEC_URL, "strict")
        .pipe(Effect.flip);

      expect(error.reason).toBe("strict-validation-failed");
      expect(error.url).toBe(INVALID_SPEC_URL);
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );

  it.effect("does not resolve file references", () =>
    Effect.gen(function* rejectFileReference() {
      const loader = yield* OpenApiDocumentLoader;
      const error = yield* loader
        .load(FILE_REFERENCE_SPEC_URL)
        .pipe(Effect.flip);

      expect(error.reason).toBe("invalid-document");
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );

  it.effect("isolates concurrent parser operations", () =>
    Effect.gen(function* loadConcurrently() {
      const loader = yield* OpenApiDocumentLoader;
      const [first, second] = yield* Effect.all(
        [loader.load(FIRST_SPEC_URL), loader.load(SECOND_SPEC_URL)],
        { concurrency: "unbounded" }
      );

      expect(first).toMatchObject({ info: { title: "First API" } });
      expect(second).toMatchObject({ info: { title: "Second API" } });
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );

  it.effect("keeps recursive schemas serializable", () =>
    Effect.gen(function* loadRecursiveDocument() {
      const loader = yield* OpenApiDocumentLoader;
      const document = yield* loader.load(RECURSIVE_SPEC_URL);

      expect(() => JSON.stringify(document)).not.toThrow();
      expect(document).toMatchObject({
        components: {
          schemas: {
            Node: {
              properties: {
                child: { $ref: "#/components/schemas/Node" },
              },
            },
          },
        },
      });
    }).pipe(Effect.provide(OpenApiDocumentLoaderTest))
  );
});
