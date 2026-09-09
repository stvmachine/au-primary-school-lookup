import { BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth-helpers";
import AuthControls from "@/components/auth/auth-controls";
import HistoryPage from "@/components/history/history-page";

export default async function HistoryRoute() {
  const user = await getSessionUser();

  return (
    <div className="app-shell" id="top">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="ZoneRank home">
          <span className="brand-mark">
            <BookOpenCheck size={22} strokeWidth={2.2} />
          </span>
          <span>
            <strong>ZoneRank</strong>
            <small>Victoria</small>
          </span>
        </Link>

        <nav className="header-links" aria-label="Data sources">
          <a href="https://www.findmyschool.vic.gov.au/" target="_blank" rel="noreferrer">
            Find My School
          </a>
          <a
            href="https://bettereducation.com.au/school/Primary/vic/melbourne_top_government_primary_schools.aspx"
            target="_blank"
            rel="noreferrer"
          >
            Better Education
          </a>
        </nav>

        <div className="header-actions">
          <Link className="header-nav-link" href="/history" aria-current="page">
            My searches
          </Link>
          <AuthControls />
        </div>
      </header>

      {user ? (
        <main>
          <HistoryPage user={user} />
        </main>
      ) : (
        <main>
          <section className="idle-state">
            <div className="idle-icon">
              <BookOpenCheck size={28} />
            </div>
            <div>
              <span className="eyebrow">Saved lookups</span>
              <h2>Sign in to save and compare your searches.</h2>
              <p>
                Your lookups are saved automatically when you’re signed in, so you can come back and compare
                zones, ranks and enrolment years side by side.
              </p>
              <div style={{ marginTop: 14 }}>
                <AuthControls />
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
