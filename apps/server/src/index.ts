import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { ConduitApi } from "./api";
import { HealthHandlers } from "./handlers/health";
import { MigrationService, PersistenceLive } from "./utils/migrations";

const ApiLive = HttpApiBuilder.layer(ConduitApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(HealthHandlers));

const HttpServerLive = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 1212 }))
);

const ServerLive = Layer.unwrap(
  Effect.as(MigrationService, HttpServerLive)
).pipe(Layer.provide(PersistenceLive));

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
