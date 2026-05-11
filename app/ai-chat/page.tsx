"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Sparkles } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";
const STORES = [
  { key: "ceofo", name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

const SUGGESTIONS = [
  "How is today going?",
  "Which products should I kill?",
  "What are my best products?",
  "What milestones did I reach?",
  "What's my ROAS today?",
];

type Message = {
  role: "user" | "assistant";
  content: string;
};

/** Render markdown-lite: **bold** and • bullet points */
function RenderReply({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const isBullet = line.trimStart().startsWith("•");
        const content = isBullet ? line.trimStart().slice(1).trim() : line;
        const parts = content.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} className="text-white font-semibold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={j}>{part}</span>;
        });
        if (isBullet) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-zinc-500" />
              <p className="text-zinc-300">{rendered}</p>
            </div>
          );
        }
        if (!content.trim()) return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-zinc-300">
            {rendered}
          </p>
        );
      })}
    </div>
  );
}

export default function AIChatPage() {
  const [storeId, setStoreId] = useState("martaline");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm TSecom AI. Ask me anything about your store performance, products to scale or kill, or supplier opportunities. Type 'help' to see all options.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, store_id: storeId }),
      });
      const json = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            json.reply ?? json.error ?? "I could not generate an answer.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I could not reach the TSecom AI backend. Please check your connection.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#08080f" }}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-white/5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <MessageSquare size={22} className="text-blue-400" />
              AI Chat
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Powered by your real Shopify, product cost and profit data
            </p>
          </div>
          {/* Store selector */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {STORES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStoreId(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  storeId === s.key
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-xs text-zinc-400 hover:text-white hover:bg-white/8 transition-all disabled:opacity-40"
            >
              <Sparkles size={10} className="text-blue-400 shrink-0" />
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) =>
          msg.role === "assistant" ? (
            <div
              key={i}
              className="max-w-3xl bg-white/3 border border-white/5 rounded-2xl p-4"
            >
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2 font-semibold">
                TSecom AI
              </p>
              <RenderReply text={msg.content} />
            </div>
          ) : (
            <div
              key={i}
              className="bg-blue-600 rounded-2xl p-4 ml-auto max-w-[80%]"
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
            </div>
          )
        )}

        {/* Loading bubble */}
        {loading && (
          <div className="max-w-3xl bg-white/3 border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2 font-semibold">
              TSecom AI
            </p>
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 size={14} className="animate-spin text-blue-400" />
              Analysing your store data...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/5 px-6 py-4">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask anything about your store..."
            disabled={loading}
            className="flex-1 bg-white/4 border border-white/8 rounded-2xl px-5 py-3 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
