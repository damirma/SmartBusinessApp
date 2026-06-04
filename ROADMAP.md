# SmartBusiness OCR Suite — Roadmap de Producto y Requerimientos

> Documento maestro de desarrollo. Define qué construir, en qué orden, y cómo.
> Sirve como norte estratégico y como guía para dirigir a Claude Code.
> Última actualización: 2026-06-02.

---

## 1. Visión

Convertir SmartBusiness OCR Suite de un prototipo académico funcional a un **SaaS de procesamiento de facturas listo para producción**, dirigido a micronegocios y PyMEs colombianas que reciben facturas electrónicas DIAN pero no tienen herramientas para procesarlas.

**Diferenciador clave:** procesamos los 3 formatos en que llegan las facturas (XML, PDF, foto), por los canales que el negocio ya usa (app o Telegram), sin que tengan que instalar ni aprender software contable.

**Mercado:** 5.3M micronegocios en Colombia, 89.1% sin herramientas digitales (DANE-EMICRON 2024).

---

## 2. Estado actual (lo que YA funciona)

| Componente | Estado | Detalle |
|---|---|---|
| Procesamiento XML | ✅ Producción | Parser UBL 2.1, 100% exactitud, 2ms |
| Procesamiento PDF | ✅ Producción | MarkItDown + Groq Llama 70B, ~75% |
| Procesamiento imagen | ✅ Producción | Groq Llama 4 Scout (visión) |
| worker-ocr | ✅ v4.0 en K8s | Flask, migrado de Gemini a Groq |
| Supabase | ✅ 8 tablas | PostgreSQL + RLS |
| n8n | ⚠️ Webhook básico | Falta orquestación completa |
| Frontend | ⚠️ Funcional, UI básica | home, upload, facturas, detalle |
| Infraestructura | ⚠️ IP efímera | minikube en GCP, socat, falta IP estática |

**Deuda técnica inmediata (bloquea la demo y producción):**
- Tabla `pagos` referenciada en frontend pero no existe → quitar del query o crearla
- Columnas `estado` y `fecha_pago` faltan en tabla `facturas`
- IP de la VM es efímera → reservar estática
- socat se cae si minikube reinicia antes que el servicio

---

## 3. Requerimientos funcionales por módulo

### Módulo A — Procesamiento de documentos (núcleo)

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| A1 | Procesar XML DIAN individual | Alta | ✅ |
| A2 | Procesar PDF individual con IA | Alta | ✅ |
| A3 | Procesar imagen/foto con visión | Alta | ✅ |
| A4 | **Carga masiva de PDFs (batch)** | Alta | ❌ |
| A5 | **Vista de progreso durante el análisis** | Alta | ❌ |
| A6 | **Mostrar tiempo de procesamiento por archivo** | Media | ❌ |
| A7 | Detección automática de formato (XML/PDF/imagen) | Media | Parcial |
| A8 | Validación cruzada XML vs PDF cuando ambos existen | Baja | ❌ |
| A9 | Reintentos automáticos en error de API | Media | ❌ |

### Módulo B — Gestión de facturas

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| B1 | Listar facturas con filtros | Alta | ✅ |
| B2 | Ver detalle completo | Alta | ✅ |
| B3 | Marcar como pagada | Alta | ⚠️ (falta columna BD) |
| B4 | Búsqueda por proveedor/número | Media | ✅ |
| B5 | Exportar a Excel/CSV | Media | ❌ |
| B6 | Paginación en lista larga | Media | ❌ |
| B7 | Editar campos extraídos (corregir IA) | Alta | ❌ |
| B8 | Eliminar factura | Baja | ❌ |

### Módulo C — Canales de entrada

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| C1 | Upload desde app web/móvil | Alta | ✅ |
| C2 | **Bot de Telegram (foto → resumen)** | Alta | ❌ |
| C3 | Recepción por correo (forward de facturas) | Baja | ❌ |
| C4 | API pública para integradores | Baja | ❌ |

