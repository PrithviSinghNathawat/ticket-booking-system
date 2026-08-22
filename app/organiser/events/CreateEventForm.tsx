"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"MOVIE" | "CONCERT">("MOVIE");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, description }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create event");
        return;
      }
      setTitle("");
      setDescription("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] p-4">
      <h2 className="font-semibold">Create an event</h2>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "MOVIE" | "CONCERT")}
        className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
      >
        <option value="MOVIE">Movie</option>
        <option value="CONCERT">Concert</option>
      </select>
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create event"}
      </button>
    </form>
  );
}
