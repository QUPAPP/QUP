import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

import type { PasswordHasher } from "../domain/ports.js";

/**
 * Argon2id (SECURITY.md) with the OWASP Password Storage Cheat Sheet baseline:
 * m = 19 MiB, t = 2, p = 1. Parameters are embedded in each stored hash, so
 * raising them later only affects new hashes.
 *
 * `algorithm` is the numeric value of @node-rs/argon2's `Algorithm.Argon2id`;
 * that enum is an ambient `const enum`, which isolatedModules cannot import.
 */
const ARGON2ID = 2;
const MEMORY_COST_KIB = 19_456;
const TIME_COST = 2;
const PARALLELISM = 1;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: MEMORY_COST_KIB,
  timeCost: TIME_COST,
  parallelism: PARALLELISM,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // A malformed stored hash is a failed login, not a server error.
      return false;
    }
  }
}
