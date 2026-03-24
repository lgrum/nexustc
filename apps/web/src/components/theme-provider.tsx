import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) {
      setTheme(stored);
    }
  }, []);

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
