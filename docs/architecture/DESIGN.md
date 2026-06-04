# SmartBusiness OCR Suite — Documento de Diseño Arquitectónico

> **Estado:** Borrador 1.0 — diseño previo a implementación.
> **Autor:** Erik Gil Suárez · **Fecha:** 2026-06-04
> **Repositorio:** `github.com/damirma/SmartBusinessApp` · **Ubicación sugerida:** `docs/architecture/DESIGN.md`

---

## 0. Propósito de este documento

Este documento define **cómo se construye** el backend de SmartBusiness OCR Suite antes de escribir código de producción. Es el contrato del equipo: si una decisión técnica futura contradice este documento, primero se actualiza el documento, después se cambia el código. Está dirigido al equipo (Erik, Samuel, Juan Pablo) y a la profesora Sandra Johana Guerrero Gómez como entregable académico de arquitectura.

El documento no contiene código de producción. Sí contiene contratos, interfaces, esquemas y pseudo-código abstracto para fijar las decisiones.

---

## 1. Contexto del problema

SmartBusiness OCR Suite procesa facturas electrónicas colombianas (XML UBL 2.1 de la DIAN, PDF nativo y PDF escaneado) para PyMEs. Hoy existe:

- Un script de benchmark (`benchmark_corpus.py`) que probó la viabilidad técnica sobre 152 facturas reales.
- Un servicio `worker-ocr` v5.0 (Flask) en Kubernetes (minikube en GCP) que procesa facturas y persiste en Supabase.
- Un bot de Telegram orquestado por n8n.
- Una app Ionic/Angular para usuarios.

El sistema actual **funciona como prueba de concepto pero no es escalable** a múltiples PyMEs por las siguientes razones:

1. La lógica de negocio (parseo, LLM, scoring, persistencia, HTTP) está mezclada en archivos monolíticos.
2. Flask es síncrono — un PDF de 17 segundos bloquea un worker entero.
3. No existe contexto explícito de tenant (`pyme_id`) que viaje por todo el sistema.
4. La extensibilidad a otros ERPs (Siigo, Alegra) requeriría reescribir la lógica de persistencia.
5. n8n orquesta lógica de negocio que debería vivir en el dominio.

Este documento define el rediseño que resuelve esos cinco problemas sin descartar la infraestructura ya invertida (Kubernetes, n8n, Supabase, dominio No-IP).

---

## 2. Principios fundacionales (ADRs base)

Estos ocho principios mandan sobre todas las decisiones técnicas. Una decisión que los contradiga se rechaza por defecto.

### P1 — Arquitectura hexagonal por defecto

El núcleo de dominio (parsers, scoring, llamada a LLM) no conoce HTTP, no conoce Supabase, no conoce Telegram. Habla con el mundo a través de **puertos** (interfaces abstractas) y el mundo se conecta vía **adaptadores** concretos. Justificación: permite cambiar Groq por OpenAI, Supabase por otra base, o agregar Siigo, sin reescribir el núcleo.

### P2 — Multi-tenancy explícita en cada capa

Todo dato, log, request, job y métrica lleva `pyme_id` como ciudadano de primera clase. El `pyme_id` viaja en un objeto `TenantContext` desde la primera capa hasta la última. No se "deduce" en una capa y se "asume" en otra. Justificación: previene fugas cruzadas entre PyMEs y simplifica auditoría.

### P3 — Stateless services, stateful storage

Los servicios (API, workers) no guardan estado que sobreviva al pod. Todo el estado vive en Supabase o Redis. Justificación: permite escalar horizontalmente con HPA de Kubernetes sin coordinación entre réplicas.

### P4 — Async-first para todo lo que tarde más de un segundo

OCR de PDF, lotes y llamadas a LLM con visión son asincrónicos. Solo lo verdaderamente rápido (parseo XML local, queries SQL puntuales) responde síncrono. Justificación: Telegram, frontend y otros clientes no se cuelgan; el sistema escala por cola, no por capacidad sincrónica.

### P5 — Los LLMs nunca tocan datos directamente

El LLM clasifica intención y redacta respuestas. Las consultas y mutaciones SQL las arma código determinista con `pyme_id` validado. Justificación: previene alucinaciones que generen UPDATE/DELETE erróneos, mitiga inyección de prompts y elimina cualquier ruta de fuga de datos cruzados.

### P6 — Idempotencia en escrituras

