import { Schema } from "effect";

export const OpenApiValidationMode = Schema.Literals(["compatible", "strict"]);
export type OpenApiValidationMode = typeof OpenApiValidationMode.Type;

export const OpenApiSpecUrlRequest = Schema.Struct({
  url: Schema.String,
  validationMode: Schema.optionalKey(OpenApiValidationMode),
});
export type OpenApiSpecUrlRequest = typeof OpenApiSpecUrlRequest.Type;
