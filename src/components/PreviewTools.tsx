"use client";

/**
 * Preview deployments only: forget everything this browser has saved for the
 * site (levels, dismissed cards, the example board, the visitor id) so the
 * page can be checked the way a first-time visitor sees it.
 */
export function PreviewTools() {
  return (
    <p className="preview-tools">
      <span>Preview only</span>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {}
          location.reload();
        }}
      >
        Reset as new visitor
      </button>
    </p>
  );
}
