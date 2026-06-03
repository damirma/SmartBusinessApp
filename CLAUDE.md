/# SmartBusinessApp — CLAUDE.md

Documento de contexto completo para Claude Code. Actualizado: 2026-06-02 (sesión 2).

---

## ¿Qué es este proyecto?

**SmartBusiness OCR Suite** es una plataforma SaaS de OCR/IDP (Intelligent Document Processing) para facturas electrónicas colombianas en formato DIAN. Su objetivo es ayudar a PyMEs a digitalizar, extraer y gestionar datos de facturas (XML UBL 2.1 y PDF/imagen) con procesamiento IA vía Gemini.

**Contexto académico:**
- Materia: Proyecto de Investigación II — ETITC Bogotá (Escuela Tecnológica Instituto Técnico Central)
- Profesora: Sandra Johana Guerrero Gómez
- Equipo:
  - **Erik Gil Suárez** (`erickfabrizio01@gmail.com`) — Frontend Ionic + worker-ocr Capa 1
  - **Samuel** — Arquitectura general
  - **Juan Pablo** — Kubernetes / infraestructura

**Modelo de negocio:** Freemium SaaS
- FREE: 50 facturas/mes
- PYME: ~$29 USD/mes (ilimitado)
- Enterprise: precio negociado

**GitHub:** `github.com/damirma/SmartBusinessApp`  
**Git user (commits):** `damirma`

---

## Stack Completo

### Frontend
| Tecnología | Versión | Rol |
|---|---|---|
| Angular | ^20.0.0 | Framework web principal |
| Ionic | ^8.0.0 | UI components + routing |
| Capacitor | 8.3.0 | Bridge nativo (Android/iOS) |
| TypeScript | ~5.9.0 | Lenguaje |
| RxJS | ~7.8.0 | Programación reactiva |
| ionicons | ^7.0.0 | Iconografía |
| ESLint + angular-eslint | ^20.0.0 | Linting |
| Karma + Jasmine | 6.4 / 5.1 | Testing |

**Build:** `@angular-devkit/build-angular:application` (esbuild). Output: `www/`.  
**Modo:** Standalone Components (Angular 14+, sin NgModules). Todos los componentes usan `standalone: true`.  
**Capacitor appId:** `com.smartbusiness.app`

### Backend (worker-ocr)
| Tecnología | Versión | Rol |
|---|---|---|
| Python | 3.11 | Runtime |
| Flask | 3.0.3 | HTTP server |
| flask-cors | 4.0.1 | CORS (sin restricciones) |
| google-generativeai | 0.8.3 | Gemini Vision API |
| supabase | 2.15.0 | Cliente Supabase |
| requests | 2.32.3 | HTTP cliente auxiliar |

**Modelo IA:** Groq — `llama-3.3-70b` (texto/PDF vía markitdown) + `meta-llama/llama-4-scout` (visión/imágenes). **Migrado de Gemini en Fase 0.**

### Infraestructura
| Componente | Detalle |
|---|---|
| Cloud | GCP VM `dam01` — e2-medium, Debian 12, `us-east1-b` |
| IP pública | `146.148.80.200` (**estática**, reservada en Fase 0) |
| Dominio | `smartbusinessdam.sytes.net` → `146.148.80.200` |
| Kubernetes | minikube single-node en la VM |
| Orquestación | n8n v2.15.0 en namespace `infraestructura` |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Container registry | Docker local en minikube (`worker-ocr:latest`) |
| Namespace K8s app | `pyme-test` |

---

## Estructura de Carpetas

