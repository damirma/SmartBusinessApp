# SmartBusiness OCR Suite — Project Facts

- **Nombre:** SmartBusiness OCR Suite
- **Tipo:** SaaS académico (ETITC Bogotá, Proyecto de Investigación II)
- **Autores:** Erik Gil Suárez (frontend + worker-ocr), Samuel (arq), Juan Pablo (K8s)
- **Git user:** damirma | **Email:** erickfabrizio01@gmail.com

## Stack
- **Frontend:** Angular 20 + Ionic 8 + Capacitor 8.3 + TypeScript 5.9
  - Standalone Components (sin NgModules), lazy loading obligatorio
  - Servicios retornan Observable, no Promise
- **Backend:** Python 3.11 + Flask 3.0 + worker-ocr (main.py único archivo)
- **IA:** Groq — Llama 3 70B (texto/PDF) + Llama 4 Scout (imágenes)
  - PDFs nativos: MarkItDown → texto → Llama 70B
  - Imágenes: base64 → Llama 4 Scout (visión)
- **BD:** Supabase PostgreSQL (8 tablas, RLS activo)
- **Infra:** GCP VM dam01, minikube, namespace pyme-test, n8n en namespace infraestructura

## URLs / IPs
- **Worker URL:** `http://34.45.194.133:30080` (IP estática reservada en Fase 0)
- **Supabase URL:** `https://zsoynenfjwmeghsvguvg.supabase.co`
- **Dominio:** `smartbusinessdam.sytes.net`

## Estructura clave
- `src/app/services/factura.ts` — HTTP client (workerUrl + supabaseUrl de environment.ts)
- `src/app/models/` — interfaces TypeScript, barrel en index.ts
- `src/theme/tokens.scss` — todos los --sb-* tokens (completo)
- `worker-ocr/main.py` — Flask app, endpoints /health y /procesar

## Tablas Supabase
pymes, facturas, factura_items, factura_impuestos, autorizaciones_dian, procesamiento_log, usuarios, perfil_extraccion

## Decisiones arquitectónicas clave
- Groq reemplazó a Gemini (gratis, sin rate limits severos)
- Batch en frontend para MVP (loop secuencial/paralelo limitado), cola en n8n para producción
- n8n es thin orchestrator — lógica OCR vive en worker-ocr
- Un solo main.py en worker-ocr (no fragmentar en módulos)
- Edición manual obligatoria (IA ~75% exactitud)
