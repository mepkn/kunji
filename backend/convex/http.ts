import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { generate } from "./gateway";

const http = httpRouter();

auth.addHttpRoutes(http);

// Apps call this server to server with their secret (SPEC.md → Gateway).
http.route({ path: "/ai/v1/generate", method: "POST", handler: generate });

export default http;
