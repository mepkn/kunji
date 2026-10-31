import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keeps each app's cached tool list fresh (SPEC.md → /mcp); admin Refresh still works any time.
crons.interval("refresh app tools", { hours: 6 }, internal.apps.refreshAllTools, {});

export default crons;
