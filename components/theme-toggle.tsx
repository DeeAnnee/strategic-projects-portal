"use client";

import { useEffect, useState } from "react";

type ThemeToggleProps = {
  className?: string;
};

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("spp-theme") === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("spp-theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`sidebar-theme-toggle w-full ${className ?? ""}`.trim()}
      role="switch"
      aria-checked={dark}
    >
      <span className="sidebar-theme-toggle-label">Dark Mode</span>
      <span className={`sidebar-theme-toggle-track ${dark ? "is-on" : ""}`}>
        <span className="sidebar-theme-toggle-thumb" />
      </span>
    </button>
  );
}