```
SmartBusinessApp/
├── CLAUDE.md                    ← este archivo
├── README.md                    ← documentación técnica del proyecto
├── package.json                 ← dependencias npm
├── angular.json                 ← config Angular CLI (output: www/)
├── ionic.config.json            ← type: angular-standalone
├── capacitor.config.ts          ← appId, webDir, Camera plugin
├── tsconfig.json                ← strict, ES2022/ES2020
├── .eslintrc.json
├── .editorconfig
├── .browserslistrc
├── .gitignore                   ← excluye www/, dist/, node_modules/
│
├── src/
│   ├── main.ts                  ← bootstrap standalone con provideHttpClient()
│   ├── index.html
│   ├── global.scss
│   ├── polyfills.ts
│   ├── zone-flags.ts
│   ├── environments/
│   │   ├── environment.ts       ← production: false
│   │   └── environment.prod.ts  ← production: true
│   ├── theme/
│   │   └── variables.scss       ← variables CSS de Ionic
│   └── app/
│       ├── app.component.ts     ← root, solo <ion-app>+<ion-router-outlet>
│       ├── app.component.html
│       ├── app.component.scss
│       ├── app.routes.ts        ← todas las rutas (lazy-loaded)
│       │
│       ├── home/                ← dashboard de desarrollo
│       │   ├── home.page.ts
│       │   ├── home.page.html
│       │   └── home.page.scss
│       │
│       ├── pages/
│       │   ├── onboarding/      ← perfil de PyME (7 pasos)
│       │   ├── upload/          ← subida y procesamiento de facturas
│       │   ├── facturas/        ← lista con filtros
│       │   └── detalle/         ← vista completa + pago
│       │
│       ├── components/
│       │   └── sb-skeleton/     ← SbSkeletonComponent standalone (card/row/block + shimmer)
│       │
│       ├── utils/
│       │   └── agrupar-facturas.ts ← helper puro: agrupa/ordena facturas por mes o proveedor
│       │
│       └── services/
│           ├── factura.ts       ← HTTP client (worker-ocr + Supabase REST)
│           └── sesion-carga.service.ts ← signal del lote de facturas procesadas en el batch
│
├── worker-ocr/                  ← microservicio Python
│   ├── main.py                  ← Flask app, 334 líneas
│   ├── requirements.txt
│   └── Dockerfile               ← FROM python:3.11-slim, EXPOSE 8080
│
├── k8s/
│   └── worker-ocr.yaml          ← Deployment + ClusterIP Service
│
└── test_facturas/
    └── XML_BEC472892161.xml     ← factura real DIAN para pruebas (53KB)
```

---

## Ramas Git

| Rama | Propósito |
|---|---|
| `main` | Producción |
| `erik/desarrollo` | Trabajo activo de Erik (frontend + worker-ocr) |
| `samuel/desarrollo` | Trabajo de Samuel (remota) |
| `juanpablo/desarrollo` | Trabajo de Juan Pablo (remota) |

**Rama activa de trabajo:** `erik/desarrollo`

---

## Routing (app.routes.ts)

```typescript
'' → redirect → 'home'
'home'          → HomePage         (lazy)
'onboarding'    → OnboardingPage   (lazy)
'upload'        → UploadPage       (lazy)
'facturas'      → FacturasPage     (lazy)
'detalle/:id'   → DetallePage      (lazy)
```

---

## Páginas — Detalle

### `home/` — Dashboard de Desarrollo
Panel de estado del equipo y del proyecto. Muestra:
- Stat grid: OCR 75%, Storage 60%, Módulos activos, estado online
- Nav cards (ion-icons) a las páginas principales con badges de estado
- Infraestructura con status dots (verde/amarillo animados)
- Barras de progreso por capa: OCR, Storage, Analytics, App
- Equipo (Erik, Samuel, Juan Pablo) + footer con rama git

**Estado:** Rediseñado (2026-06-02) con DM Sans + Outfit + sistema visual nuevo. Es la pantalla inicial por defecto.

---

### `pages/onboarding/` — Perfil de PyME (7 pasos)
Cuestionario multi-step para configurar el perfil de extracción de la empresa. Usa un sistema de puntuación para clasificar el perfil.

