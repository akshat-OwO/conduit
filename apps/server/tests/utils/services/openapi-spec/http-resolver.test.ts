import { expect, it } from "@effect/vitest";
import { describe } from "vitest";

import { SecureOpenApiHttpResolver } from "../../../../src/utils/services/openapi-spec/http-resolver";

const fileInfo = (url: string) => ({
  data: Buffer.alloc(0),
  extension: ".json",
  hash: "",
  url,
});

describe("SecureOpenApiHttpResolver", () => {
  it("accepts only HTTP and HTTPS URLs", () => {
    expect(
      SecureOpenApiHttpResolver.canRead(
        fileInfo("https://example.com/api.json")
      )
    ).toBe(true);
    expect(
      SecureOpenApiHttpResolver.canRead(fileInfo("http://example.com/api.json"))
    ).toBe(true);
    expect(
      SecureOpenApiHttpResolver.canRead(fileInfo("file:///tmp/api.json"))
    ).toBe(false);
    expect(
      SecureOpenApiHttpResolver.canRead(fileInfo("data:application/json,{}"))
    ).toBe(false);
    expect(SecureOpenApiHttpResolver.canRead(fileInfo("not a url"))).toBe(
      false
    );
  });

  it.each([
    "http://127.0.0.1/openapi.json",
    "http://10.0.0.1/openapi.json",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/openapi.json",
    "http://[::ffff:127.0.0.1]/openapi.json",
  ])("rejects non-public address %s", async (url) => {
    await expect(SecureOpenApiHttpResolver.read(fileInfo(url))).rejects.toThrow(
      "Refusing to load a non-public OpenAPI URL"
    );
  });
});
