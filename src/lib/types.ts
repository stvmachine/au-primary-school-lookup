// Shared domain types — ported verbatim from ../contracts/types.ts (ZoneRank Victoria).
export type EnrolmentYear = "2026" | "2027";

export type AddressSuggestion = {
  text: string;
  magicKey: string;
};

export type AddressResult = {
  input: string;
  label: string;
  longitude: number;
  latitude: number;
  score?: number;
};

export type RankingEntry = {
  rank: number;
  school: string;
  postcode: string;
  stateOverallScore: number | null;
  betterEducationPercentile: string;
  english: string | null;
  maths: string | null;
  totalEnrolments: number | null;
  ses: number | null;
};

export type RankingSource = "live-direct" | "live-proxy" | "snapshot";

export type RankingIndex = {
  sourceUrl: string;
  title: string;
  rankingYear: number;
  totalRankedSchools: number;
  checkedAt: string;
  source: RankingSource;
  entries: RankingEntry[];
};

export type RankingIndexSummary = Omit<RankingIndex, "entries">;

export type RankingStatus = "listed" | "not-listed" | "not-applicable";

export type AssignedSchool = {
  role: "primary" | "secondary";
  roleLabel: string;
  name: string;
  campusName: string;
  entityCode: string;
  addressLine: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  website: string;
  yearLevels: string;
  zone: string;
  zoneType: string;
  region: string;
  boundaryYear: string;
  coordinates: [number, number] | null;
  rankingStatus: RankingStatus;
  ranking: RankingEntry | null;
};

export type SchoolLookupResponse = {
  address: AddressResult;
  enrolmentYear: EnrolmentYear;
  schools: AssignedSchool[];
  warnings: string[];
  rankingIndex: RankingIndexSummary;
  findMySchoolSourceUrl: string;
};
