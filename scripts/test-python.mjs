import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const python =
  process.env.DINNER_DATA_PYTHON ||
  (existsSync(".venv/bin/python") ? resolve(".venv/bin/python") : "python3");
for (const folder of ["backend/tests", "validation/tests"]) {
  const result = spawnSync(
    python,
    ["-m", "unittest", "discover", "-s", folder],
    {
      stdio: "inherit",
      env: { ...process.env, PYTHONPATH: resolve("validation") },
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
