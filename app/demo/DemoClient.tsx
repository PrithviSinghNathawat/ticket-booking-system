"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

type RaceResult = {
  results: { email: string; status: number; ms: number; won: boolean; error?: string }[];
  winner: string | null;
  rowCount: number;
};

type CascadeResult = {
  cancelStatus: number;
  waiterEntryStatus: string | null;
  offer: { status: string; expiresAt: string } | null;
  currentSeatStatus: string | null;
};

export function DemoClient({
  resetEnabled,
  raceSeatCount,
}: {
  resetEnabled: boolean;
  raceSeatCount: number;
}) {
  const [raceBusy, setRaceBusy] = useState(false);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);

  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function runRace() {
    setRaceBusy(true);
    setRaceResult(null);
    try {
      const res = await fetch("/api/demo/race", { method: "POST" });
      const body = await res.json();
      setRaceResult(body);
    } finally {
      setRaceBusy(false);
    }
  }

  async function runCascade() {
    setCascadeBusy(true);
    setCascadeResult(null);
    try {
      const res = await fetch("/api/demo/waitlist-cascade", { method: "POST" });
      const body = await res.json();
      setCascadeResult(body);
    } finally {
      setCascadeBusy(false);
    }
  }

  async function runReset() {
    setResetBusy(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      setResetMessage(res.ok ? "Demo data reset." : "Reset is disabled in this environment.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Concurrency demo</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--page-fg)]/70">
          Two live demonstrations of the guarantees this system actually makes, run against the real
          API and the real database, not a simulation.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">1. Seat race</h2>
          <p className="mt-1 text-sm text-[var(--page-fg)]/70">
            Fires {raceSeatCount} simultaneous hold requests at the same seat from {raceSeatCount}{" "}
            pre-provisioned accounts. The correct outcome: exactly one request succeeds (201), every
            other request is rejected (409), and exactly one row exists for the seat afterward. That
            guarantee comes from a database unique constraint, not application logic, so it holds
            regardless of how many requests arrive at once.
          </p>
        </div>
        <Button onClick={runRace} disabled={raceBusy} className="w-fit">
          {raceBusy ? "Firing..." : `Fire ${raceSeatCount} simultaneous holds`}
        </Button>

        {raceResult && (
          <div className="flex flex-col gap-3">
            <Notice tone={raceResult.rowCount === 1 ? "success" : "error"}>
              Winner: {raceResult.winner ?? "none"}. Row count for this seat afterward:{" "}
              {raceResult.rowCount} (correct outcome is exactly 1).
            </Notice>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left">
                    <th className="p-2">Racer</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Outcome</th>
                    <th className="p-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {raceResult.results.map((r) => (
                    <tr key={r.email} className="border-b border-[var(--border-subtle)]">
                      <td className="p-2">{r.email}</td>
                      <td className="p-2 font-mono">{r.status}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${r.won ? "bg-[var(--mine)]" : "bg-[var(--booked)]"}`}
                        >
                          {r.won ? "won" : "rejected"}
                        </span>
                      </td>
                      <td className="p-2 font-mono">{r.ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">2. Waitlist cascade</h2>
          <p className="mt-1 text-sm text-[var(--page-fg)]/70">
            Cancels a pre-provisioned confirmed booking on a sold-out seat that has a waiter already
            in line. The correct outcome: the cancellation creates a waitlist offer for that waiter in
            the same transaction that releases the seat, so the seat is never visible as available to
            anyone browsing in between. This demo can&apos;t screenshot the millisecond in which that
            matters, but it can show you the row that proves it: the seat is still not `AVAILABLE`
            immediately after cancellation, because it was handed straight to the waiter instead.
          </p>
        </div>
        <Button onClick={runCascade} disabled={cascadeBusy} className="w-fit">
          {cascadeBusy ? "Cancelling..." : "Cancel booking, trigger cascade"}
        </Button>

        {cascadeResult && (
          <div className="flex flex-col gap-2 text-sm">
            <p>Cancellation: <span className="font-mono">{cascadeResult.cancelStatus}</span></p>
            <p>Waiter&apos;s entry status: <span className="font-mono">{cascadeResult.waiterEntryStatus ?? "n/a"}</span> (correct: OFFERED)</p>
            <p>Offer status: <span className="font-mono">{cascadeResult.offer?.status ?? "n/a"}</span></p>
            <Notice tone={cascadeResult.currentSeatStatus !== "AVAILABLE" ? "success" : "error"}>
              Seat status right now: {cascadeResult.currentSeatStatus ?? "unknown"} (correct outcome: never
              `AVAILABLE`, it should read `HELD` because it&apos;s already offered to the waiter).
            </Notice>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={runReset} disabled={resetBusy}>
          {resetBusy ? "Resetting..." : "Reset demo data"}
        </Button>
        {resetMessage && <span className="text-sm text-[var(--page-fg)]/70">{resetMessage}</span>}
        {!resetEnabled && (
          <span className="text-sm text-[var(--page-fg)]/50">
            (reset is disabled in this environment, but each demo above re-provisions its own state)
          </span>
        )}
      </div>
    </main>
  );
}
