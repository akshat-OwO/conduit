import { SqliteClient } from "@effect/sql-sqlite-node";
import { Config } from "effect";

export const Database = SqliteClient.SqliteClient;

export const DatabaseLive = SqliteClient.layerConfig({
  filename: Config.nonEmptyString("DB_PATH"),
});
