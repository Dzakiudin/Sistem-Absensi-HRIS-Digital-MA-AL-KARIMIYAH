/* eslint-disable */
/* Task runner: build & jalankan backend app.exe di Windows.
   - Matikan proses yang menempel port 8080 (server lama) jika ada.
   - Mulai backend/app.exe baru sebagai proses terpisah (hidden).
   Jalankan via `npm run backend:run` dari folder frontend. */
const { execSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..", "..");
const exe = path.join(root, "backend", "app.exe");
const cwd = path.join(root, "backend");
const port = process.env.PORT || "8080";

function prosesDiPort(port) {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (
      line.includes("LISTENING") &&
      (line.includes(`:${port} `) || line.includes(`:${port}`))
    ) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
  }
  return [...pids];
}

if (!fs.existsSync(exe)) {
  console.error(
    "Tidak menemukan backend/app.exe. Jalankan `npm run backend:build` dulu.",
  );
  process.exit(1);
}

const victims = prosesDiPort(port);
if (victims.length) {
  console.log(
    `Menghentikan proses lama pada port ${port}: ${victims.join(", ")}`,
  );
  for (const pid of victims) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } catch (e) {
      /* sudah hilang */
    }
  }
  // Beri waktu OS melepas port.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await sleep(1200);
    mulai();
  })();
} else {
  mulai();
}

function mulai() {
  console.log(`Menjalankan ${exe} ...`);
  const child = spawn(exe, [], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
