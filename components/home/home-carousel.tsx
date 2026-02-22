"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

type Props = {
  signedIn: boolean;
};

type Slide = {
  image?: string;
  title: string;
  description: string;
  kind?: "stratos";
};

const slides: Slide[] = [
  {
    image:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80",
    title: "Executive Dashboard",
    description: "Track strategic portfolio KPIs, pipeline value, and action items in one view."
  },
  {
    image:
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80",
    title: "Submissions & Workflow",
    description: "Capture initiatives, route approvals, and monitor stage transitions with auditability."
  },
  {
    title: "STRATOS Copilot",
    description: "Get instant strategic summaries, risk flags, and recommended next actions.",
    kind: "stratos"
  }
];

const pageCards = [
  { title: "Dashboard", text: "Descriptive, predictive, and what-if analytics." },
  { title: "Submissions", text: "Workflow stages, sponsor approval, and intake forms." },
  { title: "Ops Board", text: "Finance + Governance kanban, comments, and task calendar." },
  { title: "Reports", text: "Self-service exports in Excel, PDF, and PowerPoint." },
  { title: "Resources", text: "Interactive stage/status flow, job aids, and training video." },
  { title: "STRATOS Lab", text: "AI helper workspace for scenario guidance and risk checks." }
] as const;

const StratosMark = () => (
  <svg className="h-16 w-16 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l2.8 5.6L21 10l-4.5 4.3L17.6 21 12 18.2 6.4 21l1.1-6.7L3 10l6.2-1.4L12 3Z" />
  </svg>
);

export default function HomeCarousel({ signedIn }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, []);

  const current = slides[index];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {current.image ? (
          <Image src={current.image} alt={current.title} width={1400} height={360} className="h-[360px] w-full object-cover" />
        ) : (
          <div className="flex h-[360px] w-full items-center justify-center bg-gradient-to-br from-[#b00a30] via-[#7f0927] to-[#2a060f]">
            <div className="text-center text-white">
              <div className="mb-4 flex justify-center"><StratosMark /></div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/80">AI Companion</p>
              <h2 className="mt-2 text-5xl font-semibold">STRATOS</h2>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex items-end p-8 text-white">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-[0.2em] text-red-200">Strategic Projects Portal</p>
            <h1 className="mt-2 text-4xl font-semibold">{current.title}</h1>
            <p className="mt-2 text-sm text-slate-100">{current.description}</p>
            <div className="mt-5 flex gap-3">
              <Link href={signedIn ? "/dashboard" : "/login"} className="rounded-md bg-[#b00a30] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f0827]">
                {signedIn ? "Enter Portal" : "Sign In"}
              </Link>
              <a href="#pages" className="rounded-md border border-white/60 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                Explore Pages
              </a>
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 right-4 flex gap-2">
          {slides.map((_, dot) => (
            <button
              key={dot}
              type="button"
              onClick={() => setIndex(dot)}
              className={`h-2.5 w-2.5 rounded-full ${dot === index ? "bg-white" : "bg-white/40"}`}
              aria-label={`Slide ${dot + 1}`}
            />
          ))}
        </div>
      </section>

      <section id="pages" className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pageCards.map((card) => (
          <article key={card.title} className="neo-card rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
