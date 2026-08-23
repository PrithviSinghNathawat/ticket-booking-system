import { spawn } from "child_process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const scripts: { name: string; file: string }[] = [
  { name: "concurrency-test", file: "scripts/concurrency-test.ts" },
  { name: "ttl-test", file: "scripts/ttl-test.ts" },
  { name: "booking-test", file: "scripts/booking-test.ts" },
  { name: "waitlist-test", file: "scripts/waitlist-test.ts" },
  { name: "rbac-test", file: "scripts/rbac-test.ts" },
  { name: "organiser-test", file: "scripts/organiser-test.ts" },
  { name: "mail-check", file: "scripts/mail-check.ts" },
];

type Result = { name: string; ok: boolean; ms: number };

function runOne(name: string, file: string): Promise<Result> {
  return new Promise((resolve) => {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Running ${name} (${file})`);
    console.log("=".repeat(70));
    const start = Date.now();
    const child = spawn("npx", ["tsx", file], {
      stdio: "inherit",
      env: process.env,
      shell: true,
    });
    child.on("close", (code) => {
      resolve({ name, ok: code === 0, ms: Date.now() - start });
    });
    child.on("error", () => {
      resolve({ name, ok: false, ms: Date.now() - start });
    });
  });
}

async function main() {
  console.log(`Running all ${scripts.length} test scripts sequentially against BASE_URL=${BASE_URL}`);
  console.log(
    "Note: ttl-test waits out the server's actual HOLD_TTL_SECONDS before checking expiry, so its " +
      "runtime scales with whatever TTL the target server is configured with (fast against a dev " +
      "server started with a short override, slow and correct against production's real 600s)."
  );

  const results: Result[] = [];
  for (const s of scripts) {
    results.push(await runOne(s.name, s.file));
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));
  let anyFailed = false;
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    if (!r.ok) anyFailed = true;
    console.log(`  ${status}  ${r.name.padEnd(20)} ${(r.ms / 1000).toFixed(1)}s`);
  }

  const passCount = results.filter((r) => r.ok).length;
  console.log(`\n${passCount}/${results.length} scripts passed.`);

  if (anyFailed) {
    console.log("\ntest:all FAILED");
    process.exit(1);
  } else {
    console.log("\ntest:all PASSED");
  }
}

main();
