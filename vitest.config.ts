import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "cobertura"],
      include: ["src/lib/**"],
    },
  },
});
