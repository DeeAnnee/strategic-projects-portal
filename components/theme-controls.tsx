"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";
type AccentMode = "crimson" | "blue" | "emerald";

const applyTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
};

const applyAccent = (accent: AccentMode) => {
  document.documentElement.dataset.accent = accent === "crimson" ? "" : accent;
};

export default function ThemeControls() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [accent, setAccent] = useState<AccentMode>("crimson");

  useEffect(() => {
    const savedTheme = (localStorage.getItem("spp-theme") as ThemeMode | null) ?? "light";
    const savedAccent = (localStorage.getItem("spp-accent") as AccentMode | null) ?? "crimson";
    setTheme(savedTheme);
    setAccent(savedAccent);
    applyTheme(savedTheme);
    applyAccent(savedAccent);
  }, []);

  const onTheme = (next: ThemeMode) => {
    setTheme(next);
    localStorage.setItem("spp-theme", next);
    applyTheme(next);
  };

  const onAccent = (next: AccentMode) => {
    setAccent(next);
    localStorage.setItem("spp-accent", next);
    applyAccent(next);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Theme mode"
        value={theme}
        onChange={(event) => onTheme(event.target.value as ThemeMode)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <select
        aria-label="Color mode"
        value={accent}
        onChange={(event) => onAccent(event.target.value as AccentMode)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        <option value="crimson">Crimson</option>
        <option value="blue">Blue</option>
        <option value="emerald">Emerald</option>
      </select>
    </div>
  );
}