### Módulo D — Orquestación n8n (producción)

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| D1 | Webhook recibe documento → worker-ocr | Alta | ⚠️ Básico |
| D2 | **Router por formato (XML/PDF/imagen)** | Alta | ❌ |
| D3 | **Notificación Telegram al terminar** | Media | ❌ |
| D4 | Manejo de errores y reintentos | Alta | ❌ |
| D5 | Cola para procesamiento masivo | Media | ❌ |
| D6 | Webhook por tenant (multi-PyME) | Baja | ❌ |

### Módulo E — Multi-tenancy y autenticación

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| E1 | Registro/login de usuarios (Supabase Auth) | Alta | ❌ |
| E2 | Aislamiento de datos por PyME (RLS real) | Alta | ❌ |
| E3 | Onboarding guarda perfil en BD | Media | ⚠️ (solo sessionStorage) |
| E4 | Roles (dueño, contador, empleado) | Baja | ❌ |
| E5 | Límite freemium (50 facturas/mes) | Media | ❌ |

### Módulo F — Analítica y reportes

| ID | Requerimiento | Prioridad | Estado |
|---|---|---|---|
| F1 | Dashboard: total facturas, monto, pendientes | Media | ❌ |
| F2 | Gráfico de gastos por proveedor | Baja | ❌ |
| F3 | Reporte mensual de IVA | Media | ❌ |
| F4 | Alertas de vencimiento | Baja | ❌ |

---

## 4. Requerimientos no funcionales

| ID | Requerimiento | Métrica objetivo |
|---|---|---|
| RNF1 | Tiempo procesamiento XML | < 10 ms |
| RNF2 | Tiempo procesamiento PDF | < 15 s |
| RNF3 | Tiempo procesamiento imagen | < 10 s |
| RNF4 | Exactitud XML | 100% |
| RNF5 | Exactitud PDF/imagen | ≥ 75% |
| RNF6 | Disponibilidad del servicio | 99% (producción) |
| RNF7 | UI responsive | Mobile-first |
| RNF8 | Carga masiva | ≥ 50 PDFs por lote |
| RNF9 | Seguridad | RLS por tenant, secrets en K8s, sin credenciales en código |

---

## 5. Plan de desarrollo por fases

### FASE 0 — Estabilización (esta semana, para la demo)
Objetivo: que todo lo que ya existe funcione sin errores.

1. Arreglar tabla `pagos` (quitar del query o crear tabla)
2. Agregar columnas `estado` y `fecha_pago` a `facturas`
3. Reservar IP estática en GCP (eliminar el problema de IP efímera)
4. Hacer robusto el socat (espera a minikube antes de resolver IP)
5. Procesar 5-10 facturas reales para poblar la demo

### FASE 1 — MVP de procesamiento masivo (1-2 semanas)
Objetivo: el flujo que vende el producto — subir muchas facturas de golpe.

1. **Carga masiva de PDFs** (A4): drag-and-drop de múltiples archivos o ZIP
2. **Vista de progreso** (A5): barra por archivo, estado (en cola/procesando/listo/error)
3. **Tiempos de procesamiento** (A6): mostrar segundos por documento y total
4. **Edición de campos** (B7): permitir corregir lo que la IA extrajo mal
5. Redesign UI minimalista (toda la app)

### FASE 2 — Producción con n8n (2-3 semanas)
Objetivo: sacar el sistema del modo "desarrollo" a algo que un cliente real pueda usar.

1. **n8n router completo** (D2): un webhook que detecta formato y enruta
2. **Cola de procesamiento** (D5): para no saturar Groq con cargas masivas
3. **Manejo de errores y reintentos** (D4)
4. **Bot de Telegram** (C2): el canal estrella para micronegocios
5. **Notificaciones** (D3): avisar al usuario cuando termina

### FASE 3 — Multi-tenant y monetización (3-4 semanas)
Objetivo: convertirlo en un SaaS real con clientes separados y cobrable.

1. **Autenticación** (E1): Supabase Auth con login
2. **RLS real por PyME** (E2): cada cliente ve solo sus facturas
3. **Onboarding persistente** (E3): guardar perfil en `perfil_extraccion`
4. **Límite freemium** (E5): 50 facturas/mes en plan gratuito
5. **Dashboard analítico** (F1)

