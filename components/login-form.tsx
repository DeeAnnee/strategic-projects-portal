"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type DemoAccount = {
  label: string;
  email: string;
  password: string;
};

type LoginFormProps = {
  defaultEmail: string;
  demoAccounts: DemoAccount[];
  showStagingGuide?: boolean;
};

export default function LoginForm({ defaultEmail, demoAccounts, showStagingGuide = false }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    setLoading(false);

    if (response?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Strategic Projects Portal</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to continue.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
            required
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="mt-6 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {demoAccounts.map((account) => (
            <li key={account.email}>
              {account.label}: {account.email} / {account.password}
            </li>
          ))}
        </ul>
        {showStagingGuide ? (
          <p className="mt-2 text-xs text-slate-600">
            Full staging workflow guide:{" "}
            <a className="font-semibold text-brand-700 underline underline-offset-2" href="/staging-guide">
              /staging-guide
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
