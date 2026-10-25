/**
 * Generates the RS256 key pair that @convex-dev/auth needs (JWT_PRIVATE_KEY + JWKS).
 *
 *   node scripts/setup-auth-keys.ts           # print the values
 *   node scripts/setup-auth-keys.ts --apply   # set them on the current deployment
 *   node scripts/setup-auth-keys.ts --apply --prod   # ...on the production deployment
 *
 * Values are piped to `npx convex env set` via stdin, so they never appear in
 * shell history or process arguments.
 */
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const prod = process.argv.includes("--prod");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const JWT_PRIVATE_KEY = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString()
  .trimEnd()
  .replace(/\n/g, " ");
const JWKS = JSON.stringify({ keys: [{ use: "sig", alg: "RS256", ...publicKey.export({ format: "jwk" }) }] });

if (!apply) {
  console.log(`JWT_PRIVATE_KEY="${JWT_PRIVATE_KEY}"`);
  console.log(`JWKS=${JWKS}`);
  console.log("\nRe-run with --apply to set these on your Convex deployment.");
  process.exit(0);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const vars: [name: string, value: string][] = [
  ["JWT_PRIVATE_KEY", JWT_PRIVATE_KEY],
  ["JWKS", JWKS],
];
for (const [name, value] of vars) {
  const args = ["convex", "env", "set", ...(prod ? ["--prod"] : []), name];
  execFileSync(npx, args, { input: value, stdio: ["pipe", "inherit", "inherit"] });
}
console.log(`✔ JWT_PRIVATE_KEY and JWKS set on the ${prod ? "production" : "dev"} deployment.`);
