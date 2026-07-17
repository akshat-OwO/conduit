import { Schema } from "effect";

export class OpenApiUpstreamError extends Schema.TaggedErrorClass<OpenApiUpstreamError>()(
  "OpenApiUpstreamError",
  { message: Schema.String }
) {}
