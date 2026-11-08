import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { z } from "zod";
import { ENDPOINTS, ErrorResponseSchema } from "@sleuth/contracts";

/**
 * Builds docs/api/openapi.yaml from the Zod schemas in packages/contracts.
 *   pnpm tsx scripts/generate-openapi.ts           write the file
 *   pnpm tsx scripts/generate-openapi.ts --check   fail if the file is out of date
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "docs", "api", "openapi.yaml");

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "openapi-3.0", io: "output" });
const jsonIn = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" });

const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorRef } },
});

function buildPaths() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of ENDPOINTS) {
    const params = [...ep.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const success: Record<string, unknown> = { description: "Success" };
    if ("response" in ep) {
      success.content = { "application/json": { schema: json(ep.response) } };
    } else if ("contentType" in ep) {
      success.content = { [ep.contentType]: { schema: { type: "string" } } };
    }
    const operation: Record<string, unknown> = {
      operationId: ep.id,
      summary: ep.summary,
      parameters: params,
      responses: {
        [String(ep.successStatus)]: success,
        "400": errorResponse("Invalid request"),
        "401": errorResponse("Sign-in required"),
        "403": errorResponse("Not allowed (for example, the demo project is read-only)"),
        "404": errorResponse("Not found"),
        "409": errorResponse("Conflict with current state"),
      },
    };
    if ("request" in ep) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: jsonIn(ep.request) } },
      };
    }
    const entry = (paths[ep.path] ??= {});
    entry[ep.method.toLowerCase()] = operation;
  }
  return paths;
}

const doc = {
  openapi: "3.0.3",
  info: {
    title: "SLEUTH API",
    version: "0.1.0",
    description:
      "Generated from packages/contracts. Do not edit by hand; run `pnpm tsx scripts/generate-openapi.ts`. Timestamps are integer milliseconds from video start.",
  },
  servers: [{ url: "/api/v1" }],
  paths: buildPaths(),
  components: { schemas: { ErrorResponse: json(ErrorResponseSchema) } },
};

const text = stringify(doc, { lineWidth: 0 });

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (current.replace(/\r\n/g, "\n") !== text) {
    console.error(
      "docs/api/openapi.yaml is out of date. Run: pnpm tsx scripts/generate-openapi.ts",
    );
    process.exit(1);
  }
  console.log("openapi.yaml matches the contracts.");
} else {
  writeFileSync(outPath, text);
  console.log(`Wrote ${outPath}`);
}
