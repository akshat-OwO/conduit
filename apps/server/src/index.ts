import { createServer } from "node:https";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { MigrationService, PersistenceLive } from "./utils/migrations";

const AppLive = HttpRouter.use((router) =>
  router.add("GET", "/health", HttpServerResponse.text("ok"))
);

const HttpServerLive = HttpRouter.serve(AppLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 1212 }))
);

const ServerLive = Layer.unwrap(
  Effect.as(MigrationService, HttpServerLive)
).pipe(Layer.provide(PersistenceLive));

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
