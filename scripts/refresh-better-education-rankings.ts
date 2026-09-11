// Refreshes the Better Education "top government primary schools in Melbourne"
// ranking by scraping the live page from this machine (production hosts are
// IP-blocked) and upserting the result into the app's Postgres database.
// Run from next-app/: `dotenvx run -- bun scripts/refresh-better-education-rankings.ts`

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { sql } from "drizzle-orm";

import { betterEducationRankings } from "../drizzle/schema";
import { getDb } from "@/lib/db";
import { parseRankingHtml } from "@/lib/school-service";

const execFileAsync = promisify(execFile);

const BETTER_EDUCATION_URL =
  "https://bettereducation.com.au/school/Primary/vic/melbourne_top_government_primary_schools.aspx";
const RANKING_ID = "primary-melbourne";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// bettereducation.com.au sits behind Cloudflare and rejects non-browser TLS
// fingerprints (bun/node fetch gets 403; curl passes), so curl is primary.
async function fetchRankingHtml(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "--max-time", "30", "-A", CHROME_UA, "-H", "Accept-Language: en-AU,en;q=0.9", url],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    if (stdout.includes("ctl00_ContentPlaceHolder1_GridView1")) return stdout;
  } catch {
    // fall through to fetch
  }
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "User-Agent": CHROME_UA,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status}: ${BETTER_EDUCATION_URL}`);
  }
  return response.text();
}

async function main() {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl || rawDatabaseUrl.startsWith("encrypted:")) {
    throw new Error(
      "DATABASE_URL is not set (or .env.keys is missing so dotenvx could not decrypt it).",
    );
  }

  const html = await fetchRankingHtml(BETTER_EDUCATION_URL);
  const ranking = parseRankingHtml(html, "live-direct");
  const capturedAt = new Date();

  await getDb()
    .insert(betterEducationRankings)
    .values({
      id: RANKING_ID,
      title: ranking.title,
      sourceUrl: ranking.sourceUrl,
      rankingYear: ranking.rankingYear,
      totalRankedSchools: ranking.totalRankedSchools,
      entries: ranking.entries,
      source: "live-direct",
      capturedAt,
    })
    .onConflictDoUpdate({
      target: betterEducationRankings.id,
      set: {
        title: sql`excluded.title`,
        sourceUrl: sql`excluded.source_url`,
        rankingYear: sql`excluded.ranking_year`,
        totalRankedSchools: sql`excluded.total_ranked_schools`,
        entries: sql`excluded.entries`,
        source: sql`excluded.source`,
        capturedAt: sql`excluded.captured_at`,
        updatedAt: sql`now()`,
      },
    });

  console.log(
    `Refreshed Better Education ranking: year=${ranking.rankingYear} entries=${ranking.entries.length} capturedAt=${capturedAt.toISOString()}`,
  );
}

main().catch((error) => {
  console.error("Failed to refresh Better Education rankings:", error);
  process.exit(1);
});
