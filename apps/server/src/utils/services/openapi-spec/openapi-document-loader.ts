import SwaggerParser from "@apidevtools/swagger-parser";
import { Context, Effect, Layer } from "effect";

import { OpenApiSpecError } from "../../errors/openapi-spec/openapi-spec";
import { SecureOpenApiHttpResolver } from "./http-resolver";

interface OpenApiDocumentLoaderShape {
  readonly load: (specUrl: string) => Effect.Effect<unknown, OpenApiSpecError>;
}

export class OpenApiDocumentLoader extends Context.Service<
  OpenApiDocumentLoader,
  OpenApiDocumentLoaderShape
>()("conduit/OpenApiDocumentLoader") {}

export const makeOpenApiDocumentLoaderLayer = (
  httpResolver: SwaggerParser.ResolverOptions
) => {
  const load = Effect.fn("OpenApiDocumentLoader.load")((url: string) =>
    Effect.tryPromise({
      catch: (cause) =>
        new OpenApiSpecError({
          cause,
          message: "The URL did not resolve to a valid OpenAPI specification",
          reason: "invalid-spec",
          url,
        }),
      try: () =>
        new SwaggerParser().validate(url, {
          dereference: {
            circular: "ignore",
          },
          mutateInputSchema: false,
          resolve: {
            file: false,
            http: httpResolver,
          },
          validate: {
            schema: true,
            spec: true,
          },
        }),
    })
  );

  return Layer.effect(
    OpenApiDocumentLoader,
    Effect.sync(() => OpenApiDocumentLoader.of({ load }))
  );
};

export const OpenApiDocumentLoaderLive = makeOpenApiDocumentLoaderLayer(
  SecureOpenApiHttpResolver
);
