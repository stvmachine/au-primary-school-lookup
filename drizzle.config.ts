import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only used by drizzle-kit push/migrate. `generate` works offline.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
