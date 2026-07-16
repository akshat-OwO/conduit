import {
  Array as EffectArray,
  Context,
  Effect,
  HashMap,
  Layer,
  Result,
  Schema,
} from "effect";

import { OpenApiSpecError } from "../../errors/openapi-spec/openapi-spec";
import { decodeOpenApiSecurityRequirements } from "../../schemas/openapi-spec/authentication";
import type {
  AuthenticationDetails,
  AuthenticationRequirement,
  SecurityCredential,
} from "../../schemas/openapi-spec/authentication";
import {
  decodeJsonObject,
  decodeString,
  OpenApiDocument,
} from "../../schemas/openapi-spec/document";
import type {
  JsonObject,
  OpenApiDocument as OpenApiDocumentType,
  OpenApiPaths,
} from "../../schemas/openapi-spec/document";
import type { VerifiedOpenApiSpec } from "../../schemas/openapi-spec/verification";
import {
  OpenApiDocumentLoader,
  OpenApiDocumentLoaderLive,
} from "./openapi-document-loader";

const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const OPERATION_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

interface OpenApiSpecServiceShape {
  readonly verify: (
    specUrl: string
  ) => Effect.Effect<VerifiedOpenApiSpec, OpenApiSpecError>;
  readonly getPaths: (
    specUrl: string
  ) => Effect.Effect<OpenApiPaths, OpenApiSpecError>;
}

export class OpenApiSpecService extends Context.Service<
  OpenApiSpecService,
  OpenApiSpecServiceShape
>()("conduit/OpenApiSpecService") {}

const getSecuritySchemes = (document: OpenApiDocumentType) => {
  const openApiSchemes = document.components?.securitySchemes;
  const swaggerSchemes = document.securityDefinitions;
  return openApiSchemes ?? swaggerSchemes ?? {};
};

const apiKeyCredential = (
  schemeName: string,
  scheme: JsonObject
): SecurityCredential => {
  const location = scheme.in;
  return {
    location:
      location === "query" || location === "cookie" ? location : "header",
    name: decodeString(scheme.name) ?? schemeName,
    schemeName,
    type: "apiKey",
  };
};

const httpCredential = (
  schemeName: string,
  scheme: JsonObject,
  isSwaggerBasic: boolean
): SecurityCredential => {
  const bearerFormat = decodeString(scheme.bearerFormat);
  return {
    ...(bearerFormat === undefined ? {} : { bearerFormat }),
    scheme: isSwaggerBasic
      ? "basic"
      : (decodeString(scheme.scheme) ?? "unknown"),
    schemeName,
    type: "http",
  };
};

const getOauthFlows = (scheme: JsonObject) => {
  const flows = decodeJsonObject(scheme.flows);
  if (flows !== undefined) {
    return Object.keys(flows);
  }

  const swaggerFlow = decodeString(scheme.flow);
  return swaggerFlow === undefined ? [] : [swaggerFlow];
};

const credentialFromScheme = (
  schemeName: string,
  schemeValue: unknown,
  scopes: readonly string[]
): SecurityCredential => {
  const scheme = decodeJsonObject(schemeValue) ?? {};
  const type = decodeString(scheme.type);

  if (type === "apiKey") {
    return apiKeyCredential(schemeName, scheme);
  }

  if (type === "http" || type === "basic") {
    return httpCredential(schemeName, scheme, type === "basic");
  }

  if (type === "oauth2") {
    return {
      flows: getOauthFlows(scheme),
      schemeName,
      scopes,
      type,
    };
  }

  if (type === "openIdConnect") {
    return {
      openIdConnectUrl: decodeString(scheme.openIdConnectUrl) ?? "",
      schemeName,
      scopes,
      type,
    };
  }

  if (type === "mutualTLS") {
    return { schemeName, type };
  }

  return { schemeName, type: "unknown" };
};

const parseSecurityRequirements = (
  value: unknown,
  securitySchemes: JsonObject
): {
  readonly allowsAnonymous: boolean;
  readonly requirements: readonly AuthenticationRequirement[];
} => {
  const securityRequirements = decodeOpenApiSecurityRequirements(value);
  if (securityRequirements === undefined) {
    return { allowsAnonymous: true, requirements: [] };
  }

  let allowsAnonymous = securityRequirements.length === 0;
  for (const requirement of securityRequirements) {
    if (Object.keys(requirement).length === 0) {
      allowsAnonymous = true;
      break;
    }
  }
  const requirements = EffectArray.filterMap(
    securityRequirements,
    (requirement) => {
      if (Object.keys(requirement).length === 0) {
        return Result.failVoid;
      }

      const credentials = EffectArray.map(
        Object.entries(requirement),
        ([schemeName, scopes]) =>
          credentialFromScheme(schemeName, securitySchemes[schemeName], scopes)
      );
      return Result.succeed({ credentials });
    }
  );

  return {
    allowsAnonymous,
    requirements,
  };
};