Cada factura usa `cufe` (único por DIAN) como clave de deduplicación. Cada job tiene `job_id` único. Cada actualización de Telegram usa `update_id` como deduplicador. Justificación: reintentos automáticos no corrompen los datos.

### P7 — Observabilidad como ciudadano de primera clase

Logs estructurados JSON con `pyme_id`, `trace_id`, `job_id` en cada línea. Métricas Prometheus exportables desde el día uno (aunque no se monitoree todavía). Justificación: cuando una PyME reporte "mi factura no entró", se diagnostica en minutos, no en horas.

### P8 — Contratos antes que código

Las interfaces entre capas se definen primero (Pydantic models, OpenAPI specs, ABC interfaces), se acuerdan con el equipo, y solo después se implementan. Justificación: alinea al equipo y minimiza refactor por malentendidos.

---

## 3. Modelo de dominio

### 3.1 Entidades principales

| Entidad | Descripción | Identificador único |
|---|---|---|
| **PyME** | Empresa cliente del sistema | `id` (UUID), `nit` |
| **Usuario** | Persona con acceso a una PyME | `id` (UUID) |
| **CanalVinculado** | Forma en que un usuario se conecta (Telegram, web, email) | `id` (UUID), `(tipo, identificador_externo)` |
| **PerfilExtraccion** | Configuración de cómo extraer datos para esta PyME | `pyme_id` (PK) |
| **Factura** | Documento procesado | `id` (UUID), `cufe` |
| **Item** | Línea de detalle de una factura | `id` (UUID) |
| **Impuesto** | IVA, retenciones, etc. de una factura | `id` (UUID) |
| **JobProcesamiento** | Tarea async de procesar un documento | `id` (UUID) |
| **ConectorERP** | Integración configurada con un ERP externo | `id` (UUID) |
| **Comando** | Acción solicitada que requiere confirmación | `id` (UUID) |
| **PlanSuscripcion** | Plan freemium activo de una PyME | `id` (UUID) |

### 3.2 Relaciones clave

- `PyME 1:N Usuario` — una empresa tiene varios usuarios.
- `Usuario 1:N CanalVinculado` — un usuario se conecta por Telegram, web, etc.
- `PyME 1:1 PerfilExtraccion` — la configuración es de la empresa.
- `PyME 1:N Factura` — todas las facturas pertenecen a una PyME.
- `Factura 1:N Item, Impuesto` — composición.
- `Factura M:N ConectorERP` — una factura puede sincronizarse a varios ERPs.
- `Comando 0..1:1 Factura` — un comando puede afectar a una factura específica.

### 3.3 Estados clave

**Factura.estado** — máquina de estados:
`pendiente → procesando → procesada → [confirmada | corregida | rechazada] → pagada`

**JobProcesamiento.estado**:
`encolado → en_proceso → [completado | fallido] → [reintentando]`

**Comando.estado_confirmacion**:
`pending_confirm → [confirmado → ejecutado | rechazado | expirado]`

---

## 4. Bounded contexts (contextos delimitados)

El sistema se divide en cuatro contextos con responsabilidades estrictas y contratos claros entre ellos.

### 4.1 Identity Context

**Responsabilidad:** custodiar quién es el usuario, a qué PyME pertenece, qué puede hacer y cuánta cuota le queda.

**Entidades:** PyME, Usuario, CanalVinculado, PlanSuscripcion.

**Output principal:** un objeto `TenantContext` que viaja con cada request:

```python
class TenantContext:
    pyme_id: UUID
    usuario_id: UUID
    plan: Literal["FREE", "PYME", "ENTERPRISE"]
    cuota_restante: int
    canales_activos: list[str]
    roles: list[str]
```

**Quien NO modifica estas entidades directamente:** ningún otro contexto. Todos consumen `TenantContext` ya validado.

### 4.2 Document Processing Context

**Responsabilidad:** transformar un documento (XML, PDF, imagen) en una `Factura` estructurada y persistirla.

**Entidades:** Factura, Item, Impuesto, JobProcesamiento, PerfilExtraccion.

**Aquí vive la librería `smartbusiness-ocr-core`** como núcleo puro, con adaptadores HTTP encima.

**Contrato principal:**

