"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/";
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Account created. You can now sign in.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-8">
        <h1 className="text-3xl font-bold mb-6">Sentinel Login</h1>

        <input
          type="email"
          placeholder="Email"
          className="w-full bg-zinc-800 rounded-xl px-4 py-3 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full bg-zinc-800 rounded-xl px-4 py-3 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {message && (
          <div className="mb-4 text-sm text-yellow-400">
            {message}
          </div>
        )}

        <button
          onClick={signIn}
          disabled={loading}
          className="w-full bg-blue-600 py-3 rounded-xl font-semibold mb-3"
        >
          {loading ? "Loading..." : "Sign In"}
        </button>

        <button
          onClick={signUp}
          disabled={loading}
          className="w-full bg-zinc-800 py-3 rounded-xl font-semibold"
        >
          Create Account
        </button>
      </div>
    </div>
  );
}