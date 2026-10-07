import "reflect-metadata";

import { existsSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.js";
import { InvalidConfigError, loadConfig } from "../config/app-config.js";
import { AdminBootstrapService } from "../modules/auth/application/admin-bootstrap.service.js";
import { registerBody } from "../modules/auth/presentation/auth.dto.js";

/**
 * Creates (or promotes) an administrator.
 *
 *   pnpm admin:create --email admin@example.com
 *   pnpm admin:create --phone +966500000000
 *
 * The password is never taken as an argument — arguments end up in shell
 * history and process listings. It is read from QUP_ADMIN_PASSWORD, or typed
 * at a hidden prompt when running in a terminal.
 */

const localEnvFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

const PASSWORD_ENV = "QUP_ADMIN_PASSWORD";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // Suppress echo of typed characters; only the prompt itself is written.
    const writer = rl as unknown as { _writeToOutput: (text: string) => void };
    writer._writeToOutput = (text) => {
      if (text.includes(question)) stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env[PASSWORD_ENV];
  if (fromEnv) return fromEnv;
  if (!stdin.isTTY) {
    throw new Error(`No terminal to prompt in; set ${PASSWORD_ENV} instead.`);
  }
  const first = await promptHidden("Password: ");
  const second = await promptHidden("Repeat password: ");
  if (first !== second) throw new Error("Passwords do not match.");
  return first;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, phone: { type: "string" } },
    strict: true,
  });

  const parsed = registerBody.safeParse({ ...values, password: await readPassword() });
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "input"}: ${i.message}`,
    );
    throw new Error(`Invalid input:\n${problems.join("\n")}`);
  }

  const config = loadConfig({ ...process.env, LOG_LEVEL: process.env.LOG_LEVEL ?? "warn" });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    abortOnError: false,
    logger: false,
  });
  try {
    const result = await app.get(AdminBootstrapService).ensureAdmin(parsed.data);
    const messages = {
      created: "Administrator created.",
      promoted: "Existing account granted ADMIN. Its password was not changed.",
      "already-admin": "Account is already an administrator. Nothing changed.",
    } as const;
    console.log(`${messages[result.outcome]} (user id ${result.userId})`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof InvalidConfigError || error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