const securityKey = (requirement: AuthenticationRequirement) =>
  JSON.stringify(requirement);

const inspectAuthenticationSync = (document: OpenApiDocumentType) => {
  const securitySchemes = getSecuritySchemes(document);
  const rootSecurity = document.security;
  const paths = document.paths ?? {};
  let uniqueRequirements = HashMap.empty<string, AuthenticationRequirement>();
  let publicOperationCount = 0;
  let securedOperationCount = 0;

  for (const pathItem of Object.values(paths)) {
    for (const method of OPERATION_METHODS) {
      const operation = decodeJsonObject(pathItem[method]);
      if (operation === undefined) {
        continue;
      }

      const effectiveSecurity =
        operation.security === undefined ? rootSecurity : operation.security;
      const { allowsAnonymous, requirements } = parseSecurityRequirements(
        effectiveSecurity,
        securitySchemes
      );
      if (allowsAnonymous) {
        publicOperationCount += 1;
      }

      if (requirements.length === 0) {
        continue;
      }

      if (!allowsAnonymous) {
        securedOperationCount += 1;
      }
      for (const requirement of requirements) {
        uniqueRequirements = HashMap.set(
          uniqueRequirements,
          securityKey(requirement),
          requirement
        );
      }
    }
  }

  if (securedOperationCount === 0) {
    return { mode: "none", requirements: [] } satisfies AuthenticationDetails;
  }

  return {
    mode: publicOperationCount === 0 ? "required" : "mixed",
    requirements: EffectArray.fromIterable(HashMap.values(uniqueRequirements)),
  } satisfies AuthenticationDetails;
};

const inspectAuthentication = Effect.fn(
  "OpenApiSpecService.inspectAuthentication"
)((document: OpenApiDocumentType) =>
  Effect.sync(() => inspectAuthenticationSync(document))
);

export const OpenApiSpecLayer = Layer.effect(
  OpenApiSpecService,
  Effect.gen(function* makeOpenApiSpecService() {
    const documentLoader = yield* OpenApiDocumentLoader;

    const validateUrl = Effect.fn("OpenApiSpecService.validateUrl")(
      function* validateUrl(specUrl: string) {
        const url = yield* Effect.try({
          catch: (cause) =>
            new OpenApiSpecError({
              cause,
              message: "The OpenAPI spec URL must be a valid HTTP or HTTPS URL",
              reason: "invalid-url",
              url: specUrl,
            }),
          try: () => new URL(specUrl),
        });
        const isSupportedProtocol =
          url.protocol === HTTP_PROTOCOL || url.protocol === HTTPS_PROTOCOL;

        if (!isSupportedProtocol) {
          return yield* new OpenApiSpecError({
            cause: url.protocol,
            message: "Only HTTP and HTTPS OpenAPI spec URLs are supported",
            reason: "invalid-url",
            url: specUrl,
          });
        }

        return url.toString();
      }
    );

    const loadSpec = Effect.fn("OpenApiSpecService.loadSpec")(
      function* loadSpec(specUrl: string) {
        const url = yield* validateUrl(specUrl);
        const loadedDocument = yield* documentLoader.load(url);
        const document = yield* Schema.decodeUnknownEffect(OpenApiDocument)(
          loadedDocument
        ).pipe(
          Effect.mapError(
            (cause) =>
              new OpenApiSpecError({
                cause,
                message: "The validated OpenAPI specification is not an object",
                reason: "invalid-spec",
                url,
              })
          )
        );

        return { document, url };
      }
    );

    const verify = Effect.fn("OpenApiSpecService.verify")(function* verify(
      specUrl: string
    ) {
      const { document, url } = yield* loadSpec(specUrl);
      const authentication = yield* inspectAuthentication(document);

      return {
        authentication,
        description: document.info.description ?? "",
        title: document.info.title,
        url,
      };
    });

    const getPaths = Effect.fn("OpenApiSpecService.getPaths")(
      function* getPaths(specUrl: string) {
        const { document } = yield* loadSpec(specUrl);
        return document.paths ?? {};
      }
    );

    return OpenApiSpecService.of({ getPaths, verify });
  })
);

export const OpenApiSpecLive = OpenApiSpecLayer.pipe(
  Layer.provide(OpenApiDocumentLoaderLive)
);
