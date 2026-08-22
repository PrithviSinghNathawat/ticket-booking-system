"use client";

import { useEffect, useRef, useState } from "react";

export function CountdownTimer({
  expiresAt,
  serverNow,
  onExpire,
}: {
  expiresAt: string;
  serverNow: string;
  onExpire?: () => void;
}) {
  const offsetRef = useRef(0);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    offsetRef.current = Date.now() - new Date(serverNow).getTime();
  }, [serverNow]);

  useEffect(() => {
    const expiresAtMs = new Date(expiresAt).getTime();

    function tick() {
      const estimatedServerNow = Date.now() - offsetRef.current;
      const remaining = Math.max(0, expiresAtMs - estimatedServerNow);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        onExpire?.();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <span className="font-mono tabular-nums">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