### FASE 4 — Escala y ecosistema (futuro)
1. Migración minikube → GKE (producción real)
2. Conectores ERP: Siigo API, Alegra
3. Reporte mensual de IVA (F3)
4. API pública para integradores

---

## 6. Especificaciones técnicas de las features prioritarias

### A4 + A5 + A6 — Carga masiva con progreso y tiempos

**Frontend (Ionic):**
- Componente de upload acepta múltiples archivos (`multiple` en input) o ZIP
- Estado por archivo: `{ nombre, formato, estado: 'cola'|'procesando'|'listo'|'error', tiempo_ms, resultado }`
- Procesar secuencialmente o en paralelo limitado (máx 3 concurrentes para no saturar Groq)
- Vista: lista con barra de progreso por archivo + contador global ("12 de 50 procesadas")
- Al terminar cada uno: marcar verde/rojo, mostrar tiempo
- Usar Signals de Angular para reactividad del progreso

**Backend (worker-ocr):**
- El endpoint `/procesar` ya devuelve un solo resultado — el batch se orquesta en el frontend (loop) o en n8n
- Opción mejor: nuevo endpoint `/procesar-batch` que recibe array y devuelve stream de resultados (Server-Sent Events)
- Incluir `tiempo_ms` en cada respuesta (ya se puede medir con time.perf_counter)

**Decisión de arquitectura:** para el MVP, el loop en frontend es más simple. Para producción, mover a n8n con cola.

### C2 — Bot de Telegram

**Flujo:**
1. Usuario envía foto/PDF al bot
2. Telegram → webhook de n8n
3. n8n descarga el archivo, lo convierte a base64
4. n8n → worker-ocr `/procesar`
5. worker-ocr extrae + guarda en Supabase
6. n8n responde al chat con resumen formateado (proveedor, total, fecha)

**n8n nodos:** Telegram Trigger → Get File → HTTP Request (worker-ocr) → Telegram Send Message

**Ventaja:** cero instalación para el micronegocio, usa una app que ya tienen.

### D2 — n8n Router de formato

**Workflow:**
```
Webhook recibe { archivo_b64, mime_type, tenant_id }
  → Switch por mime_type:
      - application/xml → worker-ocr con xml_content
      - application/pdf → worker-ocr con imagen_b64 + mime
      - image/* → worker-ocr con imagen_b64 + mime
  → worker-ocr procesa y guarda
  → Respond to Webhook con resultado
  → (async) Telegram notify si viene de ese canal
```

---

## 7. Prompts listos para Claude Code

### Prompt 1 — Carga masiva con progreso (Fase 1)
```
Lee CLAUDE.md y usa la skill minimalist para el diseño.

Implementa carga masiva de facturas en la página upload:

1. El input de archivos debe aceptar múltiples (multiple) Y archivos ZIP.
2. Crea un modelo ArchivoEnProceso con: nombre, formato, estado
   ('cola'|'procesando'|'listo'|'error'), tiempoMs, resultado, error.
3. Procesa máximo 3 archivos en paralelo (para no saturar Groq).
4. Usa Angular Signals para el estado reactivo del progreso.
5. Vista: lista de archivos con barra de progreso individual, ícono de
   estado (reloj/spinner/check verde/x roja), y tiempo en segundos cuando
   termina. Arriba un contador global "X de Y procesadas" y tiempo total.
6. El servicio factura.ts ya tiene procesarXML y procesarImagen.
   Mide el tiempo con performance.now() antes y después de cada llamada.
7. Diseño minimalista, oscuro, accent verde. Archivos HTML/SCSS/TS separados.

No toques el worker-ocr, solo el frontend. El loop de procesamiento va en
el frontend por ahora.
```

