"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getStoredToken } from "@/lib/auth-client";

// ── Design Tokens (Batik Gold) ──────────────────────────────────
const TOKENS = {
  bg: "#0d0d0c",
  surface: "#1a1917",
  gold: "#D4A853",
  goldDim: "rgba(212,168,83,0.08)",
  goldBorder: "rgba(212,168,83,0.12)",
  text: "#e8e4db",
  muted: "#8a8578",
  font: "'DM Sans', system-ui, sans-serif",
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME_EXAMPLES = [
  "List semua tabel",
  "Schema tabel bank_rekon_clean_silver",
  "Rekap data per status",
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Simple markdown renderer — handles code blocks, bold, italic, inline code
function renderMarkdown(text: string): string {
  let html = text;
  // Code blocks (triple backtick)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre style="background:#0d0d0c;padding:10px;border-radius:8px;overflow-x:auto;font-size:0.85rem;white-space:pre-wrap"><code>${escaped}</code></pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#0d0d0c;padding:1px 5px;border-radius:4px;font-size:0.85rem">$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Bullet lists
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>');
  // Line breaks
  html = html.replace(/\n/g, "<br/>");
  return html;
}

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg: Message = { id: generateId(), role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = getStoredToken();
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal menghubungi AI");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: data.content },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `❌ Maaf, terjadi kesalahan: ${err.message || "Coba lagi nanti ya!"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    if (!isOpen) setIsOpen(true);
    // Focus textarea after state update
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <>
      {/* ── Trigger Button ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1000,
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: TOKENS.gold,
          border: "none",
          color: TOKENS.bg,
          fontSize: "1.4rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(212,168,83,0.3)",
          transition: "transform 0.2s, box-shadow 0.2s",
          fontFamily: TOKENS.font,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.transform = "scale(1.08)";
          (e.target as HTMLElement).style.boxShadow = "0 6px 28px rgba(212,168,83,0.45)";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.transform = "scale(1)";
          (e.target as HTMLElement).style.boxShadow = "0 4px 20px rgba(212,168,83,0.3)";
        }}
        aria-label={isOpen ? "Tutup chat" : "Buka chat"}
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* ── Slide Panel ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 999,
          width: 384,
          height: "100vh",
          backgroundColor: TOKENS.bg,
          borderLeft: `1px solid ${TOKENS.goldBorder}`,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isOpen ? "-4px 0 30px rgba(0,0,0,0.5)" : "none",
          fontFamily: TOKENS.font,
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${TOKENS.goldBorder}`,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem",
              fontWeight: 700,
              color: TOKENS.gold,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🤖 Gaung AI
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: TOKENS.muted,
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = TOKENS.text)}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = TOKENS.muted)}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* ── Messages Area ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.length === 0 ? (
            /* ── Welcome / Empty State ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 20 }}>
              <div
                style={{
                  backgroundColor: TOKENS.surface,
                  borderRadius: 12,
                  padding: "16px 18px",
                  maxWidth: "90%",
                  alignSelf: "flex-start",
                }}
              >
                <p style={{ margin: 0, color: TOKENS.text, lineHeight: 1.6, fontSize: "0.9rem" }}>
                  Halo! Tanya data lakehouse kamu:
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {WELCOME_EXAMPLES.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(example)}
                    style={{
                      backgroundColor: TOKENS.goldDim,
                      border: `1px solid ${TOKENS.goldBorder}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      color: TOKENS.gold,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background-color 0.15s, border-color 0.15s",
                      fontFamily: TOKENS.font,
                      maxWidth: "90%",
                      alignSelf: "flex-start",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = "rgba(212,168,83,0.15)";
                      (e.target as HTMLElement).style.borderColor = "rgba(212,168,83,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = TOKENS.goldDim;
                      (e.target as HTMLElement).style.borderColor = TOKENS.goldBorder;
                    }}
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 16px",
                    borderRadius: 16,
                    fontSize: "0.88rem",
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                    ...(msg.role === "user"
                      ? {
                          backgroundColor: "rgba(212,168,83,0.15)",
                          color: TOKENS.text,
                          borderTopRightRadius: 4,
                        }
                      : {
                          backgroundColor: TOKENS.surface,
                          color: TOKENS.text,
                          borderTopLeftRadius: 4,
                        }),
                  }}
                  dangerouslySetInnerHTML={
                    msg.role === "assistant" ? { __html: renderMarkdown(msg.content) } : undefined
                  }
                >
                  {msg.role === "user" ? msg.content : undefined}
                </div>
              </div>
            ))
          )}

          {/* ── Loading Indicator ── */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  backgroundColor: TOKENS.surface,
                  borderRadius: 16,
                  borderTopLeftRadius: 4,
                  padding: "12px 16px",
                  color: TOKENS.muted,
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Mengetik
                <span
                  style={{
                    display: "inline-flex",
                    gap: 3,
                    marginLeft: 2,
                  }}
                >
                  <span className="typing-dot" style={dotStyle(0)} />
                  <span className="typing-dot" style={dotStyle(0.2)} />
                  <span className="typing-dot" style={dotStyle(0.4)} />
                </span>
                <style>{`
                  @keyframes typingPulse {
                    0%, 60%, 100% { opacity: 0.25; transform: scale(0.85); }
                    30% { opacity: 1; transform: scale(1); }
                  }
                  .typing-dot {
                    animation: typingPulse 1.4s ease-in-out infinite;
                  }
                `}</style>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input Area ── */}
        <div
          style={{
            borderTop: `1px solid ${TOKENS.goldBorder}`,
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya sesuatu..."
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              resize: "none",
              backgroundColor: TOKENS.surface,
              border: `1px solid ${TOKENS.goldBorder}`,
              borderRadius: 12,
              padding: "10px 14px",
              color: TOKENS.text,
              fontSize: "0.88rem",
              fontFamily: TOKENS.font,
              lineHeight: 1.4,
              outline: "none",
              minHeight: 42,
              maxHeight: 120,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = TOKENS.gold;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = TOKENS.goldBorder;
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              width: 42,
              height: 42,
              minWidth: 42,
              borderRadius: "50%",
              backgroundColor: input.trim() && !loading ? TOKENS.gold : TOKENS.goldDim,
              border: "none",
              color: input.trim() && !loading ? TOKENS.bg : TOKENS.muted,
              fontSize: "1.1rem",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.2s, transform 0.15s",
              opacity: input.trim() && !loading ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (input.trim() && !loading) {
                (e.target as HTMLElement).style.transform = "scale(1.08)";
              }
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.transform = "scale(1)";
            }}
            aria-label="Kirim"
          >
            →
          </button>
        </div>
      </div>

      {/* ── Backdrop (click to close) ── */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 998,
            background: "rgba(0,0,0,0.3)",
          }}
        />
      )}
    </>
  );
}

function dotStyle(delay: number): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: TOKENS.gold,
    display: "inline-block",
    animationDelay: `${delay}s`,
  };
}
