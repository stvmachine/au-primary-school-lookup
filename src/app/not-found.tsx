import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="app-shell" id="top">
      <main>
        <section className="idle-state" style={{ marginTop: 40 }}>
          <div className="idle-icon">
            <Compass size={28} />
          </div>
          <div>
            <span className="eyebrow">Page not found</span>
            <h2>This page isn’t on the map.</h2>
            <p>
              The address you followed doesn’t match any page here. Head back to the{" "}
              <Link href="/" style={{ fontWeight: 800, textDecoration: "underline" }}>
                lookup
              </Link>{" "}
              to check a school zone.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
