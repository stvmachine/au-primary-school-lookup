"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  GraduationCap,
  Info,
  LoaderCircle,
  MapPin,
  Navigation,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import type {
  AddressSuggestion,
  AssignedSchool,
  EnrolmentYear,
  SchoolLookupResponse,
} from "@/lib/types";
import SchoolCard from "@/components/school-card";
import AuthControls from "@/components/auth/auth-controls";

const EXAMPLE_ADDRESS = "31 North Avenue, Bentleigh VIC 3204";
const YEAR_OPTIONS: EnrolmentYear[] = ["2026", "2027"];

function useDebouncedValue(value: string, delay = 260) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

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

function sourceLabel(source: SchoolLookupResponse["rankingIndex"]["source"]) {
  if (source === "live-direct") return "Live from Better Education";
  if (source === "live-proxy") return "Live via readable access";
  return "Bundled ranking snapshot";
}

type SuggestionsState = {
  status: "idle" | "pending" | "success" | "error";
  items: AddressSuggestion[];
};

const suggestionCache = new Map<string, { fetchedAt: number; items: AddressSuggestion[] }>();
const SUGGESTION_STALE_MS = 30_000;

function useSuggestions(query: string, enabled: boolean): SuggestionsState {
  const [state, setState] = useState<SuggestionsState>({ status: "idle", items: [] });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle", items: [] });
      return;
    }

    const trimmed = query.trim();
    const cached = suggestionCache.get(trimmed);
    if (cached && Date.now() - cached.fetchedAt < SUGGESTION_STALE_MS) {
      setState({ status: "success", items: cached.items });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((previous) => ({
      status: "pending",
      items: previous.status === "success" ? previous.items : [],
    }));

    void (async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const payload = (await response.json()) as { suggestions?: AddressSuggestion[] };
        if (cancelled) return;
        const items = payload.suggestions ?? [];
        suggestionCache.set(trimmed, { fetchedAt: Date.now(), items });
        setState({ status: "success", items });
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === "AbortError")) return;
        setState({ status: "error", items: [] });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, enabled]);

  return state;
}

type LookupMutation = {
  status: "idle" | "pending" | "success" | "error";
  data?: SchoolLookupResponse;
  errorMessage?: string;
};

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="ZoneRank home">
        <span className="brand-mark">
          <BookOpenCheck size={22} strokeWidth={2.2} />
        </span>
        <span>
          <strong>ZoneRank</strong>
          <small>Victoria</small>
        </span>
      </a>

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
        <Link className="header-nav-link" href="/history">
          My searches
        </Link>
        <AuthControls />
      </div>
    </header>
  );
}

type SearchPanelProps = {
  query: string;
  year: EnrolmentYear;
  suggestions: AddressSuggestion[];
  suggestionsOpen: boolean;
  suggestionsLoading: boolean;
  activeIndex: number;
  lookupLoading: boolean;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onCloseSuggestions: () => void;
  onActiveIndexChange: (index: number) => void;
  onSelectSuggestion: (suggestion: AddressSuggestion) => void;
  onSubmit: () => void;
  onClear: () => void;
  onYearChange: (year: EnrolmentYear) => void;
  onExample: () => void;
};

