"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex items-center gap-2 group"
    >
      {/* Ícono sol */}
      <svg
        className={`w-3.5 h-3.5 transition-colors ${isDark ? "text-slate-600" : "text-amber-400"}`}
        viewBox="0 0 24 24" fill="currentColor"
      >
        <path d="M12 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm8-4a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM4 13a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1Zm15.07-7.07a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM6.34 17.66a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM12 20a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7.07-1.93a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 1 1 1.41-1.41l.71.71ZM5.64 5.64a1 1 0 0 1 1.41 1.41l-.71.71A1 1 0 1 1 4.93 6.34l.71-.71Z"/>
      </svg>

      {/* Track del slider */}
      <div
        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
          isDark
            ? "bg-emerald-600"
            : "bg-gray-200 dark:bg-slate-700"
        }`}
      >
        {/* Thumb */}
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 flex items-center justify-center ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {isDark ? (
            <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"/>
            </svg>
          ) : (
            <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="4"/>
            </svg>
          )}
        </div>
      </div>

      {/* Ícono luna */}
      <svg
        className={`w-3.5 h-3.5 transition-colors ${isDark ? "text-emerald-400" : "text-slate-300"}`}
        viewBox="0 0 24 24" fill="currentColor"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"/>
      </svg>
    </button>
  );
}
