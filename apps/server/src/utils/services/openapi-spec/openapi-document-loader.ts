import SwaggerParser from "@apidevtools/swagger-parser";
import { Config, Context, Effect, Layer, Match, Schema } from "effect";
import { constUndefined } from "effect/Function";

import { OpenApiSpecError } from "../../errors/openapi-spec/openapi-spec";
import type { OpenApiValidationMode } from "../../schemas/openapi-spec/request";
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  makeSecureOpenApiHttpResolver,
} from "./http-resolver";

const DEFAULT_VALIDATION_MODE = "compatible" as const;
const MAX_CONFIGURABLE_DOCUMENT_BYTES = 100 * 1024 * 1024;
const maxDocumentBytesConfig = Config.schema(
  Schema.Int.pipe(
    Schema.check(
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(MAX_CONFIGURABLE_DOCUMENT_BYTES)
    )
  ),
  "OPENAPI_MAX_DOCUMENT_BYTES"
).pipe(Config.withDefault(DEFAULT_MAX_DOCUMENT_BYTES));

type OpenApiSpecErrorReason = OpenApiSpecError["reason"];

const resolverErrorReason = (
  cause: unknown,
  httpResolver: SwaggerParser.ResolverOptions
): OpenApiSpecErrorReason | undefined => {
  if (typeof cause !== "object" || cause === null) {
    return undefined;
  }

  const source = "source" in cause ? cause.source : undefined;
  let tag: unknown;
  if (
    typeof source === "string" &&
    "consumeErrorTag" in httpResolver &&
    typeof httpResolver.consumeErrorTag === "function"
  ) {
    tag = httpResolver.consumeErrorTag(source);
  }

  return Match.value(tag).pipe(
    Match.when(
      "OpenApiDocumentTooLargeError",
      () => "document-too-large" as const
    ),
    Match.when(
      "OpenApiForbiddenAddressError",
      () => "forbidden-address" as const
    ),
    Match.when(
      "OpenApiUpstreamTimeoutError",
      () => "upstream-timeout" as const
    ),
    Match.when("OpenApiUpstreamError", () => "upstream-error" as const),
    Match.orElse(constUndefined)
  );
};

const loaderErrorReason = (
  cause: unknown,
  validationMode: OpenApiValidationMode,
  httpResolver: SwaggerParser.ResolverOptions
): OpenApiSpecErrorReason =>
  resolverErrorReason(cause, httpResolver) ??
  Match.value(validationMode).pipe(
    Match.when("strict", () => "strict-validation-failed" as const),
    Match.when("compatible", () => "invalid-document" as const),
    Match.exhaustive
  );

const loaderErrorMessage = (reason: OpenApiSpecErrorReason) =>
  Match.value(reason).pipe(
    Match.when(
      "document-too-large",
      () => "The OpenAPI document exceeds the configured size limit"
    ),
    Match.when(
      "forbidden-address",
      () => "The OpenAPI URL resolves to a non-public address"
    ),
    Match.when("upstream-timeout", () => "The OpenAPI URL timed out"),
    Match.when("upstream-error", () => "The OpenAPI URL could not be loaded"),
    Match.when(
      "strict-validation-failed",
      () => "The document failed strict OpenAPI schema validation"
    ),
    Match.orElse(
      () => "The URL did not resolve to a compatible OpenAPI document"
    )
  );

interface OpenApiDocumentLoaderShape {
  readonly load: (
    specUrl: string,
    validationMode?: OpenApiValidationMode
  ) => Effect.Effect<unknown, OpenApiSpecError>;
}

export class OpenApiDocumentLoader extends Context.Service<
  OpenApiDocumentLoader,
  OpenApiDocumentLoaderShape
>()("conduit/OpenApiDocumentLoader") {}

export const makeOpenApiDocumentLoaderLayer = (
  httpResolver: SwaggerParser.ResolverOptions
) => {
  const load = Effect.fn("OpenApiDocumentLoader.load")(
    (url: string, validationMode = DEFAULT_VALIDATION_MODE) =>
      Effect.tryPromise({
        catch: (cause) => {
          const reason = loaderErrorReason(cause, validationMode, httpResolver);
          return new OpenApiSpecError({
            cause,
            message: loaderErrorMessage(reason),
            reason,
            url,
          });
        },
        try: () => {
          const parser = new SwaggerParser();
          const options = {
            dereference: {
              circular: "ignore" as const,
            },
            mutateInputSchema: false,
            resolve: {
              file: false,
              http: httpResolver,
            },
          };

          return validationMode === "strict"
            ? parser.validate(url, {
                ...options,
                validate: {
                  schema: true,
                  spec: true,
                },
              })
            : parser.dereference(url, options);
        },
      })
  );

  return Layer.effect(
    OpenApiDocumentLoader,
    Effect.sync(() => OpenApiDocumentLoader.of({ load }))
  );
};

export const OpenApiDocumentLoaderLive = Layer.unwrap(
  maxDocumentBytesConfig.pipe(
    Effect.map((maxDocumentBytes) =>
      makeOpenApiDocumentLoaderLayer(
        makeSecureOpenApiHttpResolver(maxDocumentBytes)
      )
    )
  )
);
