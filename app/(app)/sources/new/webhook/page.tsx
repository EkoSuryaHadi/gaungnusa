"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Webhook,
  Loader2,
  Check,
  Copy,
  Terminal,
  Globe,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookSuccess {
  id: number;
  name: string;
  webhookUrl: string;
  webhookSecret: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewWebhookPage() {
  const router = useRouter();

  // ---- form state ----
  const [name, setName] = useState("");

  // ---- submit state ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<WebhookSuccess | null>(null);

  // ---- copy state ----
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // ---- submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await authFetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: "WEBHOOK",
          config: {},
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to create webhook (${res.status})`);

      setSuccess({
        id: data.id,
        name: data.name,
        webhookUrl: data.webhookUrl,
        webhookSecret: data.webhookSecret,
      });
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  };

  // ---- styles ----
  const inputClass = "input";
  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
  };
  const fieldGap: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  };

  // ---- curl example ----
  const curlExample = success
    ? `curl -X POST \\
  "${success.webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${success.webhookSecret}" \\
  -d '{"event": "test", "data": {"message": "Hello Gaung"}}'`
    : "";

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div
      className="max-w-2xl mx-auto px-6 py-10 page-enter"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* Back link */}
      <Link
        href="/sources"
        className="btn btn-ghost mb-8"
        style={{ padding: "6px 14px", fontSize: "13px" }}
      >
        <ArrowLeft size={16} style={{ color: "var(--text-secondary)" }} />
        <span style={{ color: "var(--text-secondary)" }}>Back to Sources</span>
      </Link>

      {/* Page header */}
      <div className="mb-10" style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "32px",
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--gold-400)",
            lineHeight: 1.25,
          }}
        >
          Create Webhook Endpoint
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "14px",
            marginTop: "6px",
          }}
        >
          Receive data via HTTP POST — Gaung stores incoming payloads in
          the Bronze layer.
        </p>
      </div>

      {/* Success */}
      {success ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Success banner */}
          <div
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
              padding: "40px 32px",
              textAlign: "center",
              borderColor: "rgba(94, 178, 127, 0.25)",
              background: "rgba(94, 178, 127, 0.04)",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(94, 178, 127, 0.12)",
                border: "2px solid rgba(94, 178, 127, 0.25)",
              }}
            >
              <Check size={36} style={{ color: "var(--sage-400)", strokeWidth: 3 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "20px",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "var(--gold-400)",
                  margin: 0,
                }}
              >
                Webhook Created
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                <strong>{success.name}</strong> is ready to receive data.
              </p>
            </div>
          </div>

          {/* Webhook URL card */}
          <div className="card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Webhook size={18} style={{ color: "var(--gold-400)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                Webhook URL
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-root)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "monospace",
                fontSize: "13px",
                color: "var(--text-primary)",
                wordBreak: "break-all",
              }}
            >
              <code style={{ flex: 1 }}>{success.webhookUrl}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(success.webhookUrl, setCopiedUrl)}
                className="btn btn-ghost"
                style={{ padding: "4px 8px", flexShrink: 0 }}
                title="Copy URL"
              >
                {copiedUrl ? (
                  <Check size={16} style={{ color: "var(--sage-400)" }} />
                ) : (
                  <Copy size={16} style={{ color: "var(--text-muted)" }} />
                )}
              </button>
            </div>
          </div>

          {/* Webhook Secret card */}
          <div className="card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Terminal size={18} style={{ color: "var(--gold-400)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                Webhook Secret
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
              Include this in the <code>X-Webhook-Secret</code> header to authenticate requests.
              Store it securely — it cannot be retrieved again.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-root)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "monospace",
                fontSize: "13px",
                color: "var(--text-primary)",
              }}
            >
              <code style={{ flex: 1 }}>{success.webhookSecret}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(success.webhookSecret, setCopiedSecret)}
                className="btn btn-ghost"
                style={{ padding: "4px 8px", flexShrink: 0 }}
                title="Copy secret"
              >
                {copiedSecret ? (
                  <Check size={16} style={{ color: "var(--sage-400)" }} />
                ) : (
                  <Copy size={16} style={{ color: "var(--text-muted)" }} />
                )}
              </button>
            </div>
          </div>

          {/* Curl example card */}
          <div className="card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Terminal size={18} style={{ color: "var(--gold-400)" }} />
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                  Test with curl
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(curlExample, setCopiedCurl)}
                className="btn btn-ghost"
                style={{ padding: "4px 8px" }}
                title="Copy curl command"
              >
                {copiedCurl ? (
                  <Check size={16} style={{ color: "var(--sage-400)" }} />
                ) : (
                  <Copy size={16} style={{ color: "var(--text-muted)" }} />
                )}
              </button>
            </div>
            <pre
              style={{
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-root)",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                overflowX: "auto",
                margin: 0,
                fontFamily: "monospace",
                lineHeight: 1.6,
              }}
            >
              {curlExample}
            </pre>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <Link
              href={`/pipelines/new?sourceId=${success.id}&sourceName=${encodeURIComponent(success.name)}`}
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "14px 24px",
                fontSize: "15px",
                fontWeight: 500,
                boxShadow: "0 0 24px rgba(212, 168, 83, 0.2)",
              }}
            >
              <Globe size={18} />
              Create Pipeline
              <ArrowRight size={16} />
            </Link>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
              }}
            >
              <Link
                href="/sources"
                className="btn btn-secondary"
                style={{ fontSize: "13px", padding: "10px 20px" }}
              >
                <ArrowLeft size={14} />
                Back to Sources
              </Link>
              <Link
                href="/sources/new"
                className="btn btn-ghost"
                style={{
                  fontSize: "13px",
                  padding: "10px 20px",
                  color: "var(--text-muted)",
                }}
              >
                <Globe size={14} />
                Add Another Source
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          {/* Source Name */}
          <div style={fieldGap}>
            <label htmlFor="name" style={labelStyle}>
              Source Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Shopify Orders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Info card */}
          <div
            className="card"
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              borderColor: "rgba(212, 168, 83, 0.15)",
              background: "rgba(212, 168, 83, 0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Webhook size={18} style={{ color: "var(--gold-400)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                How Webhooks Work
              </span>
            </div>
            <ul
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                paddingLeft: "24px",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                lineHeight: 1.5,
              }}
            >
              <li>A unique URL and secret are generated for this source.</li>
              <li>
                Send JSON payloads via <code>POST</code> with the{" "}
                <code>X-Webhook-Secret</code> header.
              </li>
              <li>Incoming data is stored in the Bronze layer automatically.</li>
              <li>Use a pipeline to clean, transform, and promote to Silver.</li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(184, 92, 58, 0.08)",
                border: "1px solid rgba(184, 92, 58, 0.18)",
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(184, 92, 58, 0.15)",
                }}
              >
                <span
                  style={{
                    color: "var(--clay-400)",
                    fontSize: "13px",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  !
                </span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--clay-400)", margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
              paddingTop: "8px",
            }}
          >
            <Link href="/sources" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="btn btn-primary"
              style={{
                boxShadow:
                  !name.trim() || submitting
                    ? undefined
                    : "0 0 24px rgba(212, 168, 83, 0.2)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Webhook size={18} />
                  Create Webhook
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
