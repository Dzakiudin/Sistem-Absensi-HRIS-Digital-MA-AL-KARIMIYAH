import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { APP_MODULES } from "../src/js/manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src", "js");
const outFile = join(here, "..", "public", "app.js");
const appVersionFile = join(here, "..", "app", "app-version.json");
const bodyHtmlFile = join(here, "..", "app", "body.html");
const bodyJsonFile = join(here, "..", "app", "body_html.json");

const bundle = APP_MODULES.map((file) =>
  readFileSync(join(srcDir, file), "utf8"),
).join("");

writeFileSync(outFile, bundle, "utf8");
const bundleVersion = createHash("sha256").update(bundle).digest("hex").slice(0, 16);
writeFileSync(
  appVersionFile,
  JSON.stringify({ version: bundleVersion }) + "\n",
  "utf8",
);
console.log(
  `app.js built: ${APP_MODULES.length} modules, ${bundle.length} chars, ${bundleVersion}`,
);

const bodyHtml = readFileSync(bodyHtmlFile, "utf8");
writeFileSync(bodyJsonFile, JSON.stringify({ html: bodyHtml }), "utf8");
console.log(`body_html.json built: ${bodyHtml.length} chars`);
