"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "ORGANISER">("CUSTOMER");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role,
        ...(role === "ORGANISER" ? { inviteCode } : {}),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      if (res.status === 403) {
        setError("Invalid invite code");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Registration failed");
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-xl font-semibold">Create an account</h1>

        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-[var(--border-subtle)] px-3 py-2"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border border-[var(--border-subtle)] px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="rounded border border-[var(--border-subtle)] px-3 py-2"
        />

        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1 text-[var(--page-fg)]/70">I am a</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="role"
              checked={role === "CUSTOMER"}
              onChange={() => setRole("CUSTOMER")}
            />
            Customer
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="role"
              checked={role === "ORGANISER"}
              onChange={() => setRole("ORGANISER")}
            />
            Organiser
          </label>
        </fieldset>

        {role === "ORGANISER" && (
          <input
            type="text"
            placeholder="Organiser invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            className="rounded border border-[var(--border-subtle)] px-3 py-2"
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-fg)] disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </main>
  );
}
