import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Configura DATABASE_URL prima di avviare le migrazioni.");
}

const sql = neon(connectionString);
const migrationName = "001_initial";
const migrationPath = fileURLToPath(new URL("../database/migrations/001_initial.sql", import.meta.url));
const migration = await readFile(migrationPath, "utf8");
const statements = migration
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

await sql`
  CREATE TABLE IF NOT EXISTS "_Migrations" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;
const [applied] = await sql`SELECT "name" FROM "_Migrations" WHERE "name" = ${migrationName} LIMIT 1`;
if (applied) {
  console.log(`Migrazione ${migrationName} già applicata.`);
} else {
  await sql.transaction((transaction) => [
    ...statements.map((statement) => transaction.query(statement)),
    transaction`INSERT INTO "_Migrations" ("name") VALUES (${migrationName})`,
  ]);
  console.log(`Migrazione ${migrationName} applicata.`);
}
