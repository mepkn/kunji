import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { generate } from "./gateway";
import { handle as mcp, preflight } from "./mcp";

const http = httpRouter();

auth.addHttpRoutes(http);

// Apps call this server to server with their secret (SPEC.md → Gateway).
http.route({ path: "/ai/v1/generate", method: "POST", handler: generate });

// AI clients, with a person's kj_… token (SPEC.md → /mcp).
http.route({ path: "/mcp", method: "POST", handler: mcp });
http.route({ path: "/mcp", method: "GET", handler: mcp });
http.route({ path: "/mcp", method: "OPTIONS", handler: preflight });

export default http;
