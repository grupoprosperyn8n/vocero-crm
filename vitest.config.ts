import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Las de integración se auto-saltan salvo que INTEGRATION_DATABASE_URL
    // apunte a una copia local (ver tests/integration/).
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
