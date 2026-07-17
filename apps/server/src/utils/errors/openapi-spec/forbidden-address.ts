import { Schema } from "effect";

export class OpenApiForbiddenAddressError extends Schema.TaggedErrorClass<OpenApiForbiddenAddressError>()(
  "OpenApiForbiddenAddressError",
  { message: Schema.String }
) {}
