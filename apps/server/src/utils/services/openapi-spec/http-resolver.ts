import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList } from "node:net";
import type { LookupFunction } from "node:net";

import type SwaggerParser from "@apidevtools/swagger-parser";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

const blockedAddresses = new BlockList();

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
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

const hostnameWithoutBrackets = (hostname: string) =>
  hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

const isBlockedAddress = (address: string, family: number) =>
  family === 6
    ? blockedAddresses.check(address, "ipv6")
    : blockedAddresses.check(address, "ipv4");

const resolvePublicAddress = async (url: URL) => {
  const hostname = hostnameWithoutBrackets(url.hostname);
  const addresses = await lookup(hostname, { all: true, order: "verbatim" });
  const [selectedAddress] = addresses;
  const containsBlockedAddress = addresses.some(({ address, family }) =>
    isBlockedAddress(address, family)
  );

  if (selectedAddress === undefined || containsBlockedAddress) {
    throw new Error(`Refusing to load a non-public OpenAPI URL: ${url}`);
  }

  return selectedAddress;
};

// oxlint-disable promise/prefer-await-to-callbacks -- Node's LookupFunction contract is callback-only.
const makePinnedLookup =
  (
    address: NonNullable<Awaited<ReturnType<typeof resolvePublicAddress>>>
  ): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }

    callback(null, address.address, address.family);
  };
// oxlint-enable promise/prefer-await-to-callbacks

const download = async (url: URL): Promise<Buffer> => {
  const address = await resolvePublicAddress(url);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  // oxlint-disable-next-line promise/avoid-new -- Node's request API has no promise overload.
  return new Promise((resolve, reject) => {
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
          reject(
            new Error(
              `OpenAPI URL returned HTTP ${statusCode}; redirects are not allowed`
            )
          );
          return;
        }

        const contentLength = Number(response.headers["content-length"] ?? 0);
        if (contentLength > MAX_DOCUMENT_BYTES) {
          response.resume();
          reject(new Error("OpenAPI document exceeds the 10 MiB size limit"));
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_DOCUMENT_BYTES) {
            response.destroy(
              new Error("OpenAPI document exceeds the 10 MiB size limit")
            );
            return;
          }

          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      }
    );

    requestHandle.on("error", reject);
    requestHandle.on("timeout", () => {
      requestHandle.destroy(new Error("Timed out while loading OpenAPI URL"));
    });
    requestHandle.end();
  });
};

export const SecureOpenApiHttpResolver = {
  canRead: ({ url }: SwaggerParser.FileInfo) => {
    try {
      const { protocol } = new URL(url);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  read: ({ url }: SwaggerParser.FileInfo) => download(new URL(url)),
} satisfies SwaggerParser.ResolverOptions;
