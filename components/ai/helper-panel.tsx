"use client";

import { useState } from "react";

import type { ProjectSubmission } from "@/lib/submissions/types";

type Props = {
  submissions: ProjectSubmission[];
};

type AiResult = {
  answer: string;
  recommendations: string[];
  riskFlags: string[];
};

const starterPrompts = [
  "Give me an executive summary",
  "What are the risk flags?",
  "Evaluate financial assumptions",
  "What should happen next in workflow?"
] as const;

export default function HelperPanel({ submissions }: Props) {
  const [caseId, setCaseId] = useState<string>(submissions[0]?.id ?? "");
  const [question, setQuestion] = useState("Give me an executive summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, caseId: caseId || undefined })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to get AI response");
      }

      setResult(payload.data);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Failed to get AI response");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">STRATOS Copilot Studio</h2>
        <p className="mt-1 text-sm text-slate-600">AI helper for project summary, risk checks, and workflow guidance.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            CaseID (optional)
            <select
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">No specific case</option>
              {submissions.map((submission) => (
                <option key={submission.id} value={submission.id}>
                  {submission.id} - {submission.title || "Untitled"}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm">
            Starter prompts
            <div className="mt-1 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(prompt)}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <label className="text-sm md:col-span-2">
            Question
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="Ask about risks, financials, or next workflow action"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            void ask();
          }}
          disabled={loading}
          className="mt-4 rounded-md accent-bg px-4 py-2 text-sm font-semibold disabled:opacity-70"
        >
          {loading ? "Analyzing..." : "Ask STRATOS"}
        </button>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>

      {result ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold">Response</h3>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{result.answer}</pre>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Risk Flags</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {result.riskFlags.length === 0 ? <li>No major flags detected.</li> : null}
              {result.riskFlags.map((flag) => (
                <li key={flag}>- {flag}</li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-semibold">Recommended Next Actions</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {result.recommendations.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </div>
  );
}
