import { HttpApiBuilder } from "effect/unstable/httpapi";

import { ConduitApi } from "../../api";
import { addOpenApiSpecHandlers } from "./openapi-spec";

export const V1Handlers = HttpApiBuilder.group(
  ConduitApi,
  "v1",
  addOpenApiSpecHandlers
);
