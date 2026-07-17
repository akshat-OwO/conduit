import { Schema } from "effect";

export class OpenApiDocumentTooLargeError extends Schema.TaggedErrorClass<OpenApiDocumentTooLargeError>()(
  "OpenApiDocumentTooLargeError",
  { message: Schema.String }
) {}
