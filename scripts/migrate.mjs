// Applies pending Drizzle migrations before `next build`.
// Skips quietly when no database is configured, so builds never depend on one.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Neon on Vercel provides a direct (unpooled) URL, which suits migrations best.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.log("[migrate] No DATABASE_URL set; skipping migrations.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database is up to date.");
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
