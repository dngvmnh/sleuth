import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGoldenFixture, FIXTURE_FILES } from "./build";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "proofpay-demo");
mkdirSync(outDir, { recursive: true });

const fixture = buildGoldenFixture();
for (const key of Object.keys(FIXTURE_FILES) as (keyof typeof FIXTURE_FILES)[]) {
  writeFileSync(
    join(outDir, `${FIXTURE_FILES[key]}.json`),
    `${JSON.stringify(fixture[key], null, 2)}\n`,
  );
}
console.log(`Wrote ${Object.keys(FIXTURE_FILES).length} files to ${outDir}`);
