import { Schema } from "effect";

export class OpenApiSpecError extends Schema.TaggedErrorClass<OpenApiSpecError>()(
  "OpenApiSpecError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    reason: Schema.Union([
      Schema.Literal("invalid-url"),
      Schema.Literal("forbidden-address"),
      Schema.Literal("document-too-large"),
      Schema.Literal("upstream-timeout"),
      Schema.Literal("upstream-error"),
      Schema.Literal("invalid-document"),
      Schema.Literal("strict-validation-failed"),
    ]),
    url: Schema.String,
  }
) {}
