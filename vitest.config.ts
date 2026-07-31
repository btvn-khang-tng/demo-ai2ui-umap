import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The golden test loads the full 2,238,732-nnz matrix and runs a
    // 13,714-gene DEG pass; the default 5s timeout is not enough.
    testTimeout: 120_000,
  },
});
