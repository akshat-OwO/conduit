import { Schema } from "effect";

export class OpenApiSpecError extends Schema.TaggedErrorClass<OpenApiSpecError>()(
  "OpenApiSpecError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    reason: Schema.Union([
      Schema.Literal("invalid-url"),
      Schema.Literal("invalid-spec"),
    ]),
    url: Schema.String,
  }
) {}
