import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Configura DATABASE_URL prima di avviare le migrazioni.");
}

const sql = neon(connectionString);
const migrationsDir = fileURLToPath(new URL("../database/migrations/", import.meta.url));

// Divide un file SQL in statement, rispettando stringhe, commenti e dollar-quoting ($$ ... $$).
function splitStatements(source) {
  const statements = [];
  let current = "";
  let quote = null; // ' | " | $tag$
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const rest = source.slice(index);

    if (lineComment) {
      if (char === "\n") lineComment = false;
      else continue;
    } else if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
        continue;
      }
      current += char;
      continue;
    } else if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
    } else if (quote) {
      if (char === quote) {
        if (next === quote) {
          current += char + next;
          index += 1;
          continue;
        }
        quote = null;
      }
    } else {
      if (char === "-" && next === "-") {
        lineComment = true;
        index += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
      } else if (char === "$") {
        const match = /^\$[A-Za-z_0-9]*\$/.exec(rest);
        if (match) {
          dollarTag = match[0];
          current += dollarTag;
          index += dollarTag.length - 1;
          continue;
        }
      } else if (char === ";") {
        if (current.trim()) statements.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

await sql`
  CREATE TABLE IF NOT EXISTS "_Migrations" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of files) {
  const name = file.replace(/\.sql$/, "");
  const [applied] = await sql`SELECT "name" FROM "_Migrations" WHERE "name" = ${name} LIMIT 1`;
  if (applied) {
    console.log(`Migrazione ${name} già applicata.`);
    continue;
  }
  const source = await readFile(`${migrationsDir}${file}`, "utf8");
  const statements = splitStatements(source);
  for (const statement of statements) {
    await sql.query(statement);
  }
  await sql`INSERT INTO "_Migrations" ("name") VALUES (${name})`;
  console.log(`Migrazione ${name} applicata (${statements.length} statement).`);
}

console.log("Tutte le migrazioni sono aggiornate.");
