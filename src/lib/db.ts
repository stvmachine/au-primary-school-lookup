import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../../drizzle/schema";

// Lazy singleton: the pg Pool is created only on the first getDb() call and
// only connects when a query is first executed. Importing this module never
// connects to or requires a reachable database.
let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    const raw = process.env.DATABASE_URL;
    // dotenvx injects raw ciphertext when .env.keys is absent; treat it as unset.
    const connectionString = raw && !raw.startsWith("encrypted:") ? raw : undefined;
    pool = new pg.Pool(connectionString ? { connectionString } : undefined);
    db = drizzle(pool, { schema });
  }
  return db;
}
