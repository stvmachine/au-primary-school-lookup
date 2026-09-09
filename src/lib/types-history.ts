import type { AssignedSchool, EnrolmentYear, RankingIndexSummary } from "@/lib/types";

// A single saved lookup owned by an authenticated user.
// `schools`, `warnings` and `rankingIndex` are an immutable snapshot of the
// lookup response at the time the search was made (JSONB in Postgres).
export type HistoryEntry = {
  id: string;
  addressLabel: string;
  longitude: number;
  latitude: number;
  enrolmentYear: EnrolmentYear;
  schools: AssignedSchool[];
  warnings: string[];
  rankingIndex: RankingIndexSummary;
  createdAt: string; // ISO 8601
  note: string;
  starred: boolean;
};

export type HistoryListResponse = {
  items: HistoryEntry[];
};

export type HistoryPatchInput = {
  id: string;
  note?: string;
  starred?: boolean;
};

export type HistoryBulkDeleteInput = {
  ids: string[];
};