```python
# Entrada
class ProcesarDocumentoCommand:
    bytes_documento: bytes
    tipo: Literal["xml", "pdf_nativo", "pdf_escaneado", "imagen"]
    tenant: TenantContext

# Salida síncrona (XML rápido)
class ProcesarResultado:
    factura: Factura
    metricas: MetricasProcesamiento

# Salida asíncrona (PDF/imagen)
class JobEncolado:
    job_id: UUID
    estado: str
    estimado_segundos: int
```

### 4.3 Conversation Context

**Responsabilidad:** entender mensajes en lenguaje natural, clasificar intención, ejecutar consultas validadas contra el Document Context, redactar respuestas humanas, y manejar el ciclo de confirmación de comandos.

**Entidades:** Comando, Intención, Mensaje, Confirmación.

**Flujo canónico (siguiendo P5):**

1. Recibir `(canal, identificador_externo, texto)`.
2. Resolver `TenantContext` consultando Identity Context.
3. Clasificar intención con LLM (`consulta` | `comando` | `reporte` | `desconocida`).
4. Si es consulta: armar query SQL determinista contra Document Context, recibir datos, pasar al LLM como contexto, redactar respuesta.
5. Si es comando: persistir como `Comando(estado=pending_confirm)`, pedir confirmación al usuario.
6. Cuando llegue confirmación: ejecutar comando contra Document Context, actualizar estado.

### 4.4 Integration Context

**Responsabilidad:** comunicación con sistemas externos (Telegram, Siigo, Alegra, Google Sheets, email, n8n).

**Entidades:** ConectorERP, MapeoCampos, EventoSincronizacion, CredencialCifrada.

**Aquí vive n8n** como un adaptador más, ejecutando flujos hacia/desde sistemas externos pero sin lógica de negocio.

---

## 5. Estrategia multi-tenant

### 5.1 Tres capas de aislamiento

**Capa A — Aislamiento de datos** (Postgres Row-Level Security)

Cada query a Supabase establece `app.pyme_id` en la sesión. Las políticas RLS filtran automáticamente:

```sql
CREATE POLICY pyme_aislada ON facturas
  FOR ALL TO authenticated
  USING (pyme_id = current_setting('app.pyme_id')::uuid);
```

Aunque un bug en código olvide el `WHERE pyme_id =`, Postgres no devuelve filas de otras PyMEs. Defensa en profundidad.

**Capa B — Aislamiento de cómputo** (cola con prioridades)

Una cola Redis por tipo de trabajo (`facturas-rapidas`, `facturas-pesadas`), con prioridad en el mensaje:

```python
priority = {"ENTERPRISE": 0, "PYME": 5, "FREE": 9}[tenant.plan]
await queue.enqueue("procesar_factura", job_data, _priority=priority)
```

Los workers escalan con HorizontalPodAutoscaler según longitud de cola. Una PyME FREE no puede bloquear a una Enterprise.

**Capa C — Aislamiento de cuotas** (rate limiting + plan limits)

Por cada request entrante, el Identity Context decrementa un contador atómico en Redis. Si llega a cero antes del fin de mes, el API responde `402 Payment Required`.

### 5.2 Multi-namespace en Kubernetes (futuro)

PyMEs Enterprise grandes obtienen su propio namespace con workers dedicados. PyMEs FREE/PYME comparten namespace pool. Esto se decide por costo, no por seguridad (el aislamiento de datos ya es por RLS).

---

## 6. Arquitectura de extensibilidad (puertos y adaptadores)

### 6.1 Los tres puertos críticos

**LLMPort** — abstrae el proveedor de LLM.

```python
class LLMPort(ABC):
    @abstractmethod
    async def completion_texto(self, prompt: str, **kwargs) -> LLMResult: ...
    @abstractmethod
    async def completion_vision(self, prompt: str, imagen_bytes: bytes, mime: str) -> LLMResult: ...
    @property
    @abstractmethod
    def model_name(self) -> str: ...
    @property
    @abstractmethod
    def cost_per_token(self) -> Decimal: ...
```

Adaptadores: `GroqAdapter`, `OpenAIAdapter`, `GeminiAdapter`, `MockAdapter` (para tests).

**ConnectorPort** — abstrae los ERPs externos.

```python
class ConnectorPort(ABC):
    @abstractmethod
    async def push_factura(self, factura: Factura, ctx: TenantContext) -> SyncResult: ...
    @abstractmethod
    async def pull_facturas(self, desde: date, ctx: TenantContext) -> list[Factura]: ...
    @abstractmethod
    async def validar_credenciales(self, creds: dict) -> bool: ...
    @property
    @abstractmethod
    def capabilities(self) -> ConnectorCapabilities: ...
```

