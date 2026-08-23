"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

const ACCOUNTS = [
  { label: "Admin", email: "admin@ticketing.test", password: "AdminPass123!", redirectTo: "/admin/venues" },
  { label: "Organiser", email: "organiser@ticketing.test", password: "OrganiserPass123!", redirectTo: "/organiser/events" },
  { label: "Customer", email: "alice@ticketing.test", password: "CustomerPass123!", redirectTo: "/events" },
];

export function OneClickSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(account: (typeof ACCOUNTS)[number]) {
    setBusy(account.label);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      if (!res.ok) {
        setError(`Could not sign in as ${account.label}. The seed data may need to be re-run.`);
        return;
      }
      router.push(account.redirectTo);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {ACCOUNTS.map((account) => (
          <Button key={account.label} onClick={() => signIn(account)} disabled={busy === account.label}>
            {busy === account.label ? "Signing in..." : `Sign in as ${account.label}`}
          </Button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function ResetDemoDataButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      setMessage(res.ok ? "Demo data reset." : "Reset is disabled in this environment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={reset} disabled={busy}>
        {busy ? "Resetting..." : "Reset /demo data"}
      </Button>
      {message && <span className="text-sm text-[var(--page-fg)]/70">{message}</span>}
    </div>
  );
}
