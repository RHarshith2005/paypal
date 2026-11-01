/**
 * Demo data CLI.
 *
 * Runs through the real HTTP routes via `app.inject`, so seeding and resetting use
 * exactly the code the UI calls — no second implementation of the pipeline.
 *
 *   pnpm demo:seed     create the two cases if the database is empty
 *   pnpm demo:reset    wipe generated evidence, then reseed both cases
 */
import { buildApp } from "../app";
import { loadConfig } from "../config/env";
import { createStore } from "../db/client";

const reset = process.argv.includes("--reset");

const config = loadConfig();
const store = await createStore(config);
const app = await buildApp({ config, store, seed: false });

try {
  if (reset) {
    const response = await app.inject({ method: "POST", url: "/api/demo/reset" });
    console.log(`reset → ${response.statusCode}`);
    console.log(response.body);
    if (response.statusCode >= 300) process.exitCode = 1;
  } else {
    for (const caseLabel of ["A", "B"] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/api/demo/run",
        headers: { "content-type": "application/json" },
        payload: { case: caseLabel },
      });
      console.log(`case ${caseLabel} → ${response.statusCode}`);
      console.log(response.body);
      if (response.statusCode >= 300) process.exitCode = 1;
    }
  }
} finally {
  await app.close();
}
