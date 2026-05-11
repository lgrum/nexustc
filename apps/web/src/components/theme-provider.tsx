import { useState } from "react";

export type Theme = "light" | "dark" | "system";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  function apply(next: Theme) {
    localStorage.setItem("theme", next);

    const root = document.documentElement;
    root.classList.remove("light", "dark");

    const resolved =
      next === "dark" ||
      (next === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";

    root.classList.add(resolved);
    root.style.colorScheme = resolved;
    setTheme(next);
  }

  return { setTheme: apply, theme };
}