function SearchPanel({
  query,
  year,
  suggestions,
  suggestionsOpen,
  suggestionsLoading,
  activeIndex,
  lookupLoading,
  onQueryChange,
  onFocus,
  onCloseSuggestions,
  onActiveIndexChange,
  onSelectSuggestion,
  onSubmit,
  onClear,
  onYearChange,
  onExample,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showSuggestions = suggestionsOpen && query.trim().length >= 3;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      onActiveIndexChange((activeIndex + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      onActiveIndexChange((activeIndex - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Escape") {
      onCloseSuggestions();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        onSelectSuggestion(suggestions[activeIndex]);
      } else {
        onSubmit();
      }
    }
  };

  return (
    <section className="search-panel" aria-labelledby="address-search-label">
      <div className="panel-heading">
        <span className="eyebrow">Address check</span>
        <span className="official-badge">
          <ShieldCheck size={14} />
          Victorian government zones
        </span>
      </div>

      <div className="field-grid">
        <div className="address-field">
          <label id="address-search-label" htmlFor="address-search">
            Enter a Victorian address
          </label>
          <div className="search-input-shell">
            <Search className="input-icon" size={21} aria-hidden="true" />
            <input
              ref={inputRef}
              id="address-search"
              type="text"
              value={query}
              placeholder="Start typing a street address…"
              autoComplete="off"
              aria-expanded={showSuggestions}
              aria-controls="address-suggestions"
              aria-activedescendant={
                activeIndex >= 0 ? `address-option-${activeIndex}` : undefined
              }
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={onFocus}
              onBlur={() => window.setTimeout(onCloseSuggestions, 140)}
              onKeyDown={handleKeyDown}
            />
            {query ? (
              <button className="clear-button" type="button" onClick={onClear} aria-label="Clear address">
                <X size={17} />
              </button>
            ) : null}
            {suggestionsLoading ? (
              <LoaderCircle className="suggestion-spinner" size={18} aria-hidden="true" />
            ) : null}
          </div>

          {showSuggestions ? (
            <div className="suggestions" id="address-suggestions" role="listbox">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`address-option-${index}`}
                    className={index === activeIndex ? "suggestion active" : "suggestion"}
                    key={`${suggestion.text}-${suggestion.magicKey}`}
                    onMouseEnter={() => onActiveIndexChange(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectSuggestion(suggestion)}
                  >
                    <MapPin size={17} />
                    <span>{suggestion.text}</span>
                  </button>
                ))
              ) : (
                <div className="suggestion-empty">
                  {suggestionsLoading
                    ? "Finding Victorian addresses…"
                    : "No Victorian address match yet. Keep typing or refine the suburb."}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="year-field" aria-label="Select enrolment year">
          <span className="year-label">Enrolment year</span>
          <div className="year-toggle">
            {YEAR_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                className={year === option ? "year-option selected" : "year-option"}
                onClick={() => onYearChange(option)}
                aria-pressed={year === option}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="search-actions">
        <button className="primary-action" type="button" onClick={onSubmit} disabled={lookupLoading}>
          <span className="action-text">
            <span>{lookupLoading ? "Checking sources" : "Find schools"}</span>
            <span aria-hidden="true">{lookupLoading ? "Checking sources" : "Find schools"}</span>
          </span>
          {lookupLoading ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
        </button>
        <button className="example-action" type="button" onClick={onExample}>
          Try: {EXAMPLE_ADDRESS}
        </button>
      </div>

      <div className="pipeline" aria-label="Lookup pipeline">
        <div>
          <span>01</span>
          <strong>Validate address</strong>
        </div>
        <div>
          <span>02</span>
          <strong>Match school zone</strong>
        </div>
        <div>
          <span>03</span>
          <strong>Cross-check ranking</strong>
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <aside className="hero-visual" aria-label="Example lookup result">
      <div className="radar-orbit orbit-one" />
      <div className="radar-orbit orbit-two" />
      <div className="visual-card address-preview">
        <span className="mono-label">ADDRESS</span>
        <strong>31 North Avenue</strong>
        <small>Bentleigh VIC 3204</small>
      </div>
      <div className="connection-line">
        <span />
      </div>
      <div className="visual-card school-preview">
        <div className="preview-icon">
          <School size={24} />
        </div>
        <div>
          <span className="mono-label">PRIMARY ZONE</span>
          <strong>Bentleigh West Primary School</strong>
          <small>Official 2026 zone</small>
        </div>
      </div>
      <div className="visual-card rank-preview">
        <span className="rank-hash">#22</span>
        <div>
          <span className="mono-label">BETTER EDUCATION</span>
          <strong>Public primary index</strong>
        </div>
      </div>
    </aside>
  );
}

function LoadingResults() {
  return (
    <section className="results-shell" aria-live="polite" aria-busy="true">
      <div className="loading-status">
        <LoaderCircle className="spin" size={24} />
        <div>
          <strong>Cross-checking school data</strong>
          <span>Address → official zone → public primary index</span>
        </div>
      </div>
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </section>
  );
}

function Results({ result }: { result: SchoolLookupResponse }) {
  const primarySchool = result.schools.find((school) => school.role === "primary");
  const secondarySchools = result.schools.filter((school) => school.role !== "primary");
  const orderedSchools = primarySchool ? [primarySchool, ...secondarySchools] : result.schools;

  return (
    <section className="results-shell" aria-live="polite">
      <div className="result-summary">
        <div>
          <span className="eyebrow">Lookup result</span>
          <h2>{result.address.label}</h2>
          <p>
            {result.enrolmentYear} enrolment zones · coordinates {result.address.latitude.toFixed(5)}, {" "}
            {result.address.longitude.toFixed(5)}
          </p>
        </div>
        <div className="source-chip">
          <Clock3 size={16} />
          <div>
            <strong>{sourceLabel(result.rankingIndex.source)}</strong>
            <span>
              {result.rankingIndex.rankingYear} index · checked {formatCheckedAt(result.rankingIndex.checkedAt)}
            </span>
          </div>
        </div>
      </div>

      {result.warnings.length > 0 ? (
        <div className="warning-strip">
          <CircleAlert size={18} />
          <span>{result.warnings.join(" ")}</span>
        </div>
      ) : null}

      {orderedSchools.length > 0 ? (
        <div className="school-grid">
          {orderedSchools.map((school) => (
            <SchoolCard
              key={`${school.role}-${school.entityCode}`}
              school={school}
              totalRanked={result.rankingIndex.totalRankedSchools}
            />
          ))}
        </div>
      ) : (
        <div className="empty-result">
          <CircleAlert size={38} />
          <h3>No assigned government school zone was returned.</h3>
          <p>Try selecting a full street address from the autocomplete list, or check a nearby boundary on Find My School.</p>
        </div>
      )}
    </section>
  );
}

function SourceNotes() {
  return (
    <section className="source-notes">
      <div>
        <Sparkles size={19} />
        <h2>How to read this</h2>
      </div>
      <div className="notes-grid">
        <p>
          Zone results come from Victoria’s Find My School service for the selected enrolment year. School
          zones can change, and properties close to a boundary should be verified against the official map.
        </p>
        <p>
          The ranking check searches Better Education’s “Top Public Primary Schools in Melbourne” table by
          school name and postcode. If the assigned primary school is absent, the result says so explicitly.
        </p>
        <p>
          Secondary zones are shown for household context only; they are not marked as missing from a primary
          school ranking.
        </p>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<EnrolmentYear>("2026");
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookup, setLookup] = useState<LookupMutation>({ status: "idle" });
  const lookupSequence = useRef(0);
  const debouncedQuery = useDebouncedValue(query);

  const shouldSuggest =
    debouncedQuery.trim().length >= 3 &&
    (!selectedSuggestion || selectedSuggestion.text !== debouncedQuery.trim());

  const suggestionsQuery = useSuggestions(debouncedQuery.trim(), shouldSuggest);

  const suggestions = useMemo(
    () => (shouldSuggest ? (suggestionsQuery.status === "success" ? suggestionsQuery.items : []) : []),
    [shouldSuggest, suggestionsQuery],
  );
  const result = lookup.status === "success" ? lookup.data : undefined;

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions.length, debouncedQuery]);

  const runLookup = (
    address: string,
    magicKey?: string,
    lookupYear = year,
  ) => {
    const trimmed = address.trim();
    if (trimmed.length < 3) return;
    setSuggestionsOpen(false);
    const sequence = ++lookupSequence.current;
    setLookup({ status: "pending" });

    void (async () => {
      try {
        const response = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: trimmed, magicKey, enrolmentYear: lookupYear }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (sequence !== lookupSequence.current) return;
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String((payload as { error: unknown }).error)
              : "The lookup service did not respond.";
          setLookup({ status: "error", errorMessage: message });
          return;
        }
        setLookup({ status: "success", data: payload as SchoolLookupResponse });
      } catch {
        if (sequence !== lookupSequence.current) return;
        setLookup({
          status: "error",
          errorMessage: "The lookup request could not be completed. Check your connection and try again.",
        });
      }
    })();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedSuggestion(null);
    setSuggestionsOpen(true);
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setQuery(suggestion.text);
    setSelectedSuggestion(suggestion);
    setSuggestionsOpen(false);
    runLookup(suggestion.text, suggestion.magicKey);
  };

  const handleSubmit = () => {
    if (selectedSuggestion) {
      runLookup(selectedSuggestion.text, selectedSuggestion.magicKey);
      return;
    }
    const firstSuggestion = suggestions[0];
    if (firstSuggestion) {
      handleSelectSuggestion(firstSuggestion);
      return;
    }
    runLookup(query);
  };

  const handleYearChange = (nextYear: EnrolmentYear) => {
    setYear(nextYear);
    if (!result) return;
    runLookup(
      result.address.label,
      selectedSuggestion?.magicKey,
      nextYear,
    );
  };

  const handleClear = () => {
    setQuery("");
    setSelectedSuggestion(null);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
    setLookup({ status: "idle" });
  };

  const handleExample = () => {
    setQuery(EXAMPLE_ADDRESS);
    setSelectedSuggestion(null);
    runLookup(EXAMPLE_ADDRESS);
  };

  const lookupLoading = lookup.status === "pending";

  return (
    <div className="app-shell" id="top">
      <Header />

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-kicker">
              <Navigation size={15} />
              Melbourne school-zone intelligence
            </div>
            <h1>
              From address to assigned school to <span>public primary rank.</span>
            </h1>
            <p>
              Type a Victorian street address, choose the enrolment year, and see the official government
              school zone matched against Better Education’s Melbourne public primary index.
            </p>
          </div>
          <HeroVisual />
        </section>

        <SearchPanel
          query={query}
          year={year}
          suggestions={suggestions}
          suggestionsOpen={suggestionsOpen}
          suggestionsLoading={suggestionsQuery.status === "pending"}
          activeIndex={activeIndex}
          lookupLoading={lookupLoading}
          onQueryChange={handleQueryChange}
          onFocus={() => setSuggestionsOpen(true)}
          onCloseSuggestions={() => setSuggestionsOpen(false)}
          onActiveIndexChange={setActiveIndex}
          onSelectSuggestion={handleSelectSuggestion}
          onSubmit={handleSubmit}
          onClear={handleClear}
          onYearChange={handleYearChange}
          onExample={handleExample}
        />

        {lookup.status === "error" ? (
          <section className="error-panel" role="alert">
            <CircleAlert size={24} />
            <div>
              <strong>We couldn’t complete that lookup.</strong>
              <p>{lookup.errorMessage}</p>
            </div>
          </section>
        ) : null}

        {lookupLoading ? <LoadingResults /> : null}
        {!lookupLoading && result ? <Results result={result} /> : null}

        {!lookupLoading && !result && lookup.status !== "error" ? (
          <section className="idle-state">
            <div className="idle-icon">
              <Trophy size={28} />
            </div>
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h2>Choose a complete address from the suggestions.</h2>
              <p>
                The result will show the assigned primary zone first, then the Year 7 secondary zone for
                context.
              </p>
            </div>
          </section>
        ) : null}

        <SourceNotes />
      </main>
    </div>
  );
}
