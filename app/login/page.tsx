"use client";

import { useState } from "react";
// no icon import needed
import { createClient } from "../../utils/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState("");
  const [isError, setIsError]   = useState(false);

  async function signIn() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }
    window.location.href = "/";
  }

  async function signUp() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage(error.message);
      setIsError(true);
    } else {
      setMessage("Account created — you can now sign in.");
      setIsError(false);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#08080f] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/50">
            <span className="text-white font-black text-xl tracking-tight leading-none">TS</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight">TSecom</h1>
            <p className="text-zinc-500 text-sm">AI Commerce OS</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Sign in</h2>

          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 outline-none focus:border-blue-500/60 transition-colors"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && signIn()}
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 outline-none focus:border-blue-500/60 transition-colors"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && signIn()}
            />
          </div>

          {message && (
            <p className={`text-xs px-3 py-2 rounded-lg ${isError ? "bg-red-950/50 text-red-400" : "bg-emerald-950/50 text-emerald-400"}`}>
              {message}
            </p>
          )}

          <button
            onClick={signIn}
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="border-t border-white/5 pt-4">
            <p className="text-xs text-zinc-600 text-center mb-3">No account yet?</p>
            <button
              onClick={signUp}
              disabled={loading || !email || !password}
              className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-medium transition-colors text-zinc-300"
            >
              Create account
            </button>
          </div>
        </div>

        <p className="text-center text-zinc-700 text-xs">
          Access restricted to authorised users only.
        </p>
      </div>
    </div>
  );
}