**Pasos:**
1. ¿Qué compras? → Reventa / Insumos / Servicios / Activos / Mixto
2. ¿Cuánto detalle? → Solo totales / Cantidad+precios / Completo
3. ¿Retenciones? → Retefuente / ICA / ReteIVA / No sé / No aplica
4. ¿Para qué usas? → Control / Contabilidad / Impuestos / Auditoría
5. ¿Cómo recibes? → XML / PDF-texto / PDF-escaneado / Foto / WhatsApp / Mixto
6. ¿Qué priorizas si hay error? → Velocidad / Precisión / Híbrido
7. ¿Cuántos documentos/mes? → <10 / 10-30 / 30-100 / >100

**Perfiles calculados:** Auditable/Tributario · Servicios · Activos Fijos · Inventario/Comercio · Insumos/Producción · Mixto Adaptativo

**Persistencia:** `sessionStorage` (no Supabase todavía).

**Estado:** Implementado (UI + lógica de scoring). Pendiente: guardar perfil en tabla `perfil_extraccion` de Supabase.

---

### `pages/upload/` — Subida y Procesamiento
Interfaz principal de carga de facturas. Dos modos coexisten via `IonSegment`:

**Modo Individual:** archivo → Procesar → result card → navega a `/detalle/:id?from=lote`  
**Modo Masiva:** drag-and-drop multi-archivo, lista con progreso, máx 3 concurrentes.
- Al terminar ≥1 archivo: aparece card verde "Revisar N facturas" → `/facturas?lote=ids`
- Cada archivo completado: navega a `/detalle/:id?from=lote` al hacer click

**Formatos soportados:** XML, PDF, JPG, JPEG, PNG (ZIP excluido por ahora)

**Flujo de procesamiento:**
1. `FacturaService.procesarArchivo(file)` detecta formato por mime/extensión
2. XML → `procesarXML(texto)` — parse directo, sin IA
3. PDF/imagen → `procesarImagen(b64, mimeType)` — Groq (Llama Scout visión)
4. Resultado guardado en Supabase; `facturaId` extraído de `resultado.guardado?.factura_id`
5. `SesionCargaService.agregarALote(facturaId)` registra el ID en el lote actual

**Lote contextual:** `SesionCargaService` (signal) mantiene los IDs del batch actual.
Al iniciar un nuevo batch: `iniciarLote()`. Al navegar al detalle: `?from=lote` en queryParam.

**Estado:** Implementado y rediseñado. Requiere worker-ocr en `146.148.80.200:30080`.

---

### `pages/facturas/` — Lista de Facturas (reescrita en Fase 1.5)
Vista inteligente de facturas con agrupación, ordenamiento y filtros múltiples.

**Agrupación:** Por mes (default) | Por proveedor | Sin agrupar  
**Ordenamiento:** Más reciente | Más antiguo | Mayor monto | Menor monto  
**Filtros de estado:** Todos / Pendientes / Pagadas / Vencidas (chips)  
**Filtros de rango:** Todo / Este mes / Mes pasado / 90 días (chips secundarios)  
**Búsqueda:** Por número, proveedor, NIT (live, Signals)  
**Resumen reactivo:** card superior con total, pendientes, pagadas, vencidas y monto por pagar  
**Sticky headers** de grupo mientras scrolleas  
**Loading:** skeletons shimmer (no spinner)  
**Empty states:** diferenciados — sin data (CTA subir) vs. sin resultados (CTA limpiar filtros)

**Filtro de lote:** Si llega con `?lote=id1,id2,id3`, filtra solo esas facturas.
Muestra chip "Salir del lote" para volver a la vista completa.

**Arquitectura:** todo via Signals + computed (Angular 20). Helper puro `agrupar-facturas.ts`.

**Estado:** Reescrita en Fase 1.5. Fully functional.

---

### `pages/detalle/` — Detalle de Factura
Vista completa de una factura individual con gestión de pago.