Adaptadores: `SupabaseConnector` (siempre activo), `SiigoConnector`, `AlegraConnector`, `SheetsConnector`, `WorldOfficeConnector`.

**ChannelPort** — abstrae los canales de comunicación con el usuario.

```python
class ChannelPort(ABC):
    @abstractmethod
    async def enviar_mensaje(self, identificador: str, mensaje: str, ctx: TenantContext) -> None: ...
    @abstractmethod
    async def confirmar_comando(self, identificador: str, comando: Comando) -> bool: ...
    @property
    @abstractmethod
    def tipo(self) -> str: ...
```

Adaptadores: `TelegramAdapter`, `WhatsAppAdapter`, `WebAdapter`, `EmailAdapter`.

### 6.2 Registry pattern

Cada PyME tiene N conectores activos. Un `ConnectorRegistry` los carga al inicio del request:

```python
class ConnectorRegistry:
    def get_active_connectors(self, pyme_id: UUID) -> list[ConnectorPort]: ...
    def register(self, connector_cls: type[ConnectorPort]) -> None: ...
```

Cuando llega una factura procesada: `for c in registry.get_active_connectors(pyme_id): await c.push_factura(factura, ctx)`. Agregar Alegra mañana: implementar `AlegraConnector`, registrar, INSERT en tabla `conectores_disponibles`.

---

## 7. Contratos de API (selección)

API construida con **FastAPI**. Documentación OpenAPI auto-generada en `/docs`. Autenticación con JWT firmado.

### 7.1 Endpoints de facturas

```
POST   /v1/facturas/procesar          → procesar XML (síncrono, <2s)
POST   /v1/facturas/procesar-async    → procesar PDF/imagen (encola, 202)
GET    /v1/facturas                   → listar con filtros
GET    /v1/facturas/{id}              → detalle
PATCH  /v1/facturas/{id}              → editar campos
DELETE /v1/facturas/{id}              → eliminar (soft delete)
```

### 7.2 Endpoints de jobs

```
GET    /v1/jobs/{id}                  → estado, progreso, resultado si listo
GET    /v1/jobs?estado=en_proceso     → listar jobs activos del tenant
WS     /v1/jobs/{id}/stream           → progreso en tiempo real
```

### 7.3 Endpoints de conversación (Telegram interno)

```
POST   /v1/conversacion/mensaje       → procesar mensaje entrante (cualquier canal)
POST   /v1/conversacion/confirmar     → confirmar/rechazar comando pendiente
```

### 7.4 Endpoints de conectores

```
GET    /v1/conectores/disponibles     → catálogo (siigo, alegra, sheets…)
GET    /v1/conectores/activos         → los habilitados por esta PyME
POST   /v1/conectores                 → habilitar uno nuevo (con credenciales)
PATCH  /v1/conectores/{id}            → actualizar credenciales o config
DELETE /v1/conectores/{id}            → desactivar
POST   /v1/conectores/{id}/test       → validar credenciales sin guardar
```

### 7.5 Patrón de respuesta async

```json
// POST /v1/facturas/procesar-async → 202 Accepted
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "estado": "encolado",
  "estimado_segundos": 15,
  "polling_url": "/v1/jobs/550e8400-e29b-41d4-a716-446655440000",
  "stream_url": "wss://api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/stream"
}
```

---

## 8. Esquema de Supabase reescrito

> Nota: esto reemplaza/extiende el esquema actual. Migración detallada se planifica en fase B.

### 8.1 Tabla `pymes`

