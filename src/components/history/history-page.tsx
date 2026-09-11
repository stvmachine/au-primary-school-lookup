"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Pencil,
  RefreshCw,
  SearchCheck,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import type { HistoryEntry } from "@/lib/types-history";
import type { SchoolLookupResponse } from "@/lib/types";
import SchoolCard from "@/components/school-card";

type LoadState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready" };

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sourceLabel(source: SchoolLookupResponse["rankingIndex"]["source"]) {
  if (source === "live-direct") return "Live from Better Education";
  if (source === "live-proxy") return "Live via readable access";
  if (source === "database") return "Cached from database";
  return "Bundled ranking snapshot";
}

function primaryOf(entry: HistoryEntry) {
  return entry.schools.find((school) => school.role === "primary") ?? null;
}

function rankText(entry: HistoryEntry) {
  const primary = primaryOf(entry);
  if (!primary || primary.rankingStatus === "not-applicable") return "n/a";
  if (primary.rankingStatus === "listed" && primary.ranking) return `#${primary.ranking.rank}`;
  return "Not listed";
}

function rankIsNumber(entry: HistoryEntry) {
  const primary = primaryOf(entry);
  return Boolean(primary && primary.rankingStatus === "listed" && primary.ranking);
}

function metricValue(entry: HistoryEntry, key: "stateOverallScore" | "totalEnrolments" | "ses") {
  const primary = primaryOf(entry);
  return primary?.ranking?.[key] ?? null;
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("button, input, a, select, textarea, label") !== null
  );
}