### Prompt 2 — Edición de campos extraídos (Fase 1)
```
En la página detalle, agrega modo edición:

1. Botón "Editar" que convierte los campos (número, proveedor, NIT, total,
   fecha) en inputs editables.
2. Botón "Guardar" que hace PATCH a Supabase con los campos corregidos.
3. Botón "Cancelar" que descarta cambios.
4. Agrega al servicio factura.ts un método actualizarFactura(id, campos).
5. Esto es clave porque la IA extrae con ~75% de exactitud — el usuario
   debe poder corregir. Diseño minimalista.
```

### Prompt 3 — Arreglar BD y pagos (Fase 0)
```
Hay dos errores 400 de Supabase:

1. getFactura hace join con pagos(*) pero esa tabla no existe.
   Quita ,pagos(*) del select en factura.ts método getFactura.
2. El PATCH para marcar como pagada falla porque faltan columnas.
   Dame el SQL para agregar a la tabla facturas: estado (text default
   'pendiente'), fecha_pago (date nullable), forma_pago (text nullable).
   Lo correré en el SQL Editor de Supabase.
```

### Prompt 4 — UI minimalista global (Fase 1)
```
Usa la skill minimalist. Rediseña las 4 páginas (home, upload, facturas,
detalle) con un sistema visual consistente:

- Tema oscuro (#0f0f17 fondo, #1a1a2e cards), accent verde #2ECC71
- Tipografía: system font, jerarquía clara (18px títulos, 14px body)
- Cards con borde 1px sutil, radio 8px, sin sombras pesadas
- Badges de estado: verde=pagada, ámbar=pendiente, rojo=vencida
- Empty states con ícono + un solo CTA
- Loading: skeleton screens, no spinners
- NO over-design. Funcional y limpio.

Mantén toda la lógica y conexiones existentes intactas. Solo HTML/SCSS.
Conserva la conexión a worker-ocr (environment.ts) y Supabase.
```

### Prompt 5 — Bot de Telegram en n8n (Fase 2)
```
En la VM, configura un workflow de n8n para procesar facturas por Telegram:

1. Telegram Trigger (necesito crear un bot con @BotFather, te paso el token)
2. Nodo Get File para descargar la foto/PDF que envió el usuario
3. Convertir a base64
4. HTTP Request a worker-ocr-svc.pyme-test.svc.cluster.local/procesar
5. Telegram Send Message con el resumen: proveedor, total, fecha, # factura
6. Manejo de error: si worker-ocr falla, responder "No pude leer la factura,
   intenta con mejor luz"

Muéstrame el workflow antes de activarlo.
```

---

## 8. Decisiones de arquitectura tomadas

- **worker-ocr usa Groq** (no Gemini): gratis, rápido, sin rate limits severos
- **PDFs con texto** → MarkItDown + Llama 70B (texto). **Imágenes** → Llama 4 Scout (visión)
- **n8n es thin orchestrator**: la lógica de OCR vive en worker-ocr, n8n solo enruta
- **Multi-tenancy** = un namespace K8s por PyME (futuro), n8n central
- **Batch en frontend** para MVP, **cola en n8n** para producción
- **Edición manual obligatoria**: dado que la IA tiene ~75% exactitud, el usuario corrige

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| IA extrae mal (75%) | Edición manual + validación XML cuando exista |
| Groq cambia precios/límites | Arquitectura permite cambiar proveedor (Gemini, OpenAI) |
| IP efímera tumba el servicio | Reservar IP estática en GCP |
| minikube no es para producción | Migrar a GKE en Fase 4 |
| Sin auth, datos expuestos | Implementar Supabase Auth + RLS en Fase 3 |
| Credenciales expuestas en chats | Rotar llaves, usar .env y K8s secrets siempre |

---

## 10. Próximos pasos inmediatos

1. **Hoy:** arreglar BD (pagos, estado, fecha_pago) → Prompt 3
2. **Hoy:** reservar IP estática en GCP
3. **Esta semana:** carga masiva con progreso → Prompt 1
4. **Esta semana:** UI minimalista → Prompt 4
5. **Próxima semana:** edición de campos → Prompt 2, luego Telegram → Prompt 5

---

*Documento vivo. Actualizar a medida que se completen fases.*
