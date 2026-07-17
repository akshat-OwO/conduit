import { Schema } from "effect";

export class OpenApiUpstreamTimeoutError extends Schema.TaggedErrorClass<OpenApiUpstreamTimeoutError>()(
  "OpenApiUpstreamTimeoutError",
  { message: Schema.String }
) {}
