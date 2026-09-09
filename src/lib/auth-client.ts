"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin baseURL default: the client calls /api/auth/* relative to the
// current origin.
export const authClient = createAuthClient();
