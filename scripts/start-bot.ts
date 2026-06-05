// env-loader DEBE ser el primer import — pobla process.env antes de que
// cualquier otro módulo lo lea en su top-level.
import "./env-loader";

import { start } from "../src/lib/baileys/client";

console.log("[bot] Proceso iniciado.");

start().catch((err) => {
  console.error("[bot] Error fatal al iniciar:", err);
  process.exit(1);
});
