import { NextResponse } from "next/server";
import { z } from "zod";
import { LookupError, suggestVictorianAddresses } from "@/lib/school-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(3).max(160);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(searchParams.get("q"));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter at least 3 characters." },
      { status: 400 },
    );
  }

  try {
    const suggestions = await suggestVictorianAddresses(parsed.data);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof LookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Something went wrong while suggesting addresses." },
      { status: 500 },
    );
  }
}
