import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

/**
 * Returns the signed-in user as a slim shape, or null when there is no valid
 * session or anything goes wrong (missing headers, unreachable DB, etc.).
 * Never throws.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return null;
    const { id, name, email, image } = session.user;
    return { id, name, email, image: image ?? null };
  } catch {
    return null;
  }
}
