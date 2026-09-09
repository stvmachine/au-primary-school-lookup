"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-shell" id="top">
      <main>
        <section className="error-panel" role="alert" style={{ marginTop: 40 }}>
          <CircleAlert size={24} />
          <div>
            <strong>Something went wrong while loading this page.</strong>
            <p>{error.message || "Please try again."}</p>
            <div style={{ marginTop: 12 }}>
              <button className="ghost-action" type="button" onClick={() => reset()}>
                <RefreshCw size={14} aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
