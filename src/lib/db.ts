import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.NEON_DATABASE_URL ??
  process.env.NEON_POSTGRES_URL ??
  process.env.NEON_POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL non è configurata. Collega l'integrazione Neon al progetto.");
}

export const db = neon(databaseUrl);
