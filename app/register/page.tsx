"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, UserPlus, LogIn } from "lucide-react";
import { storeAuth } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Password dan konfirmasi password tidak cocok.");
      return;
    }

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, adminName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      storeAuth(data.token, data.session);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputErrorStyle = error
    ? {
        borderColor: "var(--clay-400)",
        boxShadow: "0 0 0 3px var(--clay-dim)",
      }
    : undefined;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* LEFT: BRANDING */}
      <div
        style={{
          width: "45%",
          background: "var(--bg-root)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Concentric echo rings */}
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            border: "1px solid rgba(168, 154, 132, 0.04)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: "50%",
            border: "1px solid rgba(168, 154, 132, 0.07)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 230,
            height: 230,
            borderRadius: "50%",
            border: "1px solid rgba(168, 154, 132, 0.10)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 140,
            height: 140,
            borderRadius: "50%",
            border: "1px solid var(--border-default)",
            pointerEvents: "none",
          }}
        />

        {/* Brand text */}
        <div style={{ position: "relative", textAlign: "center", zIndex: 1 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(52px, 7.5vw, 88px)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--gold-400)",
              lineHeight: 1,
              margin: 0,
              letterSpacing: "-0.02em",
              textShadow: "0 0 48px rgba(212, 168, 83, 0.10)",
            }}
          >
            Gaung
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              fontWeight: 300,
              fontStyle: "italic",
              color: "var(--text-secondary)",
              marginTop: 16,
              letterSpacing: "0.05em",
            }}
          >
            Echo dari data Anda
          </p>
        </div>
      </div>

      {/* RIGHT: FORM */}
      <div
        style={{
          width: "55%",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            paddingLeft: "clamp(48px, 8vw, 104px)",
            paddingRight: "clamp(24px, 5vw, 56px)",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--text-primary)",
                margin: "0 0 8px 0",
                letterSpacing: "-0.01em",
              }}
            >
              Buat Akun
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 300,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              Daftarkan organisasi Anda dan mulai mengelola data
            </p>
          </div>

          <form onSubmit={handleRegister}>
            {/* Organization Name */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 7,
                  letterSpacing: "0.02em",
                }}
              >
                Nama Organisasi
              </label>
              <div style={{ position: "relative" }}>
                <Building2
                  size={15}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder="PT. Nama Perusahaan"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    setError("");
                  }}
                  required
                  className="input"
                  style={{ paddingLeft: 38, ...inputErrorStyle }}
                />
              </div>
            </div>

            {/* Admin Name */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 7,
                  letterSpacing: "0.02em",
                }}
              >
                Nama Admin
              </label>
              <input
                type="text"
                placeholder="Nama Anda"
                value={adminName}
                onChange={(e) => {
                  setAdminName(e.target.value);
                  setError("");
                }}
                required
                className="input"
                style={inputErrorStyle}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 7,
                  letterSpacing: "0.02em",
                }}
              >
                Email
              </label>
              <input
                type="email"
                placeholder="admin@perusahaan.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                required
                className="input"
                style={inputErrorStyle}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 7,
                  letterSpacing: "0.02em",
                }}
              >
                Kata sandi
              </label>
              <input
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
                className="input"
                style={inputErrorStyle}
              />
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: error ? 14 : 28 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 7,
                  letterSpacing: "0.02em",
                }}
              >
                Konfirmasi kata sandi
              </label>
              <input
                type="password"
                placeholder="Ulangi kata sandi"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError("");
                }}
                required
                className="input"
                style={inputErrorStyle}
              />
            </div>

            {/* Error message */}
            {error && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 400,
                  color: "var(--clay-400)",
                  marginTop: 0,
                  marginBottom: 20,
                }}
              >
                {error}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? (
                "Membuat akun..."
              ) : (
                <>
                  <UserPlus size={16} />
                  Daftar
                </>
              )}
            </button>
          </form>

          {/* Login link */}
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 300,
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: 24,
            }}
          >
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="link-echo"
              style={{
                color: "var(--gold-400)",
                textDecoration: "none",
                fontWeight: 400,
              }}
            >
              <LogIn size={12} style={{ display: "inline", marginRight: 3 }} />
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
