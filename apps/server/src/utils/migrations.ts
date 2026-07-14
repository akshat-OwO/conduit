import { fileURLToPath } from "node:url";

import { NodeFileSystem } from "@effect/platform-node";
import { SqliteMigrator } from "@effect/sql-sqlite-node";
import { Context, Effect, Layer } from "effect";

import { DatabaseLive } from "./db";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url)
);

export class MigrationService extends Context.Service<
  MigrationService,
  {
    readonly completed: readonly (readonly [id: number, name: string])[];
  }
>()("conduit/MigrationService") {}

const MigrationLive = Layer.effect(
  MigrationService,
  SqliteMigrator.run({
    loader: SqliteMigrator.fromFileSystem(migrationsDirectory),
  }).pipe(Effect.map((completed) => ({ completed })))
);

export const PersistenceLive = MigrationLive.pipe(
  Layer.provideMerge(DatabaseLive),
  Layer.provide(NodeFileSystem.layer)
);
