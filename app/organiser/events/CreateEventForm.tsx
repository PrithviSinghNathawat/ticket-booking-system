"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

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
    <form onSubmit={handleSubmit}>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Create an event</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--page-bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
        </label>
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as "MOVIE" | "CONCERT")}>
          <option value="MOVIE">Movie</option>
          <option value="CONCERT">Concert</option>
        </Select>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--page-bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={submitting} className="w-fit">
          {submitting ? "Creating..." : "Create event"}
        </Button>
      </Card>
    </form>
  );
}
