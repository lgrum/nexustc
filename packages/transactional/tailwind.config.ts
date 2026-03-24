import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      borderRadius: {
        "4xl": "2rem",
      },
      spacing: {
        "128": "32rem",
        "144": "36rem",
      },
    },
    fontFamily: {
      sans: ["Outfit", "sans-serif"],
    },
    screens: {
      lg: "976px",
      md: "768px",
      sm: "480px",
      xl: "1440px",
    },
  },
} satisfies Config;
