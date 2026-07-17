import { flow, Option, Schema } from "effect";

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
export type JsonObject = typeof JsonObject.Type;

export const OpenApiPathItem = JsonObject;
export type OpenApiPathItem = typeof OpenApiPathItem.Type;

export const OpenApiPaths = Schema.Record(Schema.String, OpenApiPathItem);
export type OpenApiPaths = typeof OpenApiPaths.Type;

const OpenApiInfo = Schema.Struct({
  description: Schema.optionalKey(Schema.String),
  title: Schema.String,
  version: Schema.String,
});

const OpenApiComponents = Schema.Struct({
  securitySchemes: Schema.optionalKey(JsonObject),
});

const OpenApiDocumentFields = {
  components: Schema.optionalKey(OpenApiComponents),
  info: OpenApiInfo,
  paths: Schema.optionalKey(OpenApiPaths),
  security: Schema.optionalKey(Schema.Unknown),
  securityDefinitions: Schema.optionalKey(JsonObject),
};

export const OpenApiDocument = Schema.Union([
  Schema.Struct({
    ...OpenApiDocumentFields,
    openapi: Schema.String,
  }),
  Schema.Struct({
    ...OpenApiDocumentFields,
    swagger: Schema.Literal("2.0"),
  }),
]);
export type OpenApiDocument = typeof OpenApiDocument.Type;

export const decodeJsonObject = flow(
  Schema.decodeUnknownOption(JsonObject),
  Option.getOrUndefined
);

export const decodeString = flow(
  Schema.decodeUnknownOption(Schema.String),
  Option.getOrUndefined
);

export const isOpenApiPathItem = Schema.is(OpenApiPathItem);
