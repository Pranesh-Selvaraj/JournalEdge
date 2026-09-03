import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const { Client } = pg;

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/journaledge_db";
  const client = new Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client);
  console.log("Running migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
