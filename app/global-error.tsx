"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#faf7f2", color: "#1f1b16" }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went badly wrong
          </h1>
          <p style={{ marginBottom: "1.5rem", color: "rgba(31,27,22,0.7)" }}>
            The whole page failed to load. Try again, or come back later.
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: "0.5rem",
              background: "#e0a72e",
              color: "#17140f",
              padding: "0.5rem 1rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
