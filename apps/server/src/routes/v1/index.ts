import { HttpApiGroup } from "effect/unstable/httpapi";

import { OpenApiSpecRoutes } from "./openapi-spec";

export const V1Routes = HttpApiGroup.make("v1")
  .add(...OpenApiSpecRoutes)
  .prefix("/v1");
