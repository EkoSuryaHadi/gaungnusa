"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Server,
  Key,
  Shield,
  Check,
  Loader2,
  Clock,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuccessState {
  id: number;
  name: string;
  type: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewDatabaseSourcePage() {
  const router = useRouter();

  // ---- form state ----
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<"POSTGRESQL" | "MYSQL">("POSTGRESQL");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");
  const [schedule, setSchedule] = useState("");

  // ---- submit state ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // ---- derived ----
  const isFormValid = name.trim() && host.trim() && database.trim() && username.trim();

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleDbTypeChange = (newType: "POSTGRESQL" | "MYSQL") => {
    setDbType(newType);
    setPort(newType === "POSTGRESQL" ? 5432 : 3306);
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setPort(isNaN(val) ? 0 : val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setError("");

    try {
      const config = {
        dbType,
        host: host.trim(),
        port,
        database: database.trim(),
        username: username.trim(),
        password: password, // sent raw; server encrypts
        sqlQuery: sqlQuery.trim(),
        schedule: schedule.trim(),
      };

      const res = await authFetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DATABASE",
          name: name.trim(),
          config,
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      setSuccess({
        id: data.id,
        name: data.name,
        type: data.type,
        status: data.status,
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------
  // Render: Success
  // -------------------------------------------------------------------

  if (success) {
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
          {/* Checkmark circle */}
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
              Database Connected
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
              Your external database has been registered as a data source.
            </p>
          </div>

          {/* Source summary */}
          <div
            style={{
              display: "flex",
              gap: "32px",
              padding: "16px 24px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-root)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Database size={16} style={{ color: "var(--gold-400)" }} />
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  fontWeight: 500,
                }}
              >
                {success.name}
              </span>
            </div>
            <div style={{ width: "1px", background: "var(--border-subtle)" }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--gold-400)",
                }}
              >
                {success.type}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Type
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "24px",
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
            <Server size={18} />
            Create Pipeline from this Source
            <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />
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
            <button
              onClick={() => {
                setSuccess(null);
                setName("");
                setPassword("");
                setDatabase("");
                setUsername("");
              }}
              className="btn btn-ghost"
              style={{
                fontSize: "13px",
                padding: "10px 20px",
                color: "var(--text-muted)",
              }}
            >
              <Database size={14} />
              Connect Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render: Form
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
          Connect External Database
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "14px",
            marginTop: "6px",
          }}
        >
          Connect a PostgreSQL or MySQL database as a data source for your lakehouse.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "20px" }}
      >
        {/* Source Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            htmlFor="name"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Source Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Production Analytics DB"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </div>

        {/* Database Type */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            <Database size={14} style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
            Database Type
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => handleDbTypeChange("POSTGRESQL")}
              className="card"
              style={{
                flex: 1,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                borderColor:
                  dbType === "POSTGRESQL"
                    ? "var(--gold-400)"
                    : "var(--border-subtle)",
                background:
                  dbType === "POSTGRESQL"
                    ? "rgba(212, 168, 83, 0.06)"
                    : undefined,
                transition: "all 180ms ease",
              }}
            >
              <Server size={18} style={{ color: "var(--gold-400)" }} />
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  PostgreSQL
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Default port 5432
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleDbTypeChange("MYSQL")}
              className="card"
              style={{
                flex: 1,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                borderColor:
                  dbType === "MYSQL"
                    ? "var(--gold-400)"
                    : "var(--border-subtle)",
                background:
                  dbType === "MYSQL"
                    ? "rgba(212, 168, 83, 0.06)"
                    : undefined,
                transition: "all 180ms ease",
              }}
            >
              <Database size={18} style={{ color: "var(--gold-400)" }} />
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  MySQL
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Default port 3306
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Connection details */}
        <div
          className="card"
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Shield size={14} style={{ color: "var(--gold-400)" }} />
            Connection Details
          </div>

          {/* Host + Port row */}
          <div style={{ display: "flex", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                flex: 3,
              }}
            >
              <label
                htmlFor="host"
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                }}
              >
                Host
              </label>
              <input
                id="host"
                type="text"
                placeholder="localhost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
                className="input"
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                flex: 1,
              }}
            >
              <label
                htmlFor="port"
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                }}
              >
                Port
              </label>
              <input
                id="port"
                type="number"
                placeholder={dbType === "POSTGRESQL" ? "5432" : "3306"}
                value={port || ""}
                onChange={handlePortChange}
                required
                className="input"
              />
            </div>
          </div>

          {/* Database Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="database"
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-muted)",
              }}
            >
              Database Name
            </label>
            <input
              id="database"
              type="text"
              placeholder="analytics"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              required
              className="input"
            />
          </div>

          {/* Username + Password row */}
          <div style={{ display: "flex", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                flex: 1,
              }}
            >
              <label
                htmlFor="username"
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                }}
              >
                <Key size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="reader"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input"
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                flex: 1,
              }}
            >
              <label
                htmlFor="password"
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                }}
              >
                <Shield size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* SQL Query */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            htmlFor="sqlQuery"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            SQL Query
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: 400,
                marginLeft: "8px",
              }}
            >
              Optional — leave empty to discover tables and metadata
            </span>
          </label>
          <textarea
            id="sqlQuery"
            placeholder="SELECT * FROM sales WHERE created_at > '2025-01-01'"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={4}
            className="input"
            style={{
              resize: "vertical",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Schedule */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            htmlFor="schedule"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            <Clock size={14} style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
            Sync Schedule
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: 400,
                marginLeft: "8px",
              }}
            >
              Optional cron expression (stored for future use)
            </span>
          </label>
          <input
            id="schedule"
            type="text"
            placeholder="0 */6 * * * (every 6 hours)"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="input"
          />
        </div>

        {/* Encryption notice */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(212, 168, 83, 0.05)",
            border: "1px solid rgba(212, 168, 83, 0.1)",
          }}
        >
          <Shield size={14} style={{ color: "var(--gold-400)", flexShrink: 0 }} />
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Connection credentials are encrypted at rest using Fernet symmetric encryption.
            Password is never stored in plaintext.
          </p>
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
            disabled={!isFormValid || submitting}
            className="btn btn-primary"
            style={{
              boxShadow:
                !isFormValid || submitting
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
                <Server size={18} />
                Connect Database
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
