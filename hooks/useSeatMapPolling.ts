"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatMapResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;
const BACKOFF_CEILING_MS = 30000;

export function useSeatMapPolling(showId: string) {
  const [data, setData] = useState<SeatMapResponse | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(POLL_INTERVAL_MS);
  const stoppedRef = useRef(false);
  const pollRef = useRef<() => void>(() => {});

  const poll = useCallback(() => {
    if (stoppedRef.current || document.hidden) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/shows/${showId}/seats`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as SeatMapResponse;
      })
      .then((json) => {
        if (controller.signal.aborted || stoppedRef.current) return;
        setData(json);
        setReconnecting(false);
        backoffRef.current = POLL_INTERVAL_MS;
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || stoppedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setReconnecting(true);
        backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_CEILING_MS);
      })
      .finally(() => {
        if (stoppedRef.current || document.hidden) return;
        timeoutRef.current = setTimeout(() => pollRef.current(), backoffRef.current);
      });
  }, [showId]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    stoppedRef.current = false;
    backoffRef.current = POLL_INTERVAL_MS;
    poll();

    function handleVisibility() {
      if (document.hidden) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        abortRef.current?.abort();
      } else {
        backoffRef.current = POLL_INTERVAL_MS;
        poll();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stoppedRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, [poll]);

  const refetchNow = useCallback(() => {
    backoffRef.current = POLL_INTERVAL_MS;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    poll();
  }, [poll]);

  return { data, reconnecting, refetchNow };
}