export default function HistoryPage({ user: _user }: { user: unknown }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal: AbortSignal, soft = false) => {
    if (soft) setRefreshing(true);
    else setLoadState({ status: "loading" });
    try {
      const response = await fetch("/api/history", { signal });
      if (response.status === 401) {
        setLoadState({ status: "signed-out" });
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setLoadState({ status: "error", message: payload?.error ?? "Saved searches could not be loaded." });
        return;
      }
      const payload = (await response.json()) as { items?: HistoryEntry[] };
      setItems(payload.items ?? []);
      setSelectedIds([]);
      setLoadState({ status: "ready" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLoadState({ status: "error", message: "Saved searches could not be loaded." });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleItems = useMemo(
    () => (starredOnly ? items.filter((entry) => entry.starred) : items),
    [items, starredOnly],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((existing) => existing !== id) : [...previous, id],
    );
  };

  const toggleStar = async (entry: HistoryEntry) => {
    const nextStarred = !entry.starred;
    setItems((previous) =>
      previous.map((item) => (item.id === entry.id ? { ...item, starred: nextStarred } : item)),
    );
    try {
      const response = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, starred: nextStarred }),
      });
      if (!response.ok) throw new Error("Star update failed");
      const payload = (await response.json()) as { item?: HistoryEntry };
      if (payload.item) {
        const updated = payload.item;
        setItems((previous) =>
          previous.map((item) => (item.id === entry.id ? updated : item)),
        );
      }
    } catch {
      setItems((previous) =>
        previous.map((item) => (item.id === entry.id ? { ...item, starred: entry.starred } : item)),
      );
    }
  };

  const saveNote = async (entry: HistoryEntry) => {
    const trimmed = noteDraft.trim();
    if (trimmed === entry.note) {
      setEditingNoteId(null);
      return;
    }
    setNoteSaving(true);
    try {
      const response = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, note: trimmed }),
      });
      if (!response.ok) throw new Error("Note update failed");
      const payload = (await response.json()) as { item?: HistoryEntry };
      if (payload.item) {
        const updated = payload.item;
        setItems((previous) =>
          previous.map((item) => (item.id === entry.id ? updated : item)),
        );
      }
      setEditingNoteId(null);
    } catch {
      // Keep the editor open so the attempt can be retried without losing the draft.
    } finally {
      setNoteSaving(false);
    }
  };

  const startEditNote = (entry: HistoryEntry) => {
    setNoteDraft(entry.note);
    setEditingNoteId(entry.id);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} saved ${selectedIds.length === 1 ? "search" : "searches"}? This can’t be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/history/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) throw new Error("Delete failed");
      const removed = new Set(selectedIds);
      setItems((previous) => previous.filter((item) => !removed.has(item.id)));
      setSelectedIds([]);
      if (expandedId && removed.has(expandedId)) setExpandedId(null);
    } catch {
      // Leave the selection intact so the delete can be retried.
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((previous) => (previous === id ? null : id));
  };

  const handleRowClick = (event: React.MouseEvent, entry: HistoryEntry) => {
    if (isInteractiveTarget(event.target)) return;
    toggleExpanded(entry.id);
  };

  const renderDetail = (entry: HistoryEntry) => {
    const orderedSchools = [
      ...entry.schools.filter((school) => school.role === "primary"),
      ...entry.schools.filter((school) => school.role !== "primary"),
    ];

    return (
      <div className="history-detail">
        <div className="result-summary">
          <div>
            <span className="eyebrow">Saved lookup</span>
            <h2>{entry.addressLabel}</h2>
            <p>
              {entry.enrolmentYear} enrolment zones · coordinates {entry.latitude.toFixed(5)}, {" "}
              {entry.longitude.toFixed(5)}
            </p>
          </div>
          <div className="source-chip">
            <Clock3 size={16} />
            <div>
              <strong>{sourceLabel(entry.rankingIndex.source)}</strong>
              <span>
                {entry.rankingIndex.rankingYear} index · saved {formatCheckedAt(entry.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {entry.warnings.length > 0 ? (
          <div className="warning-strip">
            <CircleAlert size={18} />
            <span>{entry.warnings.join(" ")}</span>
          </div>
        ) : null}

        {orderedSchools.length > 0 ? (
          <div className="school-grid">
            {orderedSchools.map((school) => (
              <SchoolCard
                key={`${school.role}-${school.entityCode}`}
                school={school}
                totalRanked={entry.rankingIndex.totalRankedSchools}
              />
            ))}
          </div>
        ) : (
          <div className="empty-result">
            <CircleAlert size={38} />
            <h3>No assigned government school zone was returned.</h3>
            <p>This saved lookup did not return any schools.</p>
          </div>
        )}
      </div>
    );
  };

  const renderNoteCell = (entry: HistoryEntry) => {
    if (editingNoteId === entry.id) {
      return (
        <input
          className="history-note-input"
          type="text"
          value={noteDraft}
          aria-label={`Note for ${entry.addressLabel}`}
          disabled={noteSaving}
          autoFocus
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={() => void saveNote(entry)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveNote(entry);
            }
            if (event.key === "Escape") {
              setEditingNoteId(null);
            }
          }}
        />
      );
    }
    return (
      <button
        className={entry.note ? "note-toggle has-note" : "note-toggle"}
        type="button"
        aria-label={entry.note ? `Edit note for ${entry.addressLabel}` : `Add note for ${entry.addressLabel}`}
        onClick={() => startEditNote(entry)}
      >
        <Pencil size={15} />
      </button>
    );
  };

  if (loadState.status === "loading") {
    return (
      <div>
        <div className="history-heading">
          <span className="eyebrow">Saved lookups</span>
          <h1>My searches</h1>
          <p>Every address you check while signed in is saved here, starred first and newest first.</p>
        </div>
        <div className="skeleton-grid" aria-busy="true" aria-label="Loading saved searches">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </div>
    );
  }

  if (loadState.status === "signed-out") {
    return (
      <section className="idle-state">
        <div className="idle-icon">
          <SearchCheck size={28} />
        </div>
        <div>
          <span className="eyebrow">Saved lookups</span>
          <h2>Sign in to save and compare your searches.</h2>
          <p>
            Your lookups are saved automatically when you’re signed in, so you can come back and compare
            zones, ranks and enrolment years side by side.
          </p>
        </div>
      </section>
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="error-panel" role="alert">
        <CircleAlert size={24} />
        <div>
          <strong>Saved searches couldn’t be loaded.</strong>
          <p>{loadState.message}</p>
          <div style={{ marginTop: 12 }}>
            <button
              className="ghost-action"
              type="button"
              onClick={() => {
                const controller = new AbortController();
                void load(controller.signal);
              }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  const countLabel = starredOnly
    ? `${visibleItems.length} of ${items.length} saved`
    : `${items.length} saved`;

  return (
    <div>
      <div className="history-heading">
        <span className="eyebrow">Saved lookups</span>
        <h1>My searches</h1>
        <p>Every address you check while signed in is saved here, starred first and newest first.</p>
      </div>

      <div className="history-toolbar">
        <span className="history-count">{countLabel}</span>
        <button
          className="filter-pill"
          type="button"
          aria-pressed={starredOnly}
          onClick={() => setStarredOnly((previous) => !previous)}
        >
          <Star size={14} aria-hidden="true" fill={starredOnly ? "currentColor" : "none"} />
          Starred only
        </button>
        <button
          className="ghost-action"
          type="button"
          onClick={() => {
            const controller = new AbortController();
            void load(controller.signal, true);
          }}
          disabled={refreshing}
          aria-label="Refresh saved searches"
        >
          {refreshing ? (
            <LoaderCircle className="spin" size={14} aria-hidden="true" />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}
          Refresh
        </button>
        <button
          className="bulk-delete-button"
          type="button"
          disabled={selectedIds.length === 0 || deleting}
          onClick={() => void handleBulkDelete()}
        >
          {deleting ? (
            <LoaderCircle className="spin" size={14} aria-hidden="true" />
          ) : (
            <Trash2 size={14} aria-hidden="true" />
          )}
          {selectedIds.length > 0 ? `Delete selected (${selectedIds.length})` : "Delete selected"}
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <section className="idle-state">
          <div className="idle-icon">
            <SearchCheck size={28} />
          </div>
          <div>
            <span className="eyebrow">Saved lookups</span>
            <h2>{starredOnly ? "No starred searches yet." : "No saved searches yet."}</h2>
            <p>
              Run an address check on the{" "}
              <Link href="/" style={{ fontWeight: 800, textDecoration: "underline" }}>
                home page
              </Link>{" "}
              and it will appear here for easy comparison.
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th aria-label="Select row" scope="col" />
                  <th aria-label="Star" scope="col" />
                  <th scope="col">Address</th>
                  <th scope="col">Year</th>
                  <th scope="col">Primary school</th>
                  <th scope="col">Rank</th>
                  <th scope="col">State score</th>
                  <th scope="col">Enrolments</th>
                  <th scope="col">SES</th>
                  <th scope="col">Saved</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((entry) => {
                  const primary = primaryOf(entry);
                  const expanded = expandedId === entry.id;
                  return [
                    <tr
                      key={entry.id}
                      className={expanded ? "history-row expanded" : "history-row"}
                      onClick={(event) => handleRowClick(event, entry)}
                      aria-expanded={expanded}
                    >
                      <td>
                        <input
                          className="row-check"
                          type="checkbox"
                          checked={selectedIds.includes(entry.id)}
                          onChange={() => toggleSelected(entry.id)}
                          aria-label={`Select ${entry.addressLabel}`}
                        />
                      </td>
                      <td>
                        <button
                          className={entry.starred ? "star-toggle starred" : "star-toggle"}
                          type="button"
                          aria-label={entry.starred ? `Unstar ${entry.addressLabel}` : `Star ${entry.addressLabel}`}
                          aria-pressed={entry.starred}
                          onClick={() => void toggleStar(entry)}
                        >
                          <Star size={16} fill={entry.starred ? "currentColor" : "none"} />
                        </button>
                      </td>
                      <td>
                        <span className="history-cell-strong">{entry.addressLabel}</span>
                        {entry.note ? <span className="history-cell-muted">{entry.note}</span> : null}
                      </td>
                      <td>{entry.enrolmentYear}</td>
                      <td>{primary ? primary.name : "—"}</td>
                      <td>
                        <span className={rankIsNumber(entry) ? "history-rank" : "history-rank unranked"}>
                          {rankText(entry)}
                        </span>
                      </td>
                      <td>{metricValue(entry, "stateOverallScore") ?? "—"}</td>
                      <td>{metricValue(entry, "totalEnrolments") ?? "—"}</td>
                      <td>{metricValue(entry, "ses") ?? "—"}</td>
                      <td>{formatSavedAt(entry.createdAt)}</td>
                      <td>{renderNoteCell(entry)}</td>
                    </tr>,
                    expanded ? (
                      <tr key={`${entry.id}-detail`} className="history-expanded-row">
                        <td className="history-expanded-cell" colSpan={11}>
                          {renderDetail(entry)}
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="history-card-list">
            {visibleItems.map((entry) => {
              const primary = primaryOf(entry);
              const expanded = expandedId === entry.id;
              return (
                <div key={entry.id} className="history-card">
                  <div className="history-card-top">
                    <input
                      className="row-check"
                      type="checkbox"
                      checked={selectedIds.includes(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      aria-label={`Select ${entry.addressLabel}`}
                    />
                    <button
                      className={entry.starred ? "star-toggle starred" : "star-toggle"}
                      type="button"
                      aria-label={entry.starred ? `Unstar ${entry.addressLabel}` : `Star ${entry.addressLabel}`}
                      aria-pressed={entry.starred}
                      onClick={() => void toggleStar(entry)}
                    >
                      <Star size={16} fill={entry.starred ? "currentColor" : "none"} />
                    </button>
                    <div className="history-card-main">
                      <span className="history-cell-strong">{entry.addressLabel}</span>
                      {entry.note ? <span className="history-cell-muted">{entry.note}</span> : null}
                    </div>
                    <button
                      className="note-toggle"
                      type="button"
                      aria-label={expanded ? `Collapse ${entry.addressLabel}` : `Expand ${entry.addressLabel}`}
                      aria-expanded={expanded}
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </button>
                  </div>
                  <ul className="history-card-meta">
                    <li>
                      Year <strong>{entry.enrolmentYear}</strong>
                    </li>
                    <li>
                      School <strong>{primary ? primary.name : "—"}</strong>
                    </li>
                    <li>
                      Rank{" "}
                      <strong className={rankIsNumber(entry) ? "history-rank" : "history-rank unranked"}>
                        {rankText(entry)}
                      </strong>
                    </li>
                    <li>
                      Saved <strong>{formatSavedAt(entry.createdAt)}</strong>
                    </li>
                  </ul>
                  <div style={{ marginTop: 10 }}>{renderNoteCell(entry)}</div>
                  {expanded ? <div className="history-card-detail">{renderDetail(entry)}</div> : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      <section className="source-notes" style={{ marginTop: 30 }}>
        <div>
          <SearchCheck size={19} />
          <h2>How saving works</h2>
        </div>
        <div className="notes-grid">
          <p>
            Zone results come from Victoria’s Find My School service for the selected enrolment year. Saved
            lookups keep a snapshot of the zone and ranking data from the moment you searched.
          </p>
          <p>
            Rankings come from Better Education’s “Top Public Primary Schools in Melbourne” table. A saved
            lookup preserves the ranking year and source, even as the live index moves on.
          </p>
          <p>
            Star the searches you’re weighing up, add a note to remember why, and delete the ones you no
            longer need. Only you can see your saved history.
          </p>
        </div>
      </section>
    </div>
  );
}