```sql
CREATE TABLE pymes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nit VARCHAR(15) UNIQUE NOT NULL,
  razon_social TEXT NOT NULL,
  plan VARCHAR(20) NOT NULL DEFAULT 'FREE',
  cuota_facturas_mensual INTEGER NOT NULL DEFAULT 50,
  fecha_inicio_plan DATE NOT NULL DEFAULT CURRENT_DATE,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 Tabla `usuarios`

```sql
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pyme_id UUID NOT NULL REFERENCES pymes(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'usuario',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usuarios_pyme ON usuarios(pyme_id);
```

### 8.3 Tabla `canales_vinculados`

```sql
CREATE TABLE canales_vinculados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  identificador_externo TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tipo, identificador_externo)
);
CREATE INDEX idx_canales_lookup ON canales_vinculados(tipo, identificador_externo) WHERE activo;
```

### 8.4 Tabla `facturas`

```sql
CREATE TABLE facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pyme_id UUID NOT NULL REFERENCES pymes(id) ON DELETE CASCADE,
  cufe TEXT NOT NULL,
  numero VARCHAR(50),
  tipo VARCHAR(20),
  fecha_emision DATE,
  proveedor_nit VARCHAR(15),
  proveedor_nombre TEXT,
  cliente_nit VARCHAR(15),
  total NUMERIC(15,2),
  subtotal NUMERIC(15,2),
  moneda VARCHAR(3) DEFAULT 'COP',
  estado VARCHAR(20) NOT NULL DEFAULT 'procesada',
  fuente VARCHAR(20) NOT NULL,
  datos_raw JSONB,
  procesado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pyme_id, cufe)
);
CREATE INDEX idx_facturas_pyme_fecha ON facturas(pyme_id, fecha_emision DESC);
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pyme_aislada ON facturas FOR ALL TO authenticated
  USING (pyme_id = current_setting('app.pyme_id', true)::uuid);
```

### 8.5 Tabla `jobs_procesamiento`

```sql
CREATE TABLE jobs_procesamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pyme_id UUID NOT NULL REFERENCES pymes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'encolado',
  reintentos INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  resultado JSONB,
  error TEXT,
  encolado_en TIMESTAMPTZ DEFAULT NOW(),
  iniciado_en TIMESTAMPTZ,
  completado_en TIMESTAMPTZ
);
CREATE INDEX idx_jobs_pyme_estado ON jobs_procesamiento(pyme_id, estado);
```

### 8.6 Tabla `comandos`

```sql
CREATE TABLE comandos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pyme_id UUID NOT NULL REFERENCES pymes(id) ON DELETE CASCADE,
  intencion VARCHAR(50) NOT NULL,
  estado_confirmacion VARCHAR(20) NOT NULL DEFAULT 'pending_confirm',
  payload JSONB NOT NULL,
  factura_afectada_id UUID REFERENCES facturas(id),
  expira_en TIMESTAMPTZ NOT NULL,
  ejecutado_en TIMESTAMPTZ,
  resultado_ejecucion JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comandos_pendientes ON comandos(usuario_id, estado_confirmacion) WHERE estado_confirmacion = 'pending_confirm';
