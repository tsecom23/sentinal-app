"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";
export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);

    await supabase.auth.signInWithOtp({
      email,
      options: {
emailRedirectTo: `${window.location.origin}/auth/callback`,      },
    });


    alert("Magic link sent.");

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-8">
        <h1 className="text-3xl font-bold mb-6">
          Sentinel Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="w-full bg-zinc-800 rounded-xl px-4 py-3 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          onClick={signIn}
          disabled={loading}
          className="w-full bg-indigo-600 py-3 rounded-xl font-semibold"
        >
          {loading ? "Loading..." : "Send Magic Link"}
        </button>
      </div>
    </div>
  );
}