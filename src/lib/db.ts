import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL non è configurata. Collega l'integrazione Neon al progetto.");
}

export const db = neon(databaseUrl);
