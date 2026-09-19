import { vi } from "vitest";

// "server-only" lanza si se importa fuera de un build de Next.js (ver
// node_modules/server-only/index.js). En tests corremos en Node plano, así
// que lo neutralizamos acá una sola vez para todos los archivos de test, en
// vez de mockearlo en cada test que importe un módulo con `import "server-only"`.
vi.mock("server-only", () => ({}));
