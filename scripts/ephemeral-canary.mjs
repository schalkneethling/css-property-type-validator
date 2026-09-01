import { randomUUID } from "node:crypto";
import process from "node:process";

import { readBodyBounded } from "./lib/guardrail-utils.mjs";

const MAX_CANARY_RESPONSE_BYTES = 1024 * 1024;

const serviceOrigin = process.env.CPTV_EPHEMERAL_ORIGIN ?? "https://ephemeral.schalkneethling.com";
const syntheticHtml =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>CPTV compatibility canary</title></head><body><p>Non-sensitive synthetic compatibility canary.</p></body></html>';
const createResponse = await fetch(new URL("/api/pages", serviceOrigin), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": `cptv-canary-${randomUUID()}`,
    "User-Agent": "css-property-type-validator-ephemeral-canary",
  },
  body: JSON.stringify({ html: syntheticHtml, expirationHours: 1 }),
});

if (!createResponse.ok)
  throw new Error(
    `Ephemeral canary upload failed closed: ${createResponse.status} ${
      (await readBodyBounded(createResponse, MAX_CANARY_RESPONSE_BYTES)) ?? "[body exceeded 1 MiB]"
    }`,
  );
const createdBody = await readBodyBounded(createResponse, MAX_CANARY_RESPONSE_BYTES);
if (createdBody === null)
  throw new Error("Ephemeral canary upload response exceeded its 1 MiB limit.");
const created = JSON.parse(createdBody);
if (typeof created.id !== "string")
  throw new Error("Ephemeral canary response omitted the page ID.");

const contentResponse = await fetch(
  new URL(`/api/pages/${encodeURIComponent(created.id)}/content`, serviceOrigin),
);
const failures = [];
if (!contentResponse.ok) failures.push(`content status ${contentResponse.status}`);
if (contentResponse.headers.get("x-content-type-options") !== "nosniff")
  failures.push("missing nosniff");
if (contentResponse.headers.get("x-robots-tag") !== "noindex") failures.push("missing noindex");
const csp = contentResponse.headers.get("content-security-policy") ?? "";
for (const directive of [
  "sandbox allow-scripts",
  "default-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
]) {
  if (!csp.includes(directive)) failures.push(`missing CSP ${directive}`);
}
if (/(^|;)\s*connect-src\s+/u.test(csp)) failures.push("unexpected connect-src override");
if ((await readBodyBounded(contentResponse, MAX_CANARY_RESPONSE_BYTES)) !== syntheticHtml)
  failures.push("content bytes changed");

if (failures.length > 0) {
  throw new Error(`Ephemeral canary failed: ${failures.join(", ")}`);
}
console.log(`Ephemeral synthetic canary passed; it expires automatically: ${created.url}`);
