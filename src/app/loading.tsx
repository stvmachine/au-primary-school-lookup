export default function Loading() {
  return (
    <div className="app-shell" id="top">
      <main>
        <div className="skeleton-grid" style={{ marginTop: 40 }} aria-busy="true" aria-label="Loading page">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </main>
    </div>
  );
}