```

### 8.7 Tabla `conectores_erp`

```sql
CREATE TABLE conectores_erp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pyme_id UUID NOT NULL REFERENCES pymes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  credenciales_cifradas BYTEA NOT NULL,
  config JSONB DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  ultima_sincronizacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pyme_id, tipo)
);
ALTER TABLE conectores_erp ENABLE ROW LEVEL SECURITY;
```

---

## 9. Estructura de repositorios propuesta

```
github.com/damirma/
├── smartbusiness-ocr-core/        # librería Python pura (paquete pip)
│   ├── src/sbocr/
│   │   ├── parsers/
│   │   ├── llm/
│   │   ├── scoring/
│   │   ├── models/
│   │   └── ports/
│   ├── tests/
│   └── pyproject.toml
│
├── smartbusiness-api/             # FastAPI gateway + workers
│   ├── src/sbapi/
│   │   ├── identity/              # Identity Context
│   │   ├── documents/             # Document Processing Context
│   │   ├── conversation/          # Conversation Context
│   │   ├── integrations/          # Integration Context (adaptadores)
│   │   ├── shared/
│   │   └── main.py                # FastAPI entrypoint
│   ├── workers/
│   │   └── async_worker.py        # ARQ workers
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml             # depende de smartbusiness-ocr-core
│
├── smartbusiness-infra/           # K8s manifests, scripts, n8n flows
│   ├── k8s/
│   ├── n8n-workflows/
│   └── scripts/
│
└── SmartBusinessApp/              # frontend Ionic (existente)
```

---

## 10. Estrategia de testing por capa

| Capa | Tipo de test | Herramienta | Cobertura objetivo |
|---|---|---|---|
| `smartbusiness-ocr-core` | Unit + integration con LLM mock | pytest | 85%+ |
| `smartbusiness-api` (Identity, Document, Conversation, Integration) | Unit por contexto | pytest + httpx | 75%+ |
| API endpoints | E2E con TestContainers (Postgres, Redis) | pytest | rutas críticas |
| Workers async | Integration con cola simulada | pytest-asyncio | 70%+ |
| Frontend | Componentes Ionic | Karma+Jasmine | mantenido |

**Corpus de evaluación reusable:** las 152 facturas reales del benchmark se vuelven un set de regresión. Cada PR contra `smartbusiness-ocr-core` corre el benchmark y compara métricas. Si la exactitud baja, no merge.

---

## 11. Plan de evolución (sin fechas, con dependencias)

### Fase A — Extracción de la librería
**Prerrequisito:** documento de diseño aprobado.
**Entrega:** `smartbusiness-ocr-core` v0.1 en PyPI privado o git.
**Sin cambios para frontend ni infra.**

### Fase B — API Gateway con FastAPI
**Prerrequisito:** Fase A completa.
**Entrega:** `smartbusiness-api` reemplaza al `worker-ocr` Flask. Mismas URLs públicas, mejor estructura interna.

### Fase C — Cola async (Redis + ARQ)
**Prerrequisito:** Fase B completa.
**Entrega:** PDFs e imágenes pasan a flujo async con jobs y polling/streaming.

### Fase D — Migración del Conversation Context
**Prerrequisito:** Fase B completa (no depende de C).
**Entrega:** lógica de Telegram sale de n8n y vive en `smartbusiness-api`. n8n queda como proxy puro.

### Fase E — Multi-conector con puertos
**Prerrequisito:** Fase B completa.
**Entrega:** primer conector adicional implementado (Google Sheets recomendado por simplicidad), arquitectura validada para Siigo posteriormente.

### Fase F — Auth real con Supabase Auth
**Prerrequisito:** Fase B completa.
**Entrega:** login real en frontend, JWT firmado, RLS activado por usuario.

### Fase G — Multi-namespace en K8s
**Prerrequisito:** todas las anteriores.
**Entrega:** primera PyME Enterprise en namespace dedicado.

---

## 12. Observabilidad — qué se instrumenta desde el día uno

**Logs estructurados** con `structlog`. Cada línea JSON con:
- `timestamp`, `level`, `message`
- `pyme_id`, `usuario_id`, `trace_id` (cuando aplique)
- `job_id`, `factura_id`, `comando_id` (según contexto)
- `latency_ms`, `tokens_in`, `tokens_out` (en llamadas LLM)

**Métricas Prometheus** expuestas en `/metrics`:
- `sbapi_requests_total{endpoint, status, pyme_plan}`
- `sbapi_request_duration_seconds{endpoint, pyme_plan}`
- `sbapi_llm_tokens_total{model, tipo}`
- `sbapi_llm_cost_usd_total{model, pyme_id}` — para facturación interna
- `sbapi_queue_depth{queue}`
- `sbapi_factura_extraccion_score{campo}` — calidad por campo

**Tracing** con OpenTelemetry (Fase tardía). Trace_id propagado en headers HTTP y en mensajes de cola.

---

## 13. Seguridad

### 13.1 Manejo de secretos
- **Nunca en código**, ni en `environment.ts` ni en variables hardcoded.
- Kubernetes Secrets para credenciales de Groq, Supabase service role, JWT signing key.
- Credenciales de conectores ERP cifradas en BD con clave maestra en K8s Secret (rotación manual por ahora, automática en futuro).

### 13.2 Autenticación
- JWT firmado HS256 (o RS256 cuando se tenga key management).
- Refresh tokens con rotación.
- Tokens de Telegram bot: identificador externo en `canales_vinculados`, no se confía hasta validar pertenencia a una PyME.

### 13.3 Autorización
- RLS de Postgres como defensa en profundidad.
- Decoradores `@requires_role("admin")` en endpoints sensibles.
- Validación en cada capa del `TenantContext.pyme_id` contra los recursos solicitados.

### 13.4 LLMs y datos
- Prompts y respuestas se loguean SIN incluir contenido completo de facturas (privacidad).
- Solo se loguean: tokens consumidos, latencia, intención detectada, modelo usado.
- Cuando se redacte respuesta conversacional, los datos reales se pasan al LLM dentro del prompt pero no se persisten en logs.

---

## 14. Decisiones técnicas (ADRs cortos)

### ADR-001 — FastAPI sobre Flask
**Decisión:** migrar de Flask a FastAPI.
**Razón:** async nativo, validación Pydantic gratis, OpenAPI auto-generado, WebSocket nativo.
**Trade-off:** curva de aprendizaje menor para el equipo; mejor experiencia de desarrollo.

### ADR-002 — ARQ sobre Celery
**Decisión:** ARQ como cola async.
**Razón:** async nativo, configuración mínima, suficiente para nuestra escala (decenas de PyMEs).
**Trade-off:** Celery es más maduro pero más complejo. Reevaluar en >100 PyMEs.

### ADR-003 — Una sola imagen Docker, dos entrypoints
**Decisión:** API y workers comparten imagen, diferentes `command:` en K8s.
**Razón:** simplifica deploys (una sola build), garantiza versión consistente del código entre API y workers.
**Trade-off:** imagen ligeramente más grande; aceptable.

### ADR-004 — Mantener n8n como adaptador
**Decisión:** n8n no desaparece; se reduce a Integration Context.
**Razón:** preserva la inversión actual (OAuth2, workflows configurados, Telegram conectado). n8n es excelente para integraciones; deja de ser lógica de negocio.
**Trade-off:** dos lugares donde puede haber código (n8n flows + API), pero con responsabilidades disjuntas.

### ADR-005 — Supabase como base principal, pero abstraído
**Decisión:** Supabase es el `StoragePort` por defecto, pero el código usa la abstracción.
**Razón:** evita lock-in si Supabase cambia precios o se vuelve insuficiente.
**Trade-off:** un poco de complejidad extra; se justifica.

### ADR-006 — Groq por ahora, con LLMPort abierto
**Decisión:** Groq es el `LLMPort` por defecto (rendimiento/costo buenos).
**Razón:** la calidad demostrada en benchmark (152 facturas) es adecuada; latencia baja.
**Trade-off:** depender de un solo proveedor; mitigado por el puerto abstracto.

### ADR-007 — Idempotencia obligatoria en escrituras
**Decisión:** todo endpoint que escriba debe ser idempotente o requerir `Idempotency-Key`.
**Razón:** reintentos automáticos de clientes (Telegram, frontend) no deben corromper datos.
**Trade-off:** un poco más de código por endpoint; vale la pena.

### ADR-008 — Multi-tenancy por `pyme_id` explícito + RLS
**Decisión:** `pyme_id` explícito en cada query + RLS como defensa.
**Razón:** doble protección contra fugas; explícito hace el código auditable.
**Trade-off:** verbosidad; se compensa con un decorator `@with_tenant`.

---

## 15. Glosario

**ADR** — Architecture Decision Record. Decisión arquitectónica documentada con razón y consecuencias.

**Bounded Context** — Contexto delimitado en Domain-Driven Design. Conjunto coherente de responsabilidades con vocabulario propio.

**CUFE** — Código Único de Factura Electrónica de la DIAN. Identificador único nacional.

**DIAN** — Dirección de Impuestos y Aduanas Nacionales de Colombia.

**Hexagonal architecture / Ports & Adapters** — Patrón arquitectónico donde el núcleo de dominio se comunica con el exterior solo a través de interfaces abstractas (puertos), implementadas por adaptadores intercambiables.

**HPA** — Horizontal Pod Autoscaler. Componente de Kubernetes que escala réplicas según métricas.

**IDP** — Intelligent Document Processing.

**Idempotencia** — Propiedad de una operación que produce el mismo resultado al ejecutarse una o múltiples veces.

**JWT** — JSON Web Token. Token firmado para autenticación stateless.

**OCR** — Optical Character Recognition.

**RLS** — Row-Level Security en PostgreSQL. Políticas que filtran filas automáticamente según contexto.

**Tenant** — En SaaS multi-tenant, cada cliente aislado. En nuestro caso, cada PyME.

**UBL 2.1** — Universal Business Language 2.1. Estándar XML usado por la DIAN para facturas electrónicas.

---

## 16. Próximos pasos antes de codificar

Antes de la primera línea de código de Fase A, este documento debe:

1. Ser revisado por el equipo (Samuel y Juan Pablo) y la profesora.
2. Recibir feedback y actualizarse a v1.0.
3. Acompañarse de un diagrama de despliegue Kubernetes detallado (qué namespace, qué deployment, qué service).
4. Definir los Pydantic models concretos de las entidades principales como contrato congelado.

Una vez aprobado, se vuelve la **fuente de verdad** para implementación, y cualquier desviación requiere actualizar el documento primero.

---

*Documento generado el 2026-06-04. Versionado en git como `docs/architecture/DESIGN.md`.*
