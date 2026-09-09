import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";
import { searchHistory } from "../../../../drizzle/schema";
import type {
  AssignedSchool,
  EnrolmentYear,
  RankingIndexSummary,
} from "@/lib/types";
import type { HistoryEntry, HistoryListResponse } from "@/lib/types-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    id: z.string().uuid(),
    note: z.string().max(2000).optional(),
    starred: z.boolean().optional(),
  })
  .refine((input) => input.note !== undefined || input.starred !== undefined, {
    message: "At least one of note or starred is required.",
  });

type SearchHistoryRow = typeof searchHistory.$inferSelect;

function mapRow(row: SearchHistoryRow): HistoryEntry {
  return {
    id: row.id,
    addressLabel: row.addressLabel,
    longitude: row.longitude,
    latitude: row.latitude,
    enrolmentYear: row.enrolmentYear as EnrolmentYear,
    schools: row.schools as AssignedSchool[],
    warnings: row.warnings as string[],
    rankingIndex: row.rankingIndex as RankingIndexSummary,
    createdAt: row.createdAt.toISOString(),
    note: row.note,
    starred: row.starred,
  };
}

const DB_ERROR = "Saved searches are temporarily unavailable.";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view saved searches." },
      { status: 401 },
    );
  }

  try {
    const rows = await getDb()
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, user.id))
      .orderBy(desc(searchHistory.starred), desc(searchHistory.createdAt));
    const body: HistoryListResponse = { items: rows.map(mapRow) };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error("GET /api/history failed", error);
    return NextResponse.json({ error: DB_ERROR }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view saved searches." },
      { status: 401 },
    );
  }

  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request: id (uuid) plus note and/or starred." },
      { status: 400 },
    );
  }

  try {
    const rows = await getDb()
      .update(searchHistory)
      .set({
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.starred !== undefined ? { starred: input.starred } : {}),
      })
      .where(
        and(eq(searchHistory.id, input.id), eq(searchHistory.userId, user.id)),
      )
      .returning();
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Saved search not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ item: mapRow(rows[0]) }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/history failed", error);
    return NextResponse.json({ error: DB_ERROR }, { status: 500 });
  }
}
