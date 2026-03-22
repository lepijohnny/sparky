import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "core/**/*.test.ts",
      "chat/**/*.test.ts",
      "settings/**/*.test.ts",
      "knowledge/**/*.test.ts",
      "tools/**/*.test.ts",
      "skills/**/*.test.ts",
      "test/**/*.test.ts",
    ],
  },
});
