import { HttpApi } from "effect/unstable/httpapi";

import { HealthRoutes } from "./routes/health";
import { V1Routes } from "./routes/v1/index";

export const ConduitApi = HttpApi.make("conduit").add(HealthRoutes, V1Routes);
