import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

function getDatabaseUrl() {
  return [
    process.env.DATABASE_URL,
    process.env.NEON_DATABASE_URL,
    process.env.NEON_POSTGRES_URL,
    process.env.NEON_POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
  ].find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

let client: ReturnType<typeof neon> | undefined;

function getClient() {
  if (client) return client;

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Nessuna URL di connessione Neon valida è configurata.");
  }

  client = neon(databaseUrl);
  return client;
}

export const db = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  return getClient()(strings, ...values) as Promise<Record<string, any>[]>;
}) as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, any>[]>;
