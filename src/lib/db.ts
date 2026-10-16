import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Il driver restituisce righe come oggetti indicizzati: tipizziamo il client così, senza union ambigue.
type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

function connect(): Sql {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL non è configurata.");
    client = neon(databaseUrl);
  }
  return client;
}

// Client pigro: la connessione viene creata alla prima query, così il build non richiede il database.
export const db = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    const sql = connect() as unknown as (...input: unknown[]) => unknown;
    return sql(...args);
  },
  get(_target, property) {
    const sql = connect() as unknown as Record<string | symbol, unknown>;
    const value = sql[property];
    return typeof value === "function" ? value.bind(sql) : value;
  },
}) as Sql;
