"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-inksoft text-sm">
            We sent a confirmation link to <strong>{email}</strong>. Confirm it, then log in.
          </p>
          <Link href="/login" className="inline-block mt-6 text-jade font-semibold">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold mb-1">Ipon</h1>
        <p className="text-inksoft text-sm mb-8">Create your account to start tracking.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-inksoft block mb-1">Full name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 bg-paperraised focus:outline-jade"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 bg-paperraised focus:outline-jade"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft block mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 bg-paperraised focus:outline-jade"
            />
          </div>

          {error && <p className="text-coral text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-jade text-paperraised font-semibold rounded-xl py-3 mt-2 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="text-sm text-inksoft mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-jade font-semibold">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
