import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiSchema } from "effect/unstable/httpapi";

import { OpenApiSpecError } from "../../utils/errors/openapi-spec/openapi-spec";
import { OpenApiPaths } from "../../utils/schemas/openapi-spec/document";
import { OpenApiSpecUrlRequest } from "../../utils/schemas/openapi-spec/request";
import { VerifiedOpenApiSpec } from "../../utils/schemas/openapi-spec/verification";

const apiError = (
  reason: OpenApiSpecError["reason"],
  status: HttpApiSchema.StatusLiteral
) =>
  OpenApiSpecError.pipe(
    Schema.check(
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Schema filters are synchronous predicates.
      Schema.makeFilter<OpenApiSpecError>((error) =>
        error.reason === reason ? undefined : `Expected reason ${reason}`
      )
    ),
    HttpApiSchema.status(status)
  );

const OpenApiSpecApiErrors = [
  apiError("invalid-url", "BadRequest"),
  apiError("forbidden-address", "Forbidden"),
  apiError("document-too-large", "PayloadTooLarge"),
  apiError("upstream-error", "BadGateway"),
  apiError("upstream-timeout", "GatewayTimeout"),
  apiError("invalid-document", "UnprocessableEntity"),
  apiError("strict-validation-failed", "UnprocessableEntity"),
] as const;

const verifyOpenApiSpec = HttpApiEndpoint.post(
  "verifyOpenApiSpec",
  "/openapi-spec/verify",
  {
    error: OpenApiSpecApiErrors,
    payload: OpenApiSpecUrlRequest,
    success: VerifiedOpenApiSpec,
  }
);

const getOpenApiSpecPaths = HttpApiEndpoint.post(
  "getOpenApiSpecPaths",
  "/openapi-spec/paths",
  {
    error: OpenApiSpecApiErrors,
    payload: OpenApiSpecUrlRequest,
    success: OpenApiPaths,
  }
);

export const OpenApiSpecRoutes = [
  verifyOpenApiSpec,
  getOpenApiSpecPaths,
] as const;
