import "dotenv/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: NodePgDatabase<typeof schema> | null = null;

function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> | null {
  const p = getPool();
  if (!p) return null;
  if (!dbInstance) {
    dbInstance = drizzle(p, { schema });
  }
  return dbInstance;
}

/** Throws if DATABASE_URL is not configured. Use for routes that require persistence. */
export function requireDb(): NodePgDatabase<typeof schema> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured. Start Postgres (docker compose up -d) and set DATABASE_URL.");
  return db;
}

export { schema };
