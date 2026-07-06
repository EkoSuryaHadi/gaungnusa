"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3006";

interface PipelineProgress {
  runId: number;
  event: "step_start" | "complete" | "error";
  payload: {
    step?: number;
    total?: number;
    type?: string;
    progress?: number;
    rows?: number;
    error?: string;
  };
}

export function usePipelineProgress(runId: number | null) {
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!runId) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg: PipelineProgress = JSON.parse(event.data);
        if (msg.runId === runId) {
          setProgress(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId]);

  const reset = useCallback(() => setProgress(null), []);

  return { progress, connected, reset };
}
