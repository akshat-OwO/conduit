import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList } from "node:net";
import type { LookupFunction } from "node:net";

import type SwaggerParser from "@apidevtools/swagger-parser";
import { Effect, Schema } from "effect";

import { OpenApiDocumentTooLargeError } from "../../errors/openapi-spec/document-too-large";
import { OpenApiForbiddenAddressError } from "../../errors/openapi-spec/forbidden-address";
import { OpenApiUpstreamError } from "../../errors/openapi-spec/upstream";
import { OpenApiUpstreamTimeoutError } from "../../errors/openapi-spec/upstream-timeout";

export const DEFAULT_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

const OpenApiHttpResolverError = Schema.Union([
  OpenApiDocumentTooLargeError,
  OpenApiForbiddenAddressError,
  OpenApiUpstreamError,
  OpenApiUpstreamTimeoutError,
]);
type OpenApiHttpResolverError = typeof OpenApiHttpResolverError.Type;
const isOpenApiHttpResolverError = Schema.is(OpenApiHttpResolverError);

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();

const BLOCKED_IPV4_SUBNETS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const BLOCKED_IPV6_SUBNETS = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedIpv4Addresses.addSubnet(network, prefix, "ipv4");
  blockedIpv6Addresses.addSubnet(`::ffff:${network}`, 96 + prefix, "ipv6");
}

for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

const hostnameWithoutBrackets = (hostname: string) =>
  hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

export const isBlockedOpenApiAddress = (address: string, family: number) =>
  family === 6
    ? blockedIpv6Addresses.check(address, "ipv6")
    : blockedIpv4Addresses.check(address, "ipv4");

const upstreamError = (cause: unknown) =>
  new OpenApiUpstreamError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const resolvePublicAddress = Effect.fn(
  "OpenApiHttpResolver.resolvePublicAddress"
)(function* resolvePublicAddress(url: URL) {
  const hostname = hostnameWithoutBrackets(url.hostname);
  const addresses = yield* Effect.tryPromise({
    catch: upstreamError,
    try: () => lookup(hostname, { all: true, order: "verbatim" }),
  });
  const [selectedAddress] = addresses;
  const containsBlockedAddress = addresses.some(({ address, family }) =>
    isBlockedOpenApiAddress(address, family)
  );

  if (selectedAddress === undefined || containsBlockedAddress) {
    return yield* new OpenApiForbiddenAddressError({
      message: `Refusing to load a non-public OpenAPI URL: ${url}`,
    });
  }

  return selectedAddress;
});

// oxlint-disable promise/prefer-await-to-callbacks -- Node's LookupFunction contract is callback-only.
const makePinnedLookup =
  (address: ResolvedAddress): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }

    callback(null, address.address, address.family);
  };
// oxlint-enable promise/prefer-await-to-callbacks

const downloadResponse = Effect.fn("OpenApiHttpResolver.downloadResponse")(
  (url: URL, address: ResolvedAddress, maxDocumentBytes: number) =>
    Effect.callback<Buffer, OpenApiHttpResolverError>((resume) => {
      const request = url.protocol === "https:" ? httpsRequest : httpRequest;
      const requestHandle = request(
        url,
        {
          headers: { accept: "application/json, application/yaml, text/yaml" },
          lookup: makePinnedLookup(address),
          method: "GET",
          timeout: REQUEST_TIMEOUT_MILLISECONDS,
        },
        (response) => {
          const statusCode = response.statusCode ?? 500;
          if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            resume(
              Effect.fail(
                new OpenApiUpstreamError({
                  message: `OpenAPI URL returned HTTP ${statusCode}; redirects are not allowed`,
                })
              )
            );
            return;
          }

          const contentLength = Number(response.headers["content-length"] ?? 0);
          if (contentLength > maxDocumentBytes) {
            response.resume();
            resume(
              Effect.fail(
                new OpenApiDocumentTooLargeError({
                  message: `OpenAPI document exceeds the ${maxDocumentBytes} byte size limit`,
                })
              )
            );
            return;
          }

          const chunks: Buffer[] = [];
          let receivedBytes = 0;

          response.on("data", (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maxDocumentBytes) {
              response.destroy(
                new OpenApiDocumentTooLargeError({
                  message: `OpenAPI document exceeds the ${maxDocumentBytes} byte size limit`,
                })
              );
              return;
            }

            chunks.push(chunk);
          });
          response.on("end", () =>
            resume(Effect.succeed(Buffer.concat(chunks)))
          );
          response.on("error", (cause) =>
            resume(
              Effect.fail(
                isOpenApiHttpResolverError(cause) ? cause : upstreamError(cause)
              )
            )
          );
        }
      );

      requestHandle.on("error", (cause) =>
        resume(
          Effect.fail(
            isOpenApiHttpResolverError(cause) ? cause : upstreamError(cause)
          )
        )
      );
      requestHandle.on("timeout", () => {
        requestHandle.destroy(
          new OpenApiUpstreamTimeoutError({
            message: "Timed out while loading OpenAPI URL",
          })
        );
      });
      requestHandle.end();

      return Effect.sync(() => requestHandle.destroy());
    })
);

const download = Effect.fn("OpenApiHttpResolver.download")(function* download(
  url: URL,
  maxDocumentBytes: number
) {
  const address = yield* resolvePublicAddress(url);
  return yield* downloadResponse(url, address, maxDocumentBytes);
});

const parseUrl = Effect.fn("OpenApiHttpResolver.parseUrl")((url: string) =>
  Effect.try({
    catch: upstreamError,
    try: () => new URL(url),
  })
);

export const makeSecureOpenApiHttpResolver = (
  maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES
) => {
  const errorTags = new Map<string, OpenApiHttpResolverError["_tag"][]>();

  const read = Effect.fn("OpenApiHttpResolver.read")(function* read(
    url: string
  ) {
    const parsedUrl = yield* parseUrl(url);
    return yield* download(parsedUrl, maxDocumentBytes).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          const tags = errorTags.get(url) ?? [];
          tags.push(error._tag);
          errorTags.set(url, tags);
        })
      )
    );
  });

  return {
    canRead: ({ url }: SwaggerParser.FileInfo) => {
      if (!URL.canParse(url)) {
        return false;
      }
      const { protocol } = new URL(url);
      return protocol === "http:" || protocol === "https:";
    },
    consumeErrorTag: (url: string) => {
      const tags = errorTags.get(url);
      const tag = tags?.shift();
      if (tags?.length === 0) {
        errorTags.delete(url);
      }
      return tag;
    },
    read: ({ url }: SwaggerParser.FileInfo) => Effect.runPromise(read(url)),
  };
};

export const SecureOpenApiHttpResolver = makeSecureOpenApiHttpResolver();
