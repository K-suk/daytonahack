import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import { config } from "dotenv";
config({ path: process.env.DINNER_DATA_ENV_FILE || ".env" });
const front = Number(process.env.PORT || 4312),
  back = Number(process.env.DINNER_BACKEND_PORT || 8787);
const python =
  process.env.DINNER_DATA_PYTHON ||
  (existsSync(".venv/bin/python") ? resolve(".venv/bin/python") : "python3");
const env = {
  ...process.env,
  DINNER_DATA_PYTHON: python,
  DINNER_BACKEND_PORT: String(back),
  DINNER_BACKEND_URL: `http://127.0.0.1:${back}`,
};
async function free(port) {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", () =>
      reject(
        Error(
          `Port ${port} is in use. Set PORT and DINNER_BACKEND_PORT to unused ports.`,
        ),
      ),
    );
    s.listen(port, "127.0.0.1", () => s.close(resolve));
  });
}
try {
  await free(front);
  await free(back);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const [command, args] of [
  [python, ["backend/server.py"]],
  [
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(front),
    ],
  ],
]) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  children.push(child);
  child.on("error", () => {
    console.error(
      "Startup failed. Check the Python interpreter and installed dependencies.",
    );
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
console.log(`Dinner Scout: http://127.0.0.1:${front} (live, saved, demo)`);
