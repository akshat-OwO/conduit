import { flow, Option, Schema } from "effect";

const ApiKeyCredential = Schema.Struct({
  location: Schema.Union([
    Schema.Literal("header"),
    Schema.Literal("query"),
    Schema.Literal("cookie"),
  ]),
  name: Schema.String,
  schemeName: Schema.String,
  type: Schema.Literal("apiKey"),
});

const HttpCredential = Schema.Struct({
  bearerFormat: Schema.optionalKey(Schema.String),
  scheme: Schema.String,
  schemeName: Schema.String,
  type: Schema.Literal("http"),
});

const Oauth2Credential = Schema.Struct({
  flows: Schema.Array(Schema.String),
  schemeName: Schema.String,
  scopes: Schema.Array(Schema.String),
  type: Schema.Literal("oauth2"),
});

const OpenIdConnectCredential = Schema.Struct({
  openIdConnectUrl: Schema.String,
  schemeName: Schema.String,
  scopes: Schema.Array(Schema.String),
  type: Schema.Literal("openIdConnect"),
});

const MutualTlsCredential = Schema.Struct({
  schemeName: Schema.String,
  type: Schema.Literal("mutualTLS"),
});

const UnknownCredential = Schema.Struct({
  schemeName: Schema.String,
  type: Schema.Literal("unknown"),
});

export const SecurityCredential = Schema.Union([
  ApiKeyCredential,
  HttpCredential,
  Oauth2Credential,
  OpenIdConnectCredential,
  MutualTlsCredential,
  UnknownCredential,
]);
export type SecurityCredential = typeof SecurityCredential.Type;

/** All credentials in one requirement are required together (OpenAPI AND semantics). */
export const AuthenticationRequirement = Schema.Struct({
  credentials: Schema.Array(SecurityCredential),
});
export type AuthenticationRequirement = typeof AuthenticationRequirement.Type;

export const AuthenticationDetails = Schema.Struct({
  /** `mixed` means that some operations are public while others require credentials. */
  mode: Schema.Union([
    Schema.Literal("none"),
    Schema.Literal("required"),
    Schema.Literal("mixed"),
  ]),
  /** Each entry is an alternative way to authenticate (OpenAPI OR semantics). */
  requirements: Schema.Array(AuthenticationRequirement),
});
export type AuthenticationDetails = typeof AuthenticationDetails.Type;

export const OpenApiSecurityRequirements = Schema.Array(
  Schema.Record(Schema.String, Schema.Array(Schema.String))
);

export const decodeOpenApiSecurityRequirements = flow(
  Schema.decodeUnknownOption(OpenApiSecurityRequirements),
  Option.getOrUndefined
);
