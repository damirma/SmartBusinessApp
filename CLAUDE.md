# SmartBusinessApp — CLAUDE.md

Documento de contexto completo para Claude Code. Actualizado: 2026-06-03 (sesión 3).

---

## ¿Qué es este proyecto?

**SmartBusiness OCR Suite** es una plataforma SaaS de OCR/IDP (Intelligent Document Processing) para facturas electrónicas colombianas en formato DIAN. Su objetivo es ayudar a PyMEs a digitalizar, extraer y gestionar datos de facturas (XML UBL 2.1 y PDF/imagen) con procesamiento IA vía Groq.

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

### Backend (worker-ocr) — v5.0
| Tecnología | Versión | Rol |
|---|---|---|
| Python | 3.11 | Runtime |
| Flask | 3.0.3 | HTTP server |
| flask-cors | 4.0.1 | CORS (sin restricciones) |
| groq | latest | Groq API client |
| markitdown | latest | Conversión PDF→Markdown (PDFs con texto nativo) |
| supabase | 2.15.0 | Cliente Supabase |
| requests | 2.32.3 | HTTP cliente auxiliar |

**Modelos IA (Groq):**
- Texto/PDF nativo: `llama-3.3-70b-versatile` (vía markitdown → markdown → Groq)
- Visión/imágenes/PDF escaneado: `llama-4-scout-17b-16e-instruct` (multimodal)

**Migrado de Gemini en Fase 0. Secret K8s es `GROQ_API_KEY`, no `GEMINI_API_KEY`.**

