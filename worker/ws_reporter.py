#!/usr/bin/env python3
"""
WebSocket progress reporter for Gaung ETL pipeline runs.
Sends step-by-step progress to the ws_server via HTTP POST.
"""

import json
import os
import urllib.request

WS_SERVER = os.environ.get("GAUNG_WS_URL", "http://localhost:3100")

def report(run_id: int, event: str, payload: dict = None):
    """Send a progress event to the WebSocket broadcast server."""
    try:
        data = {"runId": run_id, "event": event, "payload": payload or {}}
        req = urllib.request.Request(
            f"{WS_SERVER}/broadcast",
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass  # Silently fail — WS is optional
