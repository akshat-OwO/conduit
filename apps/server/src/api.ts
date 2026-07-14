import { HttpApi } from "effect/unstable/httpapi";

import { HealthRoutes } from "./routes/health";

export const ConduitApi = HttpApi.make("conduit").add(HealthRoutes);
