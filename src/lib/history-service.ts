import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { searchHistory } from "../../drizzle/schema";
import type { SchoolLookupResponse } from "@/lib/types";

function normalizeAddressLabel(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Persists a snapshot of a school lookup response for the given user.
 * Fire-and-forget: any failure is logged and swallowed so that saving
 * history can never break the lookup route itself.
 *
 * Duplicate suppression: if the user already has a saved row for the same
 * resolved address (label compared case-insensitively after trim) and the
 * same enrolment year, the insert is skipped entirely — the existing row
 * keeps its original createdAt, note, starred state and snapshot.
 */
export async function saveSearchHistory(
  userId: string,
  response: SchoolLookupResponse,
): Promise<void> {
  try {
    const db = getDb();
    const addressLabel = normalizeAddressLabel(response.address.label);
    const existing = await db
      .select({ addressLabel: searchHistory.addressLabel, enrolmentYear: searchHistory.enrolmentYear })
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId));
    const isDuplicate = existing.some(
      (row) =>
        normalizeAddressLabel(row.addressLabel) === addressLabel &&
        row.enrolmentYear === response.enrolmentYear,
    );
    if (isDuplicate) return;

    await db
      .insert(searchHistory)
      .values({
        userId,
        addressLabel: response.address.label,
        longitude: response.address.longitude,
        latitude: response.address.latitude,
        enrolmentYear: response.enrolmentYear,
        schools: response.schools,
        warnings: response.warnings,
        rankingIndex: response.rankingIndex,
      });
  } catch (error) {
    console.warn("saveSearchHistory failed; lookup result was not saved.", error);
  }
}
