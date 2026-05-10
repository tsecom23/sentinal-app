"use client";

import { useState } from "react";
import {
  BarChart3,
  Box,
  Camera,
  LogOut,
  Moon,
  RotateCcw,
  Settings,
  Tag,
  Send,
} from "lucide-react";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AIChatPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm Sentinel AI. Ask me anything about your products, margins, profit, Google Ads readiness, scaling opportunities or products you should kill.",
    },
  ]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);

    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      const json = (await res.json()) as {
        ok: boolean;
        reply?: string;
        error?: string;
      };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            json.reply ||
            json.error ||
            "I could not generate an answer.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I could not reach the Sentinel AI backend. Check if the Cloudflare Worker is deployed.",
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen bg-[#0b0b0f] text-white">
      <aside className="w-[280px] bg-[#111114] p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-10">Sentinel</h1>

          <nav className="space-y-3 text-zinc-400">
            <a href="/">
              <Nav label="Overview" icon={<Box size={18} />} />
            </a>

            <a href="/google-ads">
              <Nav label="Google Ads" icon={<BarChart3 size={18} />} />
            </a>

            <a href="/product-insights">
              <Nav label="Product Insights" icon={<Box size={18} />} />
            </a>

            <a href="/ai-recommendations">
              <Nav label="AI Recommendations" icon={<BarChart3 size={18} />} />
            </a>

            <Nav active label="AI Chat" icon={<Send size={18} />} />

            <div className="ml-4 border-l border-zinc-800 pl-4 mt-4 space-y-2">
              <Nav small label="Price Negotiation" icon={<Tag size={16} />} />
              <Nav small label="Quality Control" icon={<Camera size={16} />} />
            </div>

            <Nav label="Returns & Disputes" icon={<RotateCcw size={18} />} />
          </nav>
        </div>

        <div className="space-y-4 text-zinc-400">
          <Nav label="Dark Mode" icon={<Moon size={18} />} />
          <Nav label="Settings" icon={<Settings size={18} />} />
          <Nav label="Log out" icon={<LogOut size={18} />} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="border-b border-zinc-800 p-8">
          <p className="text-zinc-500">Sentinel</p>
          <h1 className="text-4xl font-bold mt-2">AI Chat Analyst</h1>
          <p className="text-zinc-500 mt-2">
            Powered by your real Shopify, product cost and profit data.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-3xl rounded-2xl p-5 ${
                message.role === "assistant"
                  ? "bg-[#15151c]"
                  : "bg-blue-600 ml-auto"
              }`}
            >
              <p className="text-sm text-zinc-400 mb-2">
                {message.role === "assistant" ? "Sentinel AI" : "You"}
              </p>

              <p className="leading-7 whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          ))}

          {loading && (
            <div className="max-w-3xl rounded-2xl p-5 bg-[#15151c]">
              <p className="text-sm text-zinc-400 mb-2">Sentinel AI</p>
              <p className="leading-7 text-zinc-400">Analyzing your store data...</p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-6">
          <div className="flex gap-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Ask: Which products should I scale? Which products should I kill?"
              className="flex-1 bg-[#15151c] rounded-2xl px-5 py-4 outline-none border border-zinc-800"
            />

            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-blue-600 px-6 rounded-2xl font-semibold hover:bg-blue-500 transition disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Nav({
  label,
  icon,
  active,
  small,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer ${
        active ? "bg-blue-600 text-white" : "hover:bg-zinc-800"
      } ${small ? "text-sm" : ""}`}
    >
      {icon}
      {label}
    </div>
  );
}