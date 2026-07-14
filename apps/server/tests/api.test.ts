import { NodeHttpServer } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { HttpApiTest } from "effect/unstable/httpapi";

import { ConduitApi } from "../src/api";
import { HealthHandlers } from "../src/handlers/health";

const makeTestClient = HttpApiTest.groups(ConduitApi, ["health"]).pipe(
  Effect.provide(HealthHandlers),
  Effect.provide(NodeHttpServer.layerHttpServices)
);

it("declares the health route", () => {
  const endpoint = ConduitApi.groups.health.endpoints.check;

  expect(endpoint.method).toBe("GET");
  expect(endpoint.path).toBe("/health");
});

it.effect("serves health through the generated client", () =>
  Effect.gen(function* testHealth() {
    const client = yield* makeTestClient;
    const response = yield* client.health.check({});

    expect(response).toEqual({ status: "ok" });
  })
);