### Infraestructura
| Componente | Detalle |
|---|---|
| Cloud | GCP VM `dam01` — e2-medium, Debian 12, `us-east1-b` |
| IP pública | `146.148.80.200` (**estática**, reservada como `smartbusiness-ip`) |
| Dominio principal | `damirsmartbuss.hopto.org` → `146.148.80.200` (HTTPS via Let's Encrypt) |
| Dominio alternativo | `smartbusinessdam.sytes.net` → `146.148.80.200` |
| HTTPS | Let's Encrypt en `damirsmartbuss.hopto.org` |
| Kubernetes | minikube single-node en la VM |
| Orquestación | n8n v2.15.0 en namespace `infraestructura` |
| Bot Telegram | @Konda_V1 — conectado via n8n (debugging en progreso) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Container registry | Docker local en minikube (`worker-ocr:latest`) |
| Namespace K8s app | `pyme-test` |

---

## Estructura de Carpetas

```
SmartBusinessApp/
├── CLAUDE.md                    ← este archivo
├── README.md                    ← documentación técnica del proyecto
├── ROADMAP.md                   ← roadmap del proyecto
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
│   ├── main.ts                  ← bootstrap standalone con provideHttpClient() + registerLocaleData(es-CO)
│   ├── index.html
│   ├── global.scss              ← DM Sans + Outfit + JetBrains Mono (Google Fonts)
│   ├── polyfills.ts
│   ├── zone-flags.ts
│   ├── environments/
│   │   ├── environment.ts       ← production: false, workerUrl, supabaseUrl, supabaseKey
│   │   └── environment.prod.ts  ← production: true
│   ├── theme/
│   │   ├── variables.scss       ← variables CSS de Ionic
│   │   └── tokens.scss          ← design tokens --sb-accent, --sb-bg-*, --sb-font-*
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
│       │   ├── onboarding/      ← perfil de PyME (7 pasos, guarda en Supabase)
│       │   ├── upload/          ← subida y procesamiento de facturas
│       │   ├── facturas/        ← lista con filtros, agrupación, badge Corregido
│       │   └── detalle/         ← vista completa + pago + edición 5 campos
│       │
│       ├── components/
│       │   └── sb-skeleton/     ← SbSkeletonComponent standalone (card/row/block + shimmer)
│       │
│       ├── models/
│       │   ├── factura.model.ts         ← interfaces BD (Factura, FacturaItem, etc.)
│       │   ├── worker-ocr.model.ts      ← RespuestaProcesar, ProcesamientoResultado, FiltrosFactura
│       │   ├── archivo-en-proceso.model.ts ← ArchivoEnProceso (estado carga masiva)
│       │   └── index.ts                 ← re-exports
│       │
│       ├── utils/
│       │   └── agrupar-facturas.ts ← helper puro: agrupa/ordena facturas por mes o proveedor
│       │
│       └── services/
│           ├── factura.ts       ← HTTP client (worker-ocr + Supabase REST)
│           └── sesion-carga.service.ts ← signal del lote de facturas procesadas en el batch
│
├── worker-ocr/                  ← microservicio Python v5.0
│   ├── main.py                  ← Flask app
│   ├── requirements.txt
│   └── Dockerfile               ← FROM python:3.11-slim, EXPOSE 8080
│
├── k8s/
│   └── worker-ocr.yaml          ← Deployment + ClusterIP Service
│
├── smartbusiness-core/          ← Claude Code skill personalizada
├── ionic-feature-builder/       ← Claude Code skill personalizada
├── tools/                       ← scripts de utilidad
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

**Estado:** ✅ Rediseñado con DM Sans + Outfit + sistema visual nuevo. IP dinámica desde `environment.workerUrl`.

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

**UI:** Barra de progreso segmentada (7 pills CSS), animaciones `slideInForward`/`slideInBack` entre pasos.

**Persistencia:** `finalizarOnboarding()` llama `FacturaService.guardarPerfil()` → POST a tabla `perfil_extraccion` en Supabase. Usa `pyme_id: 'default'` hasta que exista auth real.

**Estado:** ✅ Implementado y funcional. Pendiente: rediseño visual iPhone dark.

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

**Estado:** ✅ Implementado y rediseñado. Requiere worker-ocr en `146.148.80.200:30080`.

---

### `pages/facturas/` — Lista de Facturas
Vista inteligente de facturas con agrupación, ordenamiento y filtros múltiples.

**Agrupación:** Por mes (default) | Por proveedor | Sin agrupar  
**Ordenamiento:** Más reciente | Más antiguo | Mayor monto | Menor monto  
**Filtros de estado:** Todos / Pendientes / Pagadas / Vencidas (chips)  
**Filtros de rango:** Todo / Este mes / Mes pasado / 90 días (chips secundarios)  
**Búsqueda:** Por número, proveedor, NIT (live, Signals)  
**Resumen reactivo:** card superior con total, pendientes, pagadas, vencidas y monto por pagar  
**Sticky headers** de grupo mientras scrolleas  
**Badge "Corregido":** chip azul en card cuando `f.editado_por_usuario === true`  
**Loading:** skeletons shimmer (no spinner)  
**Empty states:** diferenciados — sin data (CTA subir) vs. sin resultados (CTA limpiar filtros)

**Filtro de lote:** Si llega con `?lote=id1,id2,id3`, filtra solo esas facturas.
Muestra chip "Salir del lote" para volver a la vista completa.

**Refresh:** `ionViewWillEnter` refresca la lista al volver de detalle (no solo `ngOnInit`).

**Arquitectura:** todo via Signals + computed (Angular 20). Helper puro `agrupar-facturas.ts`.

**Estado:** ✅ Reescrita. Fully functional.

---

### `pages/detalle/` — Detalle de Factura
Vista completa de una factura individual con gestión de pago y edición de campos.

**Secciones:** Banner de estado · Hero (número/proveedor/NIT) · Grid de datos · Tabla de ítems · Tabla de impuestos · Tarjeta de totales · Sección CUFE · Info de pago

**Acciones:**
- Marcar como pagada (modal: fecha + forma de pago)
- Desmarcar pago
- Compartir resumen (Web Share API / clipboard fallback con toast)
- Copiar CUFE
- Editar campos extraídos (botón lápiz en toolbar)

**Edición de campos (modo edición):**
- Activa `modoEdicion` signal con botón lápiz en toolbar
- Campos editables: `numero`, `proveedor_nombre`, `proveedor_nit`, `total_pagar`, `fecha_emision`
- Footer sticky con botones Cancelar / Guardar
- Al guardar: `FacturaService.actualizarCampos()` hace PATCH a Supabase con `editado_por_usuario: true`
- Badge azul "Corregido" aparece en el banner cuando `editado_por_usuario === true`
- Acciones (pagar / compartir) se ocultan durante la edición

**Formas de pago:** Transferencia / Efectivo / Cheque / Tarjeta / PSE

**Navegación contextual:** Lee queryParam `?from=lote`. Si viene de un lote (upload masiva),
el back-button navega a `/upload`. Si no, navega a `/facturas`.
Método `goBack()` centraliza la lógica.

**Loading:** Skeletons inline (banner + hero + grid + cards) en lugar de spinner.
`cargando` y `mostrarModalPago` como Signals.
Control flow moderno: `@if` / `@for` (Angular 17+).

**Estado:** ✅ Implementado, modernizado y con edición de campos completa.

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
| `actualizarCampos(id, campos)` | PATCH campos editables + setea `editado_por_usuario: true` |
| `guardarPerfil(pyme_id, perfil)` | POST a `perfil_extraccion` con `Prefer: return=minimal` |

**Retorna Observables** (no Promises). Usar `subscribe()` o `async pipe` en templates.

---

## Backend — `worker-ocr/main.py` (v5.0)

Flask app en puerto 8080. Configura CORS sin restricciones.

### Endpoints

```
GET  /health     → {"status":"ok","version":"5.0"}
POST /procesar   → {"ok":true,"guardado":{...},"data":{...}}
```

### Input /procesar
```json
// Opción A — XML
{"xml_content": "<Invoice>...</Invoice>"}

// Opción B — Imagen o PDF escaneado
{"imagen_b64": "<base64>", "mime_type": "image/jpeg"}
```

### Output /procesar
```json
{
  "fuente": "xml | imagen_groq",
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
- `parse_xml(xml_content)` — Parser XML DIAN. Soporta Invoice directo Y AttachedDocument (Invoice real en CDATA dentro de `cbc:Description`).
- `parse_party(node)` — Extrae datos de parte (proveedor/cliente) desde nodo XML.
- `parse_imagen_groq(imagen_b64, mime_type, api_key)` — Llama Groq `llama-4-scout-17b-16e-instruct` (visión) con prompt en español, espera JSON puro.
- `parse_pdf_texto(pdf_bytes, api_key)` — PDF con texto nativo: markitdown → markdown → Groq `llama-3.3-70b-versatile`.
- `guardar_en_supabase(data)` — Inserta en 6 tablas en cascada: pymes → facturas → factura_items → factura_impuestos → autorizaciones_dian → procesamiento_log.

### Variables de entorno requeridas (K8s secret `worker-ocr-secret`)
```
GROQ_API_KEY
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

**Acceso externo:** NodePort `30080` expuesto en la VM via socat (systemd service) → `146.148.80.200:30080`

**n8n:** Namespace `infraestructura`. Actúa como thin orchestrator — la lógica OCR va en worker-ocr, n8n orquesta flujos.

### Workflows n8n activos
| Workflow | Estado |
|---|---|
| Router Factura | Publicado |
| Bot Telegram Facturas | Publicado (debugging @Konda_V1) |

---

## Base de Datos — Supabase

**URL:** `https://zsoynenfjwmeghsvguvg.supabase.co`  
**8 tablas documentadas:**

| Tabla | Descripción |
|---|---|
| `pymes` | Empresas registradas (NIT, nombre, plan) |
| `facturas` | Cabecera de facturas + raw_json + `editado_por_usuario` boolean |
| `factura_items` | Líneas de detalle de cada factura |
| `factura_impuestos` | Impuestos (IVA, ReteIVA, ICA, etc.) por factura |
| `autorizaciones_dian` | Número de resolución DIAN + rango |
| `procesamiento_log` | Log de cada procesamiento (éxito/error, fuente, duración) |
| `usuarios` | Usuarios de la plataforma |
| `perfil_extraccion` | Resultados del onboarding por PyME |

**Notas de schema importantes:**
- La tabla `pagos` NO existe — el pago se guarda en `facturas.fecha_pago` y `facturas.forma_pago`
- Campo edición: `facturas.editado_por_usuario` (boolean)
- Campo `numero` en Supabase puede ser `numero_factura` — verificar antes de hacer PATCH

**RLS activado.** El frontend usa la anon key directamente (sin JWT de usuario). Pendiente: implementar autenticación y políticas RLS por usuario.

---

## Bot Telegram — @Konda_V1

Bot de Telegram conectado via n8n para consulta de facturas y notificaciones.

- **Handle:** @Konda_V1
- **Integración:** Workflow n8n "Bot Telegram Facturas" (publicado)
- **Estado:** Debugging en progreso (Fase 2)
- **Funcionalidad prevista:** Consultar facturas por número/proveedor, recibir alertas de vencimiento, enviar facturas para procesar

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
- `ionViewWillEnter` para refrescar datos al volver a una página (no solo `ngOnInit`)
- Locale: `registerLocaleData(localeEsCO)` + `LOCALE_ID: 'es-CO'` en `main.ts` (ya configurado)

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

Para PDFs con texto nativo, usar **markitdown** de Microsoft antes de enviar a Groq:

```bash
pip install markitdown
```

```python
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("factura.pdf")
markdown_text = result.text_content
# Enviar markdown_text a llama-3.3-70b-versatile como texto
```

Para PDFs escaneados o imágenes: enviar como base64 a `llama-4-scout-17b-16e-instruct` (visión).

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
$env:GROQ_API_KEY="..."
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

### Fase 1 — COMPLETA ✅

#### Frontend
- Home page (dashboard de desarrollo con IP dinámica desde environment.workerUrl)
- Onboarding completo (7 pasos, scoring, perfiles, barra segmentada, animaciones, guarda en Supabase)
- Upload page (individual + masiva, lote contextual, card "Revisar N facturas")
- Facturas page (agrupación/orden/filtros/skeletons/lote/badge Corregido, refresh ionViewWillEnter)
- Detalle page (navegación contextual, Signals, skeletons, @if/@for, edición 5 campos, badge Corregido)
- Servicio `factura.ts` (HTTP client completo: procesarXML/Imagen/Archivo, CRUD, actualizarCampos, guardarPerfil)
- Servicio `sesion-carga.service.ts` (signal del lote actual)
- Util `agrupar-facturas.ts` (helper puro: agrupa/ordena facturas)
- Componente `SbSkeletonComponent` (card/row/block, shimmer con sb-tokens)
- Locale `es-CO` configurado en `main.ts`

#### Backend / Infra
- worker-ocr v5.0: parse XML DIAN (incluyendo AttachedDocument)
- worker-ocr v5.0: OCR con Groq (`llama-3.3-70b-versatile` texto + `llama-4-scout-17b-16e-instruct` visión)
- worker-ocr v5.0: persistencia en Supabase (6 tablas en cascada)
- Dockerfile para worker-ocr
- K8s manifest (Deployment + Service)
- VM GCP provisionada con minikube + n8n
- IP estática `146.148.80.200` reservada como `smartbusiness-ip`
- HTTPS via Let's Encrypt en `damirsmartbuss.hopto.org`

### Fase 2 — EN PROGRESO ⏳

| Tarea | Estado |
|---|---|
| Bot Telegram @Konda_V1 | Debugging (workflow publicado, conectividad en revisión) |
| Workflow n8n Router Factura | Publicado |
| Analíticas / Dashboard financiero | Pendiente (0%) |
| Gráfico gastos por mes (últimos 6 meses) | Pendiente |
| Top 5 proveedores por monto | Pendiente |
| Resumen tributario (IVA, retenciones) | Pendiente |
| KPIs: promedio por factura, días de pago | Pendiente |

### Deuda técnica conocida
- Campo `numero` en Supabase podría ser `numero_factura` — verificar schema antes de PATCH
- `guardarPerfil` usa `pyme_id: 'default'` hasta que exista auth real
- RLS en `perfil_extraccion` puede bloquear INSERT con anon key — verificar
- Onboarding: rediseño visual iPhone dark pendiente

### No comenzado ❌
- Autenticación de usuarios (Supabase Auth)
- Integración con sistemas contables (Siigo, World Office)
- Notificaciones push
- Modo offline / sync
- Tests E2E

---

## Sistema Visual (Design System)

**Skill:** `ionic-design-system` — referencia para todas las páginas.  
**Plugin:** `frontend-design` (Claude Code plugin oficial) — generación de UI de alta calidad.  
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

### Estado visual de páginas
| Página | Estado visual |
|---|---|
| `home` | ✅ Rediseñada (stat grid, nav cards, status dots, DM Sans/Outfit, IP dinámica) |
| `upload` | ✅ Rediseñada (back-button, segmento accent, radios 16-24px, card "Revisar lote") |
| `facturas` | ✅ Reescrita (agrupación/filtros/skeletons, resumen reactivo, lote contextual, badge Corregido) |
| `detalle` | ✅ Modernizada (skeletons, @if/@for, Signals, back contextual, edición campos, badge Corregido) |
| `onboarding` | ⏳ Funcional (barra segmentada, animaciones) pero sin rediseño visual iPhone dark |

---

## Claude Code — Skills y Herramientas

| Skill | Activar cuando... |
|---|---|
| `ionic-design-system` | Diseñas/rediseñas pantallas, defines tokens, construyes componentes |
| `dian-xml-parser` | Trabajas con XML DIAN UBL 2.1, parseo AttachedDocument, namespaces |
| `pdf-processing-pipeline` | Procesas PDFs de facturas, decides texto nativo vs escaneado |
| `batch-document-processing` | Benchmark corpus 152 facturas, métricas XML vs PDF |
| `frontend-design` | Construyes componentes web de alta calidad visual |
| `ionic-feature-builder` | Skill personalizada del proyecto (en `ionic-feature-builder/`) |
| `smartbusiness-core` | Skill personalizada del proyecto (en `smartbusiness-core/`) |

---

## Notas de Seguridad ⚠️

**Deuda técnica conocida — no es un bug, es estado actual del proyecto académico:**

1. **Credenciales en environment.ts** — URL del worker, Supabase URL y anon key en código fuente. Aceptable para desarrollo académico.

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
[worker-ocr v5.0 : Flask]                      [Supabase REST API]
  ├── parse_xml()                                ├── facturas
  ├── parse_pdf_texto() → markitdown             ├── factura_items
  ├── parse_imagen_groq()                        ├── factura_impuestos
  └── guardar_en_supabase()                      ├── pymes
        │                                        └── procesamiento_log
        │ Groq API
        ├── llama-3.3-70b-versatile    (texto/PDF nativo)
        └── llama-4-scout-17b-16e-instruct (visión/PDF escaneado)

[n8n : namespace infraestructura]
  ├── Workflow: Router Factura (publicado)
  ├── Workflow: Bot Telegram Facturas (publicado, debugging)
  └── orquesta flujos → llama worker-ocr-svc internamente

[Bot Telegram @Konda_V1]
  └── conectado via n8n → consulta Supabase / llama worker-ocr

[Kubernetes : minikube en GCP dam01]
  ├── namespace pyme-test → Deployment worker-ocr + ClusterIP
  └── IP estática 146.148.80.200 + HTTPS damirsmartbuss.hopto.org
```

---

*Actualizado por Claude Code el 2026-06-03. Actualizar cuando cambien la infraestructura, rutas, o tablas de BD.*
