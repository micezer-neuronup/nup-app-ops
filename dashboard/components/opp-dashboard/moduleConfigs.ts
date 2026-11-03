import type { OppModuleKey } from "./modules";
import type { ModuleConfig } from "./shared/moduleConfig";
import { ASSESSMENT_CONFIG } from "./assessment/config";
import { SESSIONS_CONFIG } from "./sessions/config";

// Configuración de tablero de cada módulo activo. Se resuelve en el cliente (OppBoard, OppHome): la config lleva
// funciones e iconos, que no se pueden pasar desde un Server Component (las páginas solo pasan la clave).
export const MODULE_CONFIGS: Partial<Record<OppModuleKey, ModuleConfig>> = {
  assessment: ASSESSMENT_CONFIG,
  sessions: SESSIONS_CONFIG,
};