**Secciones:** Banner de estado · Hero (número/proveedor/NIT) · Grid de datos · Tabla de ítems · Tabla de impuestos · Tarjeta de totales · Sección CUFE · Info de pago

**Acciones:**
- Marcar como pagada (modal: fecha + forma de pago)
- Desmarcar pago
- Compartir resumen (Web Share API / clipboard fallback)
- Copiar CUFE

**Formas de pago:** Transferencia / Efectivo / Cheque / Tarjeta / PSE

**Navegación contextual:** Lee queryParam `?from=lote`. Si viene de un lote (upload masiva),
el back-button navega a `/upload`. Si no, navega a `/facturas`.
Método `goBack()` centraliza la lógica.

**Loading:** Skeletons inline (banner + hero + grid + cards) en lugar de spinner.
`cargando` y `mostrarModalPago` como Signals.
Control flow moderno: `@if` / `@for` (Angular 17+).

**Estado:** Implementado y modernizado en Fase 1.5. Pendiente: edición de campos (B7).

---

## Servicio — `services/factura.ts`

Cliente HTTP que conecta con dos backends:

```typescript
// URLs leídas de environment.ts
workerUrl   = environment.workerUrl    // 'http://146.148.80.200:30080'
supabaseUrl = environment.supabaseUrl
supabaseKey = environment.supabaseKey
```

**Métodos:**
| Método | Descripción |
|---|---|
| `procesarXML(xmlContent)` | POST /procesar — parse XML DIAN |
| `procesarImagen(b64, mimeType)` | POST /procesar — OCR Groq (Llama Scout) |
| `procesarArchivo(file)` | Detecta formato + enruta a procesarXML/procesarImagen |
| `getFacturas(filtros?)` | SELECT * FROM facturas (con filtros opcionales) |
| `getFactura(id)` | SELECT factura + items + impuestos (JOIN) |
| `actualizarEstado(id, estado, fechaPago?)` | PATCH estado de pago |

**Retorna Observables** (no Promises). Usar `subscribe()` o `async pipe` en templates.

---

## Backend — `worker-ocr/main.py`

Flask app en puerto 8080. Configura CORS sin restricciones.

### Endpoints

```
GET  /health     → {"status":"ok","version":"3.0"}
POST /procesar   → {"ok":true,"guardado":{...},"data":{...}}
```

### Input /procesar
```json
// Opción A — XML
{"xml_content": "<Invoice>...</Invoice>"}

// Opción B — Imagen o PDF
{"imagen_b64": "<base64>", "mime_type": "image/jpeg"}
```

### Output /procesar
```json
{
  "fuente": "xml | imagen_gemini",
  "procesado_en": "ISO8601",
  "documento": {
    "numero", "tipo", "cufe", "fecha_emision", "hora_emision",
    "moneda", "observaciones",
    "autorizacion_dian": {"numero", "desde", "hasta", "prefijo", "fecha"},
    "url_verificacion"
  },
  "proveedor": {"nombre", "nit", "direccion", "email", "telefono"},
  "cliente":   {"nombre", "nit", "direccion", "email"},
  "pago":      {"forma", "fecha_vencimiento"},
  "items":     [{"numero_linea", "descripcion", "cantidad", "unidad", "valor_unitario", "valor_total"}],
  "impuestos": [{"nombre", "porcentaje", "base", "valor"}],
  "totales":   {"subtotal", "total_con_impuesto", "total_pagar"}
}
```

### Funciones internas clave
- `parse_xml(xml_content)` — Parser de XML DIAN. Soporta Invoice directo Y AttachedDocument (el Invoice real va en CDATA dentro de `cbc:Description` — hay que extraerlo antes de parsear).
- `parse_party(node)` — Extrae datos de parte (proveedor/cliente) desde nodo XML.
- `parse_imagen_groq(imagen_b64, mime_type, api_key)` — Llama Groq Llama 4 Scout (visión) con prompt en español, espera JSON puro. PDFs con texto nativo van por Llama 3 70B vía markitdown.
- `guardar_en_supabase(data)` — Inserta en 6 tablas en cascada: pymes → facturas → factura_items → factura_impuestos → autorizaciones_dian → procesamiento_log.

