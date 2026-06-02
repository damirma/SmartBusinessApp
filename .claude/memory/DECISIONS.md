# Architecture Decisions Log

## ADR-001 — Groq reemplaza a Gemini para OCR (2026-06-02)
**Contexto:** Gemini free tier agotado, gemini-1.5-pro deprecated
**Decisión:** Migrar worker-ocr a Groq — Llama 3 70B para texto/PDF, Llama 4 Scout para visión
**Consecuencias:** ~75% exactitud (vs 100% en XML), pero gratis y sin rate limits severos

## ADR-002 — Batch en frontend para MVP (2026-06-02)
**Contexto:** Necesitamos carga masiva de facturas para la demo
**Decisión:** Loop en frontend (máx 3 concurrentes) en lugar de endpoint /procesar-batch
**Consecuencias:** Más simple, no requiere cambios en worker-ocr. Para producción → n8n con cola

## ADR-003 — n8n como thin orchestrator (2026-06-02)
**Contexto:** ¿Dónde vive la lógica de OCR?
**Decisión:** Toda la lógica en worker-ocr; n8n solo enruta y notifica
**Consecuencias:** worker-ocr es testeable independientemente; n8n es intercambiable

## ADR-004 — Un solo main.py en worker-ocr (2026-06-02)
**Contexto:** ¿Fragmentar en módulos Python?
**Decisión:** Mantener todo en main.py hasta que el proyecto crezca justifique la separación
**Consecuencias:** Más simple para el contexto académico; refactorizar en Fase 3-4

## ADR-005 — Edición manual obligatoria de campos IA (2026-06-02)
**Contexto:** IA extrae con ~75% exactitud en PDF/imagen
**Decisión:** Implementar modo edición en detalle.page para que el usuario corrija errores
**Consecuencias:** UX más completa, datos más confiables en Supabase

## ADR-008 — Sistema visual: DM Sans + Outfit + JetBrains Mono + plugin frontend-design (2026-06-02)
**Contexto:** La app tenía fuentes genéricas (Inter/system-ui) y el accent verde era #00D68F. Se adoptó el plugin frontend-design como referencia para elevar calidad visual a nivel producto real (Linear, Vercel, Stripe, Raycast).
**Decisión:**
- Body: `DM Sans` (cálido, limpio, no genérico)
- Display/headings: `Outfit` (geométrico, carácter propio, no usado en exceso)
- Data/IDs/monospace: `JetBrains Mono`
- Accent actualizado a `#2ECC71` (más vibrant, especificado por usuario)
- Fondos más profundos: `#0A0A0F`, `#13131A`, `#1C1C26`
- Plugin frontend-design como referencia visual en cada rediseño
**Consecuencias:** Mayor coherencia visual; fuentes cargadas de Google Fonts (requiere conexión en browser); próxima evolución hacia estética iPhone (cards más redondeadas, motion sutil)

## ADR-006 — Angular Signals para estado de progreso batch (2026-06-02)
**Contexto:** Estado reactivo del progreso de carga masiva
**Decisión:** Usar Angular Signals (no BehaviorSubject) para el estado de ArchivoEnProceso[]
**Consecuencias:** Código más simple, mejor rendimiento en detección de cambios
