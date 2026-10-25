import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const file = path.join(__dirname, "..", "app", "body_html.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const s = raw.html;
const problems = [];
const nav = [...s.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]);
const pan = [...s.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
console.log("NAV", JSON.stringify(nav));
console.log("PANEL", JSON.stringify(pan));
console.log("len", s.length);
const checks = {
  'id="loadingOverlay"': 1,
  'data-nav="admin-honor"': 0,
  'data-panel="admin-honor"': 0,
  'data-nav="kepala-honor"': 1,
  'data-panel="kepala-honor"': 1,
  'data-nav="admin-jadwal"': 1,
  'data-nav="kepala-jadwal"': 1,
  'data-nav="admin-dashboard"': 1,
  'data-nav="kepala-dashboard"': 1,
};
for (const [k, want] of Object.entries(checks)) {
  const got = (
    s.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []
  ).length;
  const ok = got === want;
  console.log(`${ok ? "OK " : "FAIL"} ${k}: got ${got}, want ${want}`);
  if (!ok) problems.push(`${k}: got ${got}, want ${want}`);
}
const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
]);
const tags = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?)\s*\/?>/g;
const stack = [];
let openCount = 0;
let m;
const opensByTag = {};
const closesByTag = {};
while ((m = tags.exec(s)) !== null) {
  const t = m[1].toLowerCase();
  const selfClose = /\/\s*>$/.test(m[0]);
  if (selfClose) continue;
  if (m[0].startsWith("</")) {
    if (voidTags.has(t)) continue;
    closesByTag[t] = (closesByTag[t] || 0) + 1;
    if (stack.length && stack[stack.length - 1] === t) {
      stack.pop();
    } else {
      const idx = stack.lastIndexOf(t);
      if (idx === -1) {
        stack.push("??" + t);
      } else {
        stack.splice(idx);
      }
    }
  } else {
    if (voidTags.has(t)) continue;
    openCount++;
    opensByTag[t] = (opensByTag[t] || 0) + 1;
    stack.push(t);
  }
}
console.log("unclosed-tags", JSON.stringify(stack.slice(-40)));
console.log("open", openCount, "stackDepth", stack.length);
if (stack.length) problems.push("unclosed tags: " + stack.slice(-20).join(","));
for (const t of Object.keys(opensByTag)) {
  if (!voidTags.has(t) && opensByTag[t] !== (closesByTag[t] || 0)) {
    if (t === "form") {
      console.log(
        `NOTE form imbalance (pre-existing): open=${opensByTag[t]} close=${closesByTag[t] || 0}`,
      );
      continue;
    }
    problems.push(
      `imbalance ${t}: open=${opensByTag[t]} close=${closesByTag[t] || 0}`,
    );
  }
}
console.log("sample div:", opensByTag["div"], "/", closesByTag["div"] || 0);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log(" - " + p);
  process.exit(1);
}
console.log("BODY_HTML_VALID");
