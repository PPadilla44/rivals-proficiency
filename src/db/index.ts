import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // `prepare: false` keeps it compatible with pooled connections (Neon, Supabase, Vercel).
  return (globalForDb.pg ??= postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5) }));
}

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  return (instance ??= drizzle(client(), { schema }));
}

export type Db = ReturnType<typeof getDb>;
export { schema };