### Variables de entorno requeridas (K8s secret `worker-ocr-secret`)
```
GROQ_API_KEY       ← reemplaza GEMINI_API_KEY desde Fase 0
SUPABASE_URL
SUPABASE_KEY
```

---

## Infraestructura — Kubernetes (`k8s/worker-ocr.yaml`)

**Namespace:** `pyme-test`

**Deployment:**
- Réplicas: 1
- Imagen: `worker-ocr:latest` (construida localmente en minikube docker)
- Puerto contenedor: 8080
- Liveness probe: `GET /health` (initDelay 10s, period 15s)
- Readiness probe: `GET /health` (initDelay 5s, period 10s)
- Secrets montados como env vars desde `worker-ocr-secret`

**Service:**
- Tipo: ClusterIP (acceso interno)
- Puerto: 80 → 8080
- DNS interno: `worker-ocr-svc.pyme-test.svc.cluster.local`

**Acceso externo:** NodePort `30080` expuesto en la VM → `146.148.80.200:30080`

**n8n:** Namespace `infraestructura`. Actúa como thin orchestrator — la lógica pesada de OCR va en worker-ocr, n8n solo orquesta flujos.

---

## Base de Datos — Supabase

**URL:** `https://zsoynenfjwmeghsvguvg.supabase.co`  
**8 tablas documentadas:**

| Tabla | Descripción |
|---|---|
| `pymes` | Empresas registradas (NIT, nombre, plan) |
| `facturas` | Cabecera de facturas procesadas + raw_json |
| `factura_items` | Líneas de detalle de cada factura |
| `factura_impuestos` | Impuestos (IVA, ReteIVA, ICA, etc.) por factura |
| `autorizaciones_dian` | Número de resolución DIAN + rango |
| `procesamiento_log` | Log de cada procesamiento (éxito/error, fuente, duración) |
| `usuarios` | Usuarios de la plataforma |
| `perfil_extraccion` | Resultados del onboarding por PyME |

**RLS activado.** El frontend usa la anon key directamente (sin JWT de usuario). Pendiente: implementar autenticación y políticas RLS por usuario.

---

## Corpus de Prueba

**Ubicación en máquina local:** `C:\Users\Administrator\Desktop\Facturas`  
**Contenido:** 152 facturas reales colombianas. Cada carpeta contiene:
- Un archivo XML DIAN (AttachedDocument UBL 2.1)
- Un archivo PDF

**Estructura XML importante:** El XML de la DIAN envuelve la factura real en un `AttachedDocument`. El `Invoice` real está en CDATA dentro de `cbc:Description`. Hay que extraer el CDATA y parsear ese XML anidado, no el wrapper.

---

## Convenciones de Código

### Angular/Ionic
- **Siempre** archivos separados: `.ts` + `.html` + `.scss` (nunca inline template/styles)
- `standalone: true` en todos los componentes
- Lazy loading obligatorio en todas las rutas via `loadComponent()`
- Servicios retornan `Observable<T>`, nunca `Promise<T>`
- Formularios: Reactive Forms (no template-driven)
- `trackBy` en todos los `*ngFor` con listas
- Seguir patrón existente al generar páginas: `ng generate page pages/<nombre>`

### Python / worker-ocr
- Un solo archivo `main.py` (no fragmentar en módulos por ahora)
- Funciones de parse siempre retornan dict con las mismas keys aunque estén vacías (`""` o `[]`)
- Errores de Groq/IA: loguear y retornar `{"ok": false, "error": "..."}` — nunca lanzar excepción

### Git
- Rama de trabajo: `erik/desarrollo`
- Commits en español o inglés (el proyecto mezcla ambos idiomas)
- **PowerShell:** NO usar `&&` para encadenar comandos (usa `;` o comandos separados)

