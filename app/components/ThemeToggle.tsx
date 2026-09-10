"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function useTheme() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sentinel-theme");
    if (stored === "light") {
      document.documentElement.classList.add("light");
      setLight(true);
    }
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.classList.add("light");
      localStorage.setItem("sentinel-theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("sentinel-theme", "dark");
    }
  }

  return { light, toggle };
}

export default function ThemeToggle() {
  const { light, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 shrink-0"
      style={{
        background: light ? "rgba(139,92,246,0.10)" : "rgba(139,92,246,0.08)",
        border: "1px solid rgba(139,92,246,0.18)",
        color: light ? "#7c3aed" : "#8b5cf6",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.18)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = light ? "rgba(139,92,246,0.10)" : "rgba(139,92,246,0.08)"; }}
    >
      {light ? <Moon size={12} /> : <Sun size={12} />}
    </button>
  );
}
