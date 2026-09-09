import type { Metadata } from "next";
import "./globals.css";
import "./app.css";

export const metadata: Metadata = {
  title: "ZoneRank Victoria — School Zone Ranking Lookup",
  description:
    "Type a Victorian street address, choose the enrolment year, and see the official government school zone matched against Better Education’s Melbourne public primary index.",
  openGraph: {
    title: "ZoneRank Victoria — School Zone Ranking Lookup",
    description:
      "Type a Victorian street address, choose the enrolment year, and see the official government school zone matched against Better Education’s Melbourne public primary index.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
