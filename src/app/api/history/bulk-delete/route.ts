import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";
import { searchHistory } from "../../../../../drizzle/schema";

export const runtime = "nodejs";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view saved searches." },
      { status: 401 },
    );
  }

  let input: z.infer<typeof bulkDeleteSchema>;
  try {
    input = bulkDeleteSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request: ids must be 1–500 uuids." },
      { status: 400 },
    );
  }

  try {
    const deleted = await getDb()
      .delete(searchHistory)
      .where(
        and(
          eq(searchHistory.userId, user.id),
          inArray(searchHistory.id, input.ids),
        ),
      )
      .returning({ id: searchHistory.id });
    return NextResponse.json({ deleted: deleted.length }, { status: 200 });
  } catch (error) {
    console.error("POST /api/history/bulk-delete failed", error);
    return NextResponse.json(
      { error: "Saved searches are temporarily unavailable." },
      { status: 500 },
    );
  }
}
