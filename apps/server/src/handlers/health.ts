import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { ConduitApi } from "../api";

export const HealthHandlers = HttpApiBuilder.group(
  ConduitApi,
  "health",
  (handlers) =>
    handlers.handle("check", () =>
      Effect.succeed({
        status: "ok" as const,
      })
    )
);
