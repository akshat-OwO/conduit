import { HttpApiClient } from "effect/unstable/httpapi";

import { ConduitApi } from "./api";

export const makeConduitClient = (baseUrl: URL | string) =>
  HttpApiClient.make(ConduitApi, { baseUrl });

export type ConduitClient = HttpApiClient.Client<
  (typeof ConduitApi)["groups"][keyof (typeof ConduitApi)["groups"]]
>;
