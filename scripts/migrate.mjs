import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarQuote = null;
  let lineComment = false;
  let blockCommentDepth = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 1;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) {
        index += 1;
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }

    if (current === "-" && next === "-") {
      lineComment = true;
      index += 1;
    } else if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 1;
    } else if (current === "'" || current === '"') {
      quote = current;
    } else if (current === "$") {
      const tag = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(sql.slice(index))?.[0];
      if (tag) {
        dollarQuote = tag;
        index += tag.length - 1;
      }
    } else if (current === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  if (quote || dollarQuote || blockCommentDepth > 0) {
    throw new Error("Migrazione SQL non valida: stringa o commento non terminato.");
  }

  const remainder = sql.slice(start).trim();
  if (remainder) statements.push(remainder);
  return statements;
}

const migrationsDirectory = new URL("../database/migrations/", import.meta.url);
const migrationsPath = fileURLToPath(migrationsDirectory);
const migrationFiles = (await readdir(migrationsPath))
  .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
  .sort();
if (migrationFiles.length === 0) {
  throw new Error("Non sono state trovate migrazioni SQL in database/migrations.");
}

const migrations = await Promise.all(migrationFiles.map(async (file) => ({
  name: file.slice(0, -4),
  statements: splitSqlStatements(await readFile(new URL(file, migrationsDirectory), "utf8")),
})));

if (process.argv.includes("--check")) {
  for (const migration of migrations) {
    console.log(`${migration.name}: ${migration.statements.length} istruzioni SQL valide.`);
  }
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Configura DATABASE_URL prima di avviare le migrazioni.");
}
const sql = neon(connectionString);

await sql`
  CREATE TABLE IF NOT EXISTS "_Migrations" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;
for (const migrationFile of migrationFiles) {
  const migrationName = migrationFile.slice(0, -4);
  const [applied] = await sql`SELECT "name" FROM "_Migrations" WHERE "name" = ${migrationName} LIMIT 1`;
  if (applied) {
    console.log(`Migrazione ${migrationName} già applicata.`);
    continue;
  }

  const migration = migrations.find((item) => item.name === migrationName);
  await sql.transaction((transaction) => [
    ...migration.statements.map((statement) => transaction.query(statement)),
    transaction`INSERT INTO "_Migrations" ("name") VALUES (${migrationName})`,
  ]);
  console.log(`Migrazione ${migrationName} applicata.`);
}
