import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // App.css wordt als tekst ingelezen door themeContrast.test.ts; zonder
    // deze include stubt vitest CSS-imports naar een lege string.
    css: { include: [/App\.css/] },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "cobertura"],
      include: ["src/lib/**"],
    },
  },
});
