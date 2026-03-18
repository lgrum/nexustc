/// <reference types="vitest/config" />

import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

const config = defineConfig(({ mode }) => {
  return {
    plugins: [
      devtools(),
      tailwindcss(),
      mode !== "test" && tanstackStart(),
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": srcDir,
      },
      tsconfigPaths: true,
    },

    build: {
      rolldownOptions: {
        external: ["sharp"],
      },
    },

    ssr: {
      external: ["sharp"],
    },

    test: {
      environment: "happy-dom",
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
    },
  };
});

export default config;
