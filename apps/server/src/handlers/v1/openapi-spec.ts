import { Effect } from "effect";
import type { HttpApiBuilder } from "effect/unstable/httpapi";

import type { V1Routes } from "../../routes/v1/index";
import { OpenApiSpecService } from "../../utils/services/openapi-spec/openapi-spec";

export const addOpenApiSpecHandlers = Effect.fn("addOpenApiSpecHandlers")(
  function* addOpenApiSpecHandlers(
    handlers: HttpApiBuilder.Handlers.FromGroup<typeof V1Routes>
  ) {
    const openApiSpecService = yield* OpenApiSpecService;

    return handlers
      .handle("verifyOpenApiSpec", ({ payload }) =>
        openApiSpecService.verify(payload.url, payload.validationMode)
      )
      .handle("getOpenApiSpecPaths", ({ payload }) =>
        openApiSpecService.getPaths(payload.url, payload.validationMode)
      );
  }
);
