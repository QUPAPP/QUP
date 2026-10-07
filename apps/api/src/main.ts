import "reflect-metadata";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createApp } from "./bootstrap/create-app.js";
import { InvalidConfigError, loadConfig } from "./config/app-config.js";

// Local development convenience only: deployed environments get their
// variables from the platform and have no .env file. Existing variables win.
const localEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await createApp(config);
  await app.listen(config.server.port, config.server.host);
}

bootstrap().catch((error: unknown) => {
  // Before the logger exists, stderr is the only channel. InvalidConfigError
  // lists variable names only, never values.
  console.error(error instanceof InvalidConfigError ? error.message : error);
  process.exit(1);
});
