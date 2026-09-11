import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import type {
  AddressResult,
  AddressSuggestion,
  AssignedSchool,
  EnrolmentYear,
  RankingEntry,
  RankingIndex,
  RankingSource,
  SchoolLookupResponse,
} from "@/lib/types";
import { betterEducationPrimaryFallback } from "@/data/betterEducationPrimaryFallback";
import { betterEducationRankings } from "../../drizzle/schema";
import { getDb } from "@/lib/db";

const MAPSHARE_GEOCODER =
  "https://corp-geo.mapshare.vic.gov.au/arcgis/rest/services/Geocoder/VMAddressEZIAdd/GeocodeServer";
const FIND_MY_SCHOOL_BASE = "https://www.findmyschool.vic.gov.au";
const BETTER_EDUCATION_URL =
  "https://bettereducation.com.au/school/Primary/vic/melbourne_top_government_primary_schools.aspx";
// Public reader/proxy mirrors have all been tried and do not work for this
// site: translate.goog returns 400, archive.org excludes it (403), and
// allorigins/codetabs time out. Datacenter IPs are rejected outright, so the
// bundled snapshot in src/data/ is the only reliable fallback.

const RANKING_CACHE_MS = 6 * 60 * 60 * 1000;
const SCHOOL_CACHE_MS = 6 * 60 * 60 * 1000;

export class LookupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LookupError";
  }
}

type MapshareSuggestion = {
  text?: string;
  magicKey?: string;
  isCollection?: boolean;
};

type MapshareCandidate = {
  address?: string;
  location?: { x?: number; y?: number };
  score?: number;
};

type BoundaryResult = {
  School_Name?: string;
  Campus_Name?: string;
  Year_Level?: string | number;
  Boundary_Year?: string | number;
  Entity_Code?: string | number;
};

type FmsSchoolProperties = {
  School_Name?: string;
  Campus_Name?: string;
  Campus_Address_Line?: string;
  Campus_Address_Town?: string;
  Campus_Address_State?: string;
  Campus_Postcode?: string | number;
  School_Phone?: string;
  School_Website?: string;
  Campus_Year_Levels?: string;
  Zone?: string;
  Type?: string;
  Region?: string;
  Entity_Code?: string | number;
};

type FmsSchoolFeature = {
  properties?: FmsSchoolProperties;
  geometry?: { type?: string; coordinates?: [number, number] };
};

type CachedRanking = { expiresAt: number; value: RankingIndex };
type CachedSchools = {
  expiresAt: number;
  byEntityCode: Map<string, FmsSchoolFeature>;
};

let rankingCache: CachedRanking | null = null;
const schoolCaches = new Map<EnrolmentYear, CachedSchools>();

async function fetchText(url: string, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  return { response, body };
}

