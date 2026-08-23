"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

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
        setError("That invite code isn't valid. Double-check it with whoever gave it to you.");
      } else if (res.status === 409) {
        setError("An account with this email already exists. Try logging in instead.");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Registration failed, please try again.");
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Create an account</h1>

          <Input label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="min 8 characters"
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
            <Input
              label="Organiser invite code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
          )}

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
