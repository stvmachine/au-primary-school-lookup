import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { saveSearchHistory } from "@/lib/history-service";
import { LookupError, lookupSchools } from "@/lib/school-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookupSchema = z.object({
  address: z.string().trim().min(3).max(240),
  magicKey: z.string().trim().max(500).optional(),
  enrolmentYear: z.enum(["2026", "2027"]).default("2026"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lookup request." }, { status: 400 });
  }

  try {
    const result = await lookupSchools(parsed.data);

    // Persist the search for signed-in users. Best-effort: both helpers
    // degrade to no-ops when the DB is unavailable or the user is anonymous.
    // A dotenvx ciphertext value (no .env.keys present) counts as unset.
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && !databaseUrl.startsWith("encrypted:")) {
      const user = await getSessionUser();
      if (user) await saveSearchHistory(user.id, result);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "The lookup failed. Please try again." },
      { status: 500 },
    );
  }
}