async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Victorian School Zone Lookup)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${url}`);
  }
  return (await response.json()) as T;
}

function titleCaseAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\bVic\b/g, "VIC");
}

function dedupeSuggestions(suggestions: AddressSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function suggestVictorianAddresses(query: string): Promise<AddressSuggestion[]> {
  const url = new URL(`${MAPSHARE_GEOCODER}/suggest`);
  url.searchParams.set("text", query);
  url.searchParams.set("f", "json");

  const payload = await fetchJson<{ suggestions?: MapshareSuggestion[] }>(url.toString());
  const suggestions = (payload.suggestions ?? [])
    .filter((item) => item.text && item.magicKey && !item.isCollection)
    .map((item) => ({
      text: titleCaseAddress(item.text!.trim()),
      magicKey: item.magicKey!,
    }));

  return dedupeSuggestions(suggestions).slice(0, 8);
}

async function resolveAddress(
  address: string,
  magicKey?: string,
): Promise<AddressResult> {
  let selectedText = address.trim();
  let selectedMagicKey = magicKey?.trim();

  if (!selectedMagicKey) {
    const suggestions = await suggestVictorianAddresses(selectedText);
    const first = suggestions[0];
    if (!first) {
      throw new LookupError(
        404,
        "No Victorian address suggestion matched that search.",
      );
    }
    selectedText = first.text;
    selectedMagicKey = first.magicKey;
  }

  const url = new URL(`${MAPSHARE_GEOCODER}/findAddressCandidates`);
  url.searchParams.set("f", "json");
  url.searchParams.set("SingleLine", selectedText);
  url.searchParams.set("magicKey", selectedMagicKey);
  url.searchParams.set("spatialReference", JSON.stringify({ wkid: 4326 }));

  const payload = await fetchJson<{ candidates?: MapshareCandidate[] }>(url.toString());
  const candidate = payload.candidates?.[0];
  const longitude = candidate?.location?.x;
  const latitude = candidate?.location?.y;

  if (
    !candidate ||
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    longitude < 140.7 ||
    longitude > 150.2 ||
    latitude < -39.4 ||
    latitude > -33.8
  ) {
    throw new LookupError(
      404,
      "The address could not be resolved to a Victorian location.",
    );
  }

  return {
    input: address,
    label: titleCaseAddress(candidate.address ?? selectedText),
    longitude,
    latitude,
    score: candidate.score,
  };
}

async function getSchoolIndex(year: EnrolmentYear) {
  const cached = schoolCaches.get(year);
  if (cached && cached.expiresAt > Date.now()) return cached.byEntityCode;

  const url = `${FIND_MY_SCHOOL_BASE}/schools/schools-${year}.json`;
  const collection = await fetchJson<{ features?: FmsSchoolFeature[] }>(url, 30000);
  const byEntityCode = new Map<string, FmsSchoolFeature>();

  for (const feature of collection.features ?? []) {
    const entityCode = feature.properties?.Entity_Code;
    if (entityCode !== undefined) byEntityCode.set(String(entityCode), feature);
  }

  schoolCaches.set(year, {
    expiresAt: Date.now() + SCHOOL_CACHE_MS,
    byEntityCode,
  });
  return byEntityCode;
}

async function lookupBoundary(
  year: EnrolmentYear,
  kind: "primary" | "year7",
  address: AddressResult,
): Promise<BoundaryResult | null> {
  const coordinates = `${address.longitude},${address.latitude}`;
  const url = `${FIND_MY_SCHOOL_BASE}/lookup/${year}/${kind}/${coordinates}`;
  const payload = await fetchJson<{ result?: BoundaryResult; error?: string }>(url.toString());
  return payload.result ?? null;
}

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRankingHtml(html: string, source: RankingSource): RankingIndex {
  const $ = cheerio.load(html);
  const table = $("#ctl00_ContentPlaceHolder1_GridView1");
  const entries: RankingEntry[] = [];

  table.find("tr").slice(1).each((_, row) => {
    const cells = $(row)
      .find("th,td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());
    const rank = parseNumber(cells[0]);
    if (rank === null || cells.length < 10) return;

    entries.push({
      rank,
      school: cells[1],
      postcode: cells[2],
      stateOverallScore: parseNumber(cells[3]),
      betterEducationPercentile: cells[4],
      english: cells[5] || null,
      maths: cells[6] || null,
      totalEnrolments: parseNumber(cells[7]),
      ses: parseNumber(cells[9]),
    });
  });

  if (entries.length === 0) {
    throw new Error(`Better Education ranking table was unavailable from ${source}.`);
  }

  const bodyText = $.root().text().replace(/\s+/g, " ");
  const yearMatch = bodyText.match(/following table lists the\s+(\d{4})\s+best government primary schools/i);
  const title = $("h1").first().text().replace(/\s+/g, " ").trim() ||
    "Top Public Primary Schools in Melbourne - Latest Results";

  return {
    sourceUrl: BETTER_EDUCATION_URL,
    title,
    rankingYear: yearMatch ? Number(yearMatch[1]) : betterEducationPrimaryFallback.metadata.rankingYear,
    totalRankedSchools: entries.length,
    checkedAt: new Date().toISOString(),
    source,
    entries,
  };
}

function fallbackRankingIndex(): RankingIndex {
  const fallback = betterEducationPrimaryFallback;
  return {
    sourceUrl: fallback.metadata.sourceUrl,
    title: fallback.metadata.title,
    rankingYear: fallback.metadata.rankingYear,
    totalRankedSchools: fallback.schools.length,
    checkedAt: fallback.metadata.capturedAt,
    source: "snapshot",
    entries: fallback.schools.map((entry) => ({
      rank: entry.rank,
      school: entry.school,
      postcode: entry.postcode,
      stateOverallScore: entry.stateOverallScore,
      betterEducationPercentile: entry.betterEducationPercentile,
      english: entry.english,
      maths: entry.maths,
      totalEnrolments: entry.totalEnrolments,
      ses: entry.ses,
    })),
  };
}

const RANKING_ID_PRIMARY_MELBOURNE = "primary-melbourne";

async function getDatabaseRankingIndex(): Promise<RankingIndex | null> {
  const raw = process.env.DATABASE_URL;
  // dotenvx injects raw ciphertext when .env.keys is absent; treat it as unset.
  if (!raw || raw.startsWith("encrypted:")) return null;

  const row = await getDb()
    .select()
    .from(betterEducationRankings)
    .where(eq(betterEducationRankings.id, RANKING_ID_PRIMARY_MELBOURNE))
    .limit(1);
  const record = row[0];
  if (!record) return null;

  return {
    sourceUrl: record.sourceUrl,
    title: record.title,
    rankingYear: record.rankingYear,
    totalRankedSchools: record.totalRankedSchools,
    checkedAt: record.capturedAt.toISOString(),
    source: "database",
    entries: record.entries as RankingEntry[],
  };
}

async function getRankingIndex(): Promise<RankingIndex> {
  if (rankingCache && rankingCache.expiresAt > Date.now()) return rankingCache.value;

  const attempts: Array<{ url: string; source: RankingSource }> = [
    { url: BETTER_EDUCATION_URL, source: "live-direct" },
  ];

  for (const attempt of attempts) {
    try {
      const { response, body } = await fetchText(attempt.url, 30000);
      if (!response.ok) continue;
      const ranking = parseRankingHtml(body, attempt.source);
      rankingCache = {
        expiresAt: Date.now() + RANKING_CACHE_MS,
        value: ranking,
      };
      return ranking;
    } catch (error) {
      console.warn(
        `Better Education live refresh failed via ${attempt.source}:`,
        error,
      );
      // Fall back to the database, then the bundled snapshot.
    }
  }

  try {
    const databaseRanking = await getDatabaseRankingIndex();
    if (databaseRanking) {
      rankingCache = {
        expiresAt: Date.now() + RANKING_CACHE_MS,
        value: databaseRanking,
      };
      return databaseRanking;
    }
  } catch (error) {
    console.warn("Better Education database read failed:", error);
  }

  const fallback = fallbackRankingIndex();
  rankingCache = {
    expiresAt: Date.now() + 10 * 60 * 1000,
    value: fallback,
  };
  return fallback;
}

function normaliseSchoolName(value: string) {
  return value
    .split(",")[0]
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/\b(st)\b/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchRanking(
  schoolName: string,
  schoolPostcode: string,
  entries: RankingEntry[],
): RankingEntry | null {
  const target = normaliseSchoolName(schoolName);
  const matches = entries.filter((entry) => normaliseSchoolName(entry.school) === target);
  if (matches.length === 0) return null;
  return matches.find((entry) => entry.postcode === schoolPostcode) ?? matches[0];
}

function toAssignedSchool(
  role: "primary" | "secondary",
  boundary: BoundaryResult,
  feature: FmsSchoolFeature | undefined,
  rankingIndex: RankingIndex,
): AssignedSchool {
  const properties = feature?.properties ?? {};
  const name = properties.School_Name ?? boundary.School_Name ?? "Unknown school";
  const postcode = String(
    properties.Campus_Postcode ?? "",
  );
  const ranking = role === "primary" ? matchRanking(name, postcode, rankingIndex.entries) : null;

  return {
    role,
    roleLabel: role === "primary" ? "Primary school zone" : "Secondary school zone (Year 7)",
    name,
    campusName: properties.Campus_Name ?? boundary.Campus_Name ?? name,
    entityCode: String(properties.Entity_Code ?? boundary.Entity_Code ?? ""),
    addressLine: properties.Campus_Address_Line ?? "",
    suburb: properties.Campus_Address_Town ?? "",
    state: properties.Campus_Address_State ?? "VIC",
    postcode,
    phone: properties.School_Phone ?? "",
    website: properties.School_Website ?? "",
    yearLevels: properties.Campus_Year_Levels ?? String(boundary.Year_Level ?? ""),
    zone: properties.Zone ?? "Yes",
    zoneType: properties.Type ?? "",
    region: properties.Region ?? "",
    boundaryYear: String(boundary.Boundary_Year ?? ""),
    coordinates: feature?.geometry?.coordinates ?? null,
    rankingStatus: role === "primary" ? (ranking ? "listed" : "not-listed") : "not-applicable",
    ranking,
  };
}

export async function lookupSchools(input: {
  address: string;
  magicKey?: string;
  enrolmentYear: EnrolmentYear;
}): Promise<SchoolLookupResponse> {
  try {
    const [address, rankingIndex, schoolIndex] = await Promise.all([
      resolveAddress(input.address, input.magicKey),
      getRankingIndex(),
      getSchoolIndex(input.enrolmentYear),
    ]);

    const boundaryKinds: Array<"primary" | "year7"> = ["primary", "year7"];
    const boundaryResults = await Promise.all(
      boundaryKinds.map((kind) => lookupBoundary(input.enrolmentYear, kind, address)),
    );

    const schools = boundaryResults
      .map((boundary, index) => {
        if (!boundary?.Entity_Code) return null;
        const boundaryKind = boundaryKinds[index];
        const role = boundaryKind === "primary" ? "primary" : "secondary";
        return toAssignedSchool(
          role,
          boundary,
          schoolIndex.get(String(boundary.Entity_Code)),
          rankingIndex,
        );
      })
      .filter((school): school is AssignedSchool => school !== null);

    const warnings: string[] = [];
    if (schools.length === 0) {
      warnings.push("Find My School did not return a school zone for this address.");
    }
    if (rankingIndex.source === "snapshot") {
      warnings.push(
        "Better Education could not be refreshed live, so the bundled ranking snapshot was used.",
      );
    }
    const currentYear = new Date().getFullYear();
    if (rankingIndex.rankingYear < currentYear) {
      warnings.push(
        `Showing the ${rankingIndex.rankingYear} school rankings — results for ${currentYear} have not been published or refreshed yet.`,
      );
    }

    const { entries: _entries, ...rankingIndexSummary } = rankingIndex;

    return {
      address,
      enrolmentYear: input.enrolmentYear,
      schools,
      warnings,
      rankingIndex: rankingIndexSummary,
      findMySchoolSourceUrl: FIND_MY_SCHOOL_BASE,
    };
  } catch (error) {
    if (error instanceof LookupError) throw error;
    throw new LookupError(
      502,
      "A data source could not be reached. Please try again shortly.",
    );
  }
}
