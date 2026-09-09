import { CheckCircle2, CircleAlert, ExternalLink, GraduationCap, Info, School } from "lucide-react";
import type { AssignedSchool } from "@/lib/types";

function compactCoordinates(school: AssignedSchool) {
  if (!school.coordinates) return "Coordinates unavailable";
  const [longitude, latitude] = school.coordinates;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export default function SchoolCard({
  school,
  totalRanked,
}: {
  school: AssignedSchool;
  totalRanked: number;
}) {
  const isPrimary = school.role === "primary";
  const isListed = school.rankingStatus === "listed";

  return (
    <article className={`school-card ${school.role}`}>
      <div className="school-card-header">
        <div className="school-icon">
          {isPrimary ? <School size={25} /> : <GraduationCap size={25} />}
        </div>
        <div>
          <span className="eyebrow">{school.roleLabel}</span>
          <h3>{school.name}</h3>
          {school.campusName !== school.name ? <p>{school.campusName}</p> : null}
        </div>
        <span className="zone-pill">
          <CheckCircle2 size={15} />
          Assigned
        </span>
      </div>

      <dl className="school-details">
        <div>
          <dt>Campus</dt>
          <dd>
            {[school.addressLine, school.suburb, school.state, school.postcode]
              .filter(Boolean)
              .join(", ") || "Not listed"}
          </dd>
        </div>
        <div>
          <dt>Year levels</dt>
          <dd>{school.yearLevels || "Not listed"}</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>{[school.zoneType, school.boundaryYear].filter(Boolean).join(" · ") || "Official zone"}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>{compactCoordinates(school)}</dd>
        </div>
      </dl>

      <div className={isListed ? "ranking-panel listed" : "ranking-panel not-listed"}>
        {isListed && school.ranking ? (
          <>
            <div className="rank-display">
              <span>Better Education order</span>
              <strong>#{school.ranking.rank}</strong>
              <small>of {totalRanked} Melbourne public primary schools</small>
            </div>
            <div className="metric-grid">
              <Metric label="State score" value={school.ranking.stateOverallScore} />
              <Metric label="BE percentile" value={school.ranking.betterEducationPercentile} />
              <Metric label="Enrolments" value={school.ranking.totalEnrolments} />
              <Metric label="SES" value={school.ranking.ses} />
            </div>
          </>
        ) : isPrimary ? (
          <div className="not-listed-message">
            <CircleAlert size={28} />
            <div>
              <strong>This school doesn’t appear in the public primary index.</strong>
              <p>
                Better Education says a missing school may have missed the list’s cut-off; absence is not
                itself a performance rating.
              </p>
            </div>
          </div>
        ) : (
          <div className="not-listed-message muted">
            <Info size={26} />
            <div>
              <strong>Primary ranking is not applicable.</strong>
              <p>This is the Year 7 secondary zone shown for context.</p>
            </div>
          </div>
        )}
      </div>

      <div className="school-card-footer">
        {school.phone ? <span>{school.phone}</span> : <span>{school.region || "Victoria"}</span>}
        {school.website ? (
          <a href={school.website} target="_blank" rel="noreferrer">
            School website <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </article>
  );
}
