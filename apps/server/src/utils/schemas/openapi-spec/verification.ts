import { Schema } from "effect";

import { AuthenticationDetails } from "./authentication";

export const VerifiedOpenApiSpec = Schema.Struct({
  authentication: AuthenticationDetails,
  description: Schema.String,
  title: Schema.String,
  url: Schema.String,
});
export type VerifiedOpenApiSpec = typeof VerifiedOpenApiSpec.Type;
