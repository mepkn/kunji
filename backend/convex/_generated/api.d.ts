/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiKeys from "../aiKeys.js";
import type * as apps from "../apps.js";
import type * as auth from "../auth.js";
import type * as gateway from "../gateway.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_actionAuth from "../lib/actionAuth.js";
import type * as lib_allowlist from "../lib/allowlist.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_gateway from "../lib/gateway.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as otp from "../otp.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiKeys: typeof aiKeys;
  apps: typeof apps;
  auth: typeof auth;
  gateway: typeof gateway;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/actionAuth": typeof lib_actionAuth;
  "lib/allowlist": typeof lib_allowlist;
  "lib/crypto": typeof lib_crypto;
  "lib/gateway": typeof lib_gateway;
  "lib/providers": typeof lib_providers;
  "lib/secrets": typeof lib_secrets;
  otp: typeof otp;
  usage: typeof usage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
