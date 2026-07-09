#!/usr/bin/env node
/**
 * Gaung WebSocket Bridge Server
 * 
 * Accepts HTTP POST from Python worker → broadcasts via WebSocket to frontend.
 * Listens on port 3100 for HTTP POST /broadcast
 * Listens on port 3008 for WebSocket connections from frontend
 */

const http = require("http");
const { WebSocketServer } = require("ws");

const HTTP_PORT = parseInt(process.env.WS_HTTP_PORT || "3100");
const WS_PORT = parseInt(process.env.WS_PORT || "3008");

// --- WebSocket server ---
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

// --- HTTP server — receives from Python worker ---
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/broadcast") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        const payload = JSON.stringify(msg);
        let sent = 0;
        for (const ws of clients) {
          if (ws.readyState === 1) { ws.send(payload); sent++; }
        }
        console.log(`[WS] Broadcast to ${sent} clients: ${msg.event} (run=${msg.runId})`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sent }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", clients: clients.size }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[WS Bridge] HTTP :${HTTP_PORT}, WebSocket :${WS_PORT}`);
});