---

## PDFs — Conversión con markitdown

Para procesar PDFs antes de enviar a Gemini, usar **markitdown** de Microsoft:

```bash
pip install markitdown
```

```python
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("factura.pdf")
markdown_text = result.text_content
# Luego enviar markdown_text a Gemini como texto, no como imagen
```

Esto reduce tokens de Gemini y mejora la extracción en PDFs con texto nativo.

---

## Comandos de Desarrollo

```powershell
# Frontend
npm start              # ng serve → http://localhost:4200
npm run build          # build producción → www/
npm test               # Karma unit tests
npm run lint           # ESLint

# Nueva página Ionic
ng generate page pages/nombre-pagina

# Android (requiere Android Studio)
npx cap build android
npx cap open android

# worker-ocr local
cd worker-ocr
pip install -r requirements.txt
$env:GEMINI_API_KEY="..."
$env:SUPABASE_URL="..."
$env:SUPABASE_KEY="..."
python main.py         # escucha en :8080

# Docker (worker-ocr)
docker build -t worker-ocr:latest worker-ocr/
docker run -p 8080:8080 --env-file .env worker-ocr:latest

# Kubernetes (desde la VM dam01 con minikube)
kubectl apply -f k8s/worker-ocr.yaml -n pyme-test
kubectl get pods -n pyme-test
kubectl logs -n pyme-test deployment/worker-ocr
```

---

## Estado de Implementación

### Implementado ✅
- Home page (dashboard de desarrollo con IP dinámica desde environment.workerUrl)
- Onboarding completo (7 pasos, scoring, perfiles)
- Upload page (rediseño iPhone dark: back-button, segmento accent, radios 16-24px)
- Upload page: card "Revisar N facturas" → navega a lote en facturas.page
- Facturas page (reescrita Fase 1.5: agrupación/orden/filtros/skeletons/lote)
- Detalle page (navegación contextual, Signals, skeletons, @if/@for)
- Servicio `factura.ts` (HTTP client completo)
- Servicio `sesion-carga.service.ts` (signal del lote actual)
- Util `agrupar-facturas.ts` (helper puro: agrupa/ordena facturas)
- Componente `SbSkeletonComponent` (card/row/block, shimmer con sb-tokens)
- worker-ocr: parse XML DIAN (incluyendo AttachedDocument)
- worker-ocr: OCR con Groq (Llama 70B texto + Llama 4 Scout visión)
- worker-ocr: persistencia en Supabase (6 tablas en cascada)
- Dockerfile para worker-ocr
- K8s manifest (Deployment + Service)
- VM GCP provisionada con minikube + n8n

### En Progreso / Pendiente ⏳
- Onboarding page redesign (estilo iPhone dark, motion en transiciones de paso)
- Edición de campos extraídos en detalle.page (modo edit + PATCH Supabase) — B7
- Verificación comunicación n8n ↔ worker-ocr
- Primer workflow n8n configurado
- Integración completa Supabase (RLS por usuario)
- Guardar perfil de onboarding en tabla `perfil_extraccion`
- Autenticación de usuarios (Supabase Auth)
- Analíticas / dashboard (Capa 3) — 10% completado

### No comenzado ❌
- Módulo de analíticas / reportes
- Integración con sistemas contables (Siigo, World Office)
- Notificaciones push
- Modo offline / sync
- Tests E2E

---

## Sistema Visual (Design System)

**Plugin:** `frontend-design` (Claude Code plugin oficial) — referencia para todas las páginas.  
**Estética objetivo:** Linear / Vercel / Stripe / Raycast — dark theme profundo, un solo acento, tipografía con carácter.

