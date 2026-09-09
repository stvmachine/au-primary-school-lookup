import { getDb } from "@/lib/db";
import { searchHistory } from "../../drizzle/schema";
import type { SchoolLookupResponse } from "@/lib/types";

/**
 * Persists a snapshot of a school lookup response for the given user.
 * Fire-and-forget: any failure is logged and swallowed so that saving
 * history can never break the lookup route itself.
 */
export async function saveSearchHistory(
  userId: string,
  response: SchoolLookupResponse,
): Promise<void> {
  try {
    await getDb()
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
