"use client";

import { useState } from "react";

import CopilotPanel from "@/components/copilot/CopilotPanel";

const StratosIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l2.8 5.6L21 10l-4.5 4.3L17.6 21 12 18.2 6.4 21l1.1-6.7L3 10l6.2-1.4L12 3Z" />
  </svg>
);

export default function FloatingCopilot() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-[70]">
      {open ? (
        <div className="mb-3 h-[min(84vh,820px)] w-[min(96vw,1280px)] rounded-xl border border-slate-300 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="rounded-md accent-bg px-1.5 py-1">
                <StratosIcon className="h-3.5 w-3.5" />
              </span>
              STRATOS Copilot
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
              type="button"
            >
              Close
            </button>
          </div>
          <div className="h-[calc(100%-52px)]">
            <CopilotPanel className="h-full rounded-none border-0" />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="group flex items-center gap-2 rounded-full accent-bg px-5 py-3 text-sm font-semibold shadow-xl"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="rounded-full bg-white/20 p-1.5 group-hover:rotate-12 transition"><StratosIcon className="h-4 w-4" /></span>
        <span>STRATOS</span>
      </button>
    </div>
  );
}
