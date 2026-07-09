"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  Shield,
  UserPlus,
  Trash2,
  Settings,
  AlertCircle,
  CheckCircle,
  X,
  Calendar,
} from "lucide-react";
import { authFetch, getStoredAuth } from "@/lib/auth-client";

// ── Types ──

interface TenantInfo {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
}

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
  createdAt: string;
}

type TabId = "users" | "tenant";

// ── Role badge style ──

const ROLE_STYLES: Record<string, React.CSSProperties> = {
  ADMIN: {
    background: "rgba(212, 168, 83, 0.12)",
    color: "var(--gold-400)",
    border: "1px solid rgba(212, 168, 83, 0.2)",
  },
  ANALYST: {
    background: "rgba(138, 155, 122, 0.12)",
    color: "var(--sage-400)",
    border: "1px solid rgba(138, 155, 122, 0.2)",
  },
  VIEWER: {
    background: "rgba(168, 154, 132, 0.08)",
    color: "var(--text-muted)",
    border: "1px solid var(--border-default)",
  },
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

// ── Sub-components ──

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className="badge"
      style={{
        ...ROLE_STYLES[role] || ROLE_STYLES.VIEWER,
        textTransform: "none",
        fontWeight: 400,
        fontSize: 12,
        padding: "2px 10px",
      }}
    >
      <Shield size={10} style={{ opacity: 0.7 }} />
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function InviteModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: number;
  onClose: () => void;
  onCreated: (user: UserRecord) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authFetch(`/api/tenants/${tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(13, 13, 12, 0.75)",
          zIndex: 100,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 101,
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div
          className="card-raised"
          style={{ padding: "28px 28px 24px 28px" }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Undang Pengguna
            </h3>
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ padding: "4px 6px" }}
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleInvite}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Nama
              </label>
              <input
                type="text"
                placeholder="Nama pengguna"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                type="email"
                placeholder="user@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Role
              </label>
              <div className="select-wrap">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="ANALYST">Analyst</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>

            {error && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--clay-400)",
                  marginBottom: 16,
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Mengundang..." : "Undang Pengguna"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Users Tab ──

function UsersTab({
  tenantId,
  currentUserId,
}: {
  tenantId: number;
  currentUserId: number;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/tenants/${tenantId}/users`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal memuat data");
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleRoleChange(userId: number, newRole: string) {
    try {
      const res = await authFetch(
        `/api/tenants/${tenantId}/users/${userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const updated = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? updated : u))
      );
      setFeedback({ type: "success", message: "Role berhasil diperbarui." });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  async function handleDelete(userId: number) {
    if (
      !confirm("Apakah Anda yakin ingin menghapus pengguna ini dari tenant?")
    )
      return;

    setDeletingId(userId);
    try {
      const res = await authFetch(
        `/api/tenants/${tenantId}/users/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setFeedback({
        type: "success",
        message: "Pengguna berhasil dihapus.",
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setDeletingId(null);
    }
  }

  function handleUserCreated(user: UserRecord) {
    setUsers((prev) => [...prev, user]);
    setFeedback({
      type: "success",
      message: "Pengguna berhasil diundang.",
    });
    setTimeout(() => setFeedback(null), 3000);
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div
          className="skeleton"
          style={{ height: 40, marginBottom: 12, maxWidth: 400, margin: "0 auto 12px" }}
        />
        <div
          className="skeleton"
          style={{ height: 40, marginBottom: 12, maxWidth: 350, margin: "0 auto 12px" }}
        />
        <div
          className="skeleton"
          style={{ height: 40, maxWidth: 300, margin: "0 auto" }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            fontWeight: 300,
            margin: 0,
          }}
        >
          {users.length} pengguna dalam tenant ini
        </p>
        <button
          onClick={() => setShowInvite(true)}
          className="btn btn-primary"
          style={{ padding: "7px 14px", fontSize: 13 }}
        >
          <UserPlus size={14} />
          Undang Pengguna
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 400,
            background:
              feedback.type === "success"
                ? "rgba(138, 155, 122, 0.1)"
                : "rgba(184, 92, 58, 0.1)",
            border:
              feedback.type === "success"
                ? "1px solid rgba(138, 155, 122, 0.2)"
                : "1px solid rgba(184, 92, 58, 0.2)",
            color:
              feedback.type === "success"
                ? "var(--sage-400)"
                : "var(--clay-400)",
          }}
        >
          {feedback.type === "success" ? (
            <CheckCircle size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          {feedback.message}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            marginBottom: 16,
            fontSize: 13,
            background: "rgba(184, 92, 58, 0.1)",
            border: "1px solid rgba(184, 92, 58, 0.2)",
            color: "var(--clay-400)",
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Users table */}
      <div
        className="card"
        style={{ overflow: "hidden", borderRadius: "var(--radius-lg)" }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 120px 60px",
            gap: 12,
            padding: "12px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          <span>Nama</span>
          <span>Email</span>
          <span>Role</span>
          <span style={{ textAlign: "center" }}></span>
        </div>

        {/* Table body */}
        {users.length === 0 ? (
          <div
            className="empty-state"
            style={{ padding: "48px 24px" }}
          >
            <h3>Belum ada pengguna lain</h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                margin: 0,
                position: "relative",
              }}
            >
              Undang anggota tim untuk berkolaborasi
            </p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 120px 60px",
                gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                alignItems: "center",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {user.name}
                </span>
                {user.id === currentUserId && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: "var(--text-muted)",
                      marginLeft: 8,
                    }}
                  >
                    (Anda)
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {user.email}
              </span>
              <div className="select-wrap">
                <select
                  value={user.role}
                  onChange={(e) =>
                    handleRoleChange(user.id, e.target.value)
                  }
                  style={{
                    padding: "4px 28px 4px 10px",
                    fontSize: 12,
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <div style={{ textAlign: "center" }}>
                <button
                  onClick={() => handleDelete(user.id)}
                  disabled={deletingId === user.id || user.id === currentUserId}
                  className="btn btn-danger"
                  style={{
                    padding: "4px 8px",
                    opacity:
                      user.id === currentUserId ? 0.3 : 1,
                  }}
                  title={
                    user.id === currentUserId
                      ? "Tidak dapat menghapus akun sendiri"
                      : "Hapus pengguna"
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          tenantId={tenantId}
          onClose={() => setShowInvite(false)}
          onCreated={handleUserCreated}
        />
      )}
    </div>
  );
}

// ── Tenant Info Tab ──

function TenantInfoTab({ tenant }: { tenant: TenantInfo }) {
  return (
    <div
      className="card"
      style={{ padding: "28px 28px 24px 28px", maxWidth: 520 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-md)",
            background: "var(--gold-dim)",
            border: "1px solid rgba(212, 168, 83, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Building2 size={22} style={{ color: "var(--gold-400)" }} />
        </div>
        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--text-primary)",
              margin: "0 0 4px 0",
            }}
          >
            {tenant.name}
          </h3>
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "var(--text-muted)",
              background: "rgba(168, 154, 132, 0.08)",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {tenant.slug}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Calendar
            size={14}
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          />
          <div>
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 2,
              }}
            >
              Dibuat pada
            </span>
            <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
              {new Date(tenant.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Shield
            size={14}
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          />
          <div>
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 2,
              }}
            >
              Tenant ID
            </span>
            <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
              {tenant.id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Settings Page ──

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    // Only ADMIN can access settings
    if (auth.session.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }

    setUserId(auth.session.userId);
    setRole(auth.session.role);

    // Fetch full tenant info
    authFetch(`/api/tenants/${auth.session.tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setTenant(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          className="skeleton"
          style={{ width: 600, height: 400 }}
        />
      </div>
    );
  }

  if (!tenant || !userId) {
    return (
      <div
        className="empty-state"
        style={{ padding: "80px 24px" }}
      >
        <h3>Tidak dapat memuat data</h3>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Pengguna", icon: Users },
    { id: "tenant", label: "Tenant", icon: Building2 },
  ];

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "36px 28px",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--text-primary)",
            margin: "0 0 6px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Pengaturan
        </h1>
        <p
          style={{
            fontSize: 14,
            fontWeight: 300,
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Kelola pengguna dan informasi tenant organisasi Anda
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 28,
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                color: isActive
                  ? "var(--gold-400)"
                  : "var(--text-muted)",
                background: isActive
                  ? "var(--gold-dim)"
                  : "transparent",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--gold-500)"
                  : "2px solid transparent",
                borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                cursor: "pointer",
                transition: "all 180ms",
                fontFamily: "var(--font-body)",
              }}
            >
              <Icon
                size={15}
                style={{ opacity: isActive ? 1 : 0.5 }}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "users" && (
        <UsersTab tenantId={tenant.id} currentUserId={userId} />
      )}
      {activeTab === "tenant" && <TenantInfoTab tenant={tenant} />}
    </div>
  );
}
