import { defineConfig } from "vitest/config";
import path from "node:path";

// Alias mínimo necesario para que los tests resuelvan "@/..." igual que
// tsconfig.json ("@/*" -> "./*"). No se usa vite-tsconfig-paths ni ningún
// plugin adicional: es un único alias, no vale la pena la dependencia extra.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
