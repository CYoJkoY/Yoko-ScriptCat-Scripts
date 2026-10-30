import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
    globals: true,
    restoreMocks: true,
  },
});
