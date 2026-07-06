"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Key,
  Lock,
  Link as LinkIcon,
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthType = "none" | "bearer" | "basic" | "apikey";
type ApiKeyPlacement = "header" | "query";
type HttpMethod = "GET" | "POST";

interface HeaderEntry {
  id: number;
  key: string;
  value: string;
}

interface SuccessResult {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewApiSourcePage() {
  const router = useRouter();

  // ---- form state ----
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [headers, setHeaders] = useState<HeaderEntry[]>([
    { id: 1, key: "", value: "" },
  ]);
  const [authType, setAuthType] = useState<AuthType>("none");

  // Bearer
  const [bearerToken, setBearerToken] = useState("");

  // Basic
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");

  // API Key
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeyPlacement, setApiKeyPlacement] =
    useState<ApiKeyPlacement>("header");

  // ---- submit state ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessResult | null>(null);

  // ---- header management ----
  const nextId = useState(2);

  const addHeader = () => {
    setHeaders((prev) => [...prev, { id: nextId[0], key: "", value: "" }]);
    nextId[0] = nextId[0] + 1;
  };

  const removeHeader = (id: number) => {
    setHeaders((prev) => prev.filter((h) => h.id !== id));
  };

  const updateHeader = (id: number, field: "key" | "value", val: string) => {
    setHeaders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: val } : h))
    );
  };

  // ---- submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !name.trim()) return;

    setSubmitting(true);
    setError("");

    // Build headers JSON
    const headersObj: Record<string, string> = {};
    headers.forEach((h) => {
      if (h.key.trim() && h.value.trim()) {
        headersObj[h.key.trim()] = h.value.trim();
      }
    });

    // Build auth config
    let auth: Record<string, unknown> = { type: "none" };
    if (authType === "bearer" && bearerToken.trim()) {
      auth = {
        type: "bearer",
        token: bearerToken.trim(),
      };
    } else if (
      authType === "basic" &&
      basicUsername.trim() &&
      basicPassword.trim()
    ) {
      auth = {
        type: "basic",
        username: basicUsername.trim(),
        password: basicPassword.trim(),
      };
    } else if (authType === "apikey" && apiKeyName.trim() && apiKeyValue.trim()) {
      auth = {
        type: "apikey",
        keyName: apiKeyName.trim(),
        keyValue: apiKeyValue.trim(),
        placement: apiKeyPlacement,
      };
    }

    const config = {
      url: url.trim(),
      method,
      headers: headersObj,
      auth,
    };

    try {
      const res = await authFetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: "API",
          config,
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to create API source (${res.status})`);

      setSuccess({ id: data.id, name: data.name });
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSubmitting(false);
    }
  };

  // ---- render helpers ----
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
          Connect REST API
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "14px",
            marginTop: "6px",
          }}
        >
          Add a REST API endpoint as a data source for your lakehouse.
        </p>
      </div>

      {/* Success */}
      {success ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
                API Source Connected
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                <strong>{success.name}</strong> is ready. You can now create a pipeline
                to fetch and process data from this endpoint.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
              placeholder="e.g. Sales API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* URL */}
          <div style={fieldGap}>
            <label htmlFor="url" style={labelStyle}>
              <LinkIcon size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
              Endpoint URL
            </label>
            <input
              id="url"
              type="url"
              placeholder="https://api.example.com/v1/data"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Method */}
          <div style={fieldGap}>
            <label htmlFor="method" style={labelStyle}>
              HTTP Method
            </label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={inputClass}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          {/* Headers */}
          <div style={fieldGap}>
            <label style={labelStyle}>Custom Headers</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {headers.map((h) => (
                <div
                  key={h.id}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="text"
                    placeholder="Header name"
                    value={h.key}
                    onChange={(e) => updateHeader(h.id, "key", e.target.value)}
                    className={inputClass}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>:</span>
                  <input
                    type="text"
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => updateHeader(h.id, "value", e.target.value)}
                    className={inputClass}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  {headers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeHeader(h.id)}
                      className="btn btn-ghost"
                      style={{ padding: "6px", flexShrink: 0 }}
                      title="Remove header"
                    >
                      <Trash2 size={16} style={{ color: "var(--clay-400)" }} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addHeader}
                className="btn btn-ghost"
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  alignSelf: "flex-start",
                  color: "var(--text-muted)",
                }}
              >
                <Plus size={14} />
                Add Header
              </button>
            </div>
          </div>

          {/* Auth Type */}
          <div style={fieldGap}>
            <label htmlFor="authType" style={labelStyle}>
              <Lock size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
              Authentication
            </label>
            <select
              id="authType"
              value={authType}
              onChange={(e) => setAuthType(e.target.value as AuthType)}
              className={inputClass}
            >
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
            </select>
          </div>

          {/* Bearer Token */}
          {authType === "bearer" && (
            <div style={fieldGap}>
              <label htmlFor="bearerToken" style={labelStyle}>
                <Key size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                Bearer Token
              </label>
              <input
                id="bearerToken"
                type="password"
                placeholder="sk-..."
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                required={authType === "bearer"}
                className={inputClass}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Sent as: <code>Authorization: Bearer YOUR_TOKEN</code>
              </span>
            </div>
          )}

          {/* Basic Auth */}
          {authType === "basic" && (
            <>
              <div style={fieldGap}>
                <label htmlFor="basicUsername" style={labelStyle}>
                  Username
                </label>
                <input
                  id="basicUsername"
                  type="text"
                  placeholder="username"
                  value={basicUsername}
                  onChange={(e) => setBasicUsername(e.target.value)}
                  required={authType === "basic"}
                  className={inputClass}
                />
              </div>
              <div style={fieldGap}>
                <label htmlFor="basicPassword" style={labelStyle}>
                  Password
                </label>
                <input
                  id="basicPassword"
                  type="password"
                  placeholder="password"
                  value={basicPassword}
                  onChange={(e) => setBasicPassword(e.target.value)}
                  required={authType === "basic"}
                  className={inputClass}
                />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "-16px" }}>
                Sent as: <code>Authorization: Basic base64(username:password)</code>
              </span>
            </>
          )}

          {/* API Key */}
          {authType === "apikey" && (
            <>
              <div style={fieldGap}>
                <label htmlFor="apiKeyName" style={labelStyle}>
                  Key Name
                </label>
                <input
                  id="apiKeyName"
                  type="text"
                  placeholder="X-API-Key"
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  required={authType === "apikey"}
                  className={inputClass}
                />
              </div>
              <div style={fieldGap}>
                <label htmlFor="apiKeyValue" style={labelStyle}>
                  <Key size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                  Key Value
                </label>
                <input
                  id="apiKeyValue"
                  type="password"
                  placeholder="your-api-key-value"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  required={authType === "apikey"}
                  className={inputClass}
                />
              </div>
              <div style={fieldGap}>
                <label htmlFor="apiKeyPlacement" style={labelStyle}>
                  Placement
                </label>
                <select
                  id="apiKeyPlacement"
                  value={apiKeyPlacement}
                  onChange={(e) => setApiKeyPlacement(e.target.value as ApiKeyPlacement)}
                  className={inputClass}
                >
                  <option value="header">Header</option>
                  <option value="query">Query Parameter</option>
                </select>
              </div>
            </>
          )}

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
              disabled={!url.trim() || !name.trim() || submitting}
              className="btn btn-primary"
              style={{
                boxShadow:
                  !url.trim() || !name.trim() || submitting
                    ? undefined
                    : "0 0 24px rgba(212, 168, 83, 0.2)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Globe size={18} />
                  Connect API
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