### Tokens (`src/theme/tokens.scss`)
| Token | Valor | Uso |
|---|---|---|
| `--sb-accent` | `#2ECC71` | CTA, estados ok, accent |
| `--sb-bg-primary` | `#0A0A0F` | Fondo de página |
| `--sb-bg-card` | `#13131A` | Cards y superficies |
| `--sb-bg-input` | `#1C1C26` | Inputs, selects |
| `--sb-bg-overlay` | `#202030` | Modales, overlays |

### Tipografía (Google Fonts, importadas en `global.scss`)
| Variable | Fuente | Uso |
|---|---|---|
| `--sb-font-family` | `DM Sans` | Body / UI general |
| `--sb-font-family-display` | `Outfit` | Headings, títulos grandes |
| `--sb-font-family-mono` | `JetBrains Mono` | IDs, URLs, datos numéricos |

### Estado de páginas
| Página | Estado visual |
|---|---|
| `home` | ✅ Rediseñada (stat grid, nav cards, status dots, DM Sans/Outfit, IP dinámica) |
| `upload` | ✅ Rediseñada (back-button, segmento accent, radios 16-24px, card "Revisar lote") |
| `facturas` | ✅ Reescrita (agrupación/filtros/skeletons, resumen reactivo, lote contextual) |
| `detalle` | ✅ Modernizada (skeletons, @if/@for, Signals, back contextual) |
| `onboarding` | ⏳ Funcional pero sin rediseño iPhone dark — próxima sesión |

**Modelos de src/app/models/:**
- `factura.model.ts` — interfaces de BD (Factura, FacturaItem, etc.)
- `worker-ocr.model.ts` — RespuestaProcesar, ProcesamientoResultado, FiltrosFactura
- `archivo-en-proceso.model.ts` — ArchivoEnProceso (estado de cada archivo en carga masiva)

**Servicios de src/app/services/:**
- `factura.ts` — HTTP client (worker-ocr + Supabase REST)
- `sesion-carga.service.ts` — signal del lote actual (facturaIds del batch en curso)

**Utils de src/app/utils/:**
- `agrupar-facturas.ts` — helper puro sin deps Angular: agrupa, ordena, formatea subtítulos

**Componentes de src/app/components/:**
- `sb-skeleton/` — SbSkeletonComponent standalone (variantes card/row/block, shimmer sb-tokens)

---

## Notas de Seguridad ⚠️

**Deuda técnica conocida — no es un bug, es estado actual del proyecto académico:**

1. **Credenciales hardcodeadas** en `src/app/services/factura.ts`:
   - URL del worker: `http://34.45.194.133:30080`
   - Supabase URL y anon key expuestos en código fuente
   - Mover a `src/environments/environment.ts` cuando se estabilice la infra

2. **CORS sin restricciones** en worker-ocr (Flask-CORS sin `origins`)

3. **Sin autenticación** — el frontend llama directamente a Supabase con anon key sin token de usuario. Las políticas RLS están activas pero no hay login implementado.

4. La anon key de Supabase es pública por diseño (Supabase architecture), pero en producción debe combinarse con RLS por usuario autenticado.

---

## Arquitectura General

```
[App Ionic/Angular] ──────────────────────────────────┐
        │                                              │
        │ POST /procesar (XML o imagen_b64)            │ REST (anon key)
        ▼                                              ▼
[worker-ocr : Flask]                           [Supabase REST API]
  ├── parse_xml()                                ├── facturas
  ├── parse_imagen_gemini()                      ├── factura_items
  └── guardar_en_supabase()                      ├── factura_impuestos
        │                                        ├── pymes
        │ Gemini 1.5 Pro                         └── procesamiento_log
        ▼
  [Google AI API]

[n8n : namespace infraestructura]
  └── orquesta flujos → llama worker-ocr-svc internamente

[Kubernetes : minikube en GCP dam01]
  └── namespace pyme-test → Deployment worker-ocr + ClusterIP
```

---

*Generado por Claude Code el 2026-05-31. Actualizar cuando cambien la infraestructura, rutas, o tablas de BD.*
