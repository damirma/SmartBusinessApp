# Pending Tasks

## Fase 1 — MVP de procesamiento masivo

- [x] **A4** — Carga masiva de PDFs: drag-and-drop de múltiples archivos o ZIP
- [x] **A5** — Vista de progreso: barra por archivo, estado (cola/procesando/listo/error)
- [x] **A6** — Tiempos de procesamiento: mostrar segundos por documento y total
- [x] **A4+** — Carga individual coexistiendo con masiva via IonSegment
- [x] **A4+** — Fix drag-and-drop en modo individual (onDropIndividual)
- [x] **A4+** — Navegación al detalle desde card de masiva (facturaId → /detalle/:id)
- [ ] **B7** — Edición de campos en detalle.page (Prompt 2 ROADMAP): inputs editables, Guardar PATCH Supabase, Cancelar

### Subtareas Fase 1 completadas
- [x] Modelo `ArchivoEnProceso` en `src/app/models/` (incl. `facturaId?`)
- [x] Método `procesarArchivo(file)` en `FacturaService`
- [x] Tokens actualizados: accent #2ECC71, fondos #0A0A0F/#13131A/#1C1C26
- [x] Fuentes: DM Sans + Outfit + JetBrains Mono via Google Fonts
- [x] Home rediseñada con sistema visual nuevo

### Pendientes UI (próxima sesión)
- [x] **UI upload** — back-button, segmento accent verde, radios 16-24px
- [x] **UI facturas** — rewrite completo con Signals, agrupación, filtros, skeletons
- [x] **UI detalle** — @if/@for, cargando+modal como Signals, skeletons, back contextual
- [ ] **UI onboarding** — redesign estilo iPhone dark, motion suave en transiciones de paso
- [x] **UX nav** — ion-back-button en upload/facturas; back contextual en detalle

### Próximos (en orden de prioridad)
- [ ] **UI onboarding** — redesign 7 pasos con motion (primera prioridad siguiente sesión)
- [ ] **B7** — Edición de campos extraídos en detalle.page (modo edit + PATCH Supabase)
- [ ] **Fase 1 cierre** — verificar 100% de funcionalidad E2E con backend real

## Fase 1.5 — Inteligencia de presentación ✅ COMPLETA (commit 0dd55ab, 2026-06-02)

### Navegación contextual (lote)
- [x] **Nav-A** — `SesionCargaService`: signal de lote actual, iniciarLote/agregarALote
- [x] **Nav-B** — upload.page: llama al servicio, pasa `?from=lote` al navegar a detalle
- [x] **Nav-C** — detalle.page: lee queryParam `from`, `goBack()` contextual

### Lista de facturas inteligente
- [x] **List-A** — Agrupación por mes | proveedor | sin agrupar (Signals + computed)
- [x] **List-B** — Ordenamiento dentro del grupo (fecha asc/desc, monto asc/desc)
- [x] **List-C** — Filtros: estado + rango de fechas + búsqueda libre
- [x] **List-D** — Sticky headers al agrupar
- [x] **List-E** — Resumen global (tarjeta top) con totales y mini-stats
- [x] **List-F** — Filtro de lote: `?lote=ids` → chip "Salir del lote"

### Revisar lote (upload.page)
- [x] **Lote-A** — Card "Revisar N facturas cargadas" en modo masiva
- [x] **Lote-B** — Navega a /facturas?lote=ids

### Skeleton components
- [x] **Skel-A** — `SbSkeletonComponent` standalone (card/row/block)
- [x] **Skel-B** — Shimmer gradient con sb-tokens
- [x] **Skel-C** — Skeletons inline en facturas.page
- [x] **Skel-D** — Skeletons inline en detalle.page

## Fase 2 — n8n + Telegram
- [ ] **D2** — n8n router completo: webhook detecta formato (XML/PDF/imagen), enruta a worker-ocr
- [ ] **D5** — Cola de procesamiento en n8n (retry + dead-letter)
- [ ] **D4** — Manejo de errores y reintentos automáticos
- [ ] **C2** — Bot de Telegram: foto de factura → OCR → resumen en chat
- [ ] **D3** — Notificaciones al terminar procesamiento

## Fase 3 — Multi-tenant
- [ ] **E1** — Autenticación Supabase Auth
- [ ] **E2** — RLS real por PyME
- [ ] **E3** — Onboarding guarda perfil en `perfil_extraccion`
- [ ] **E5** — Límite freemium 50 facturas/mes
- [ ] **F1** — Dashboard analítico

## Deuda técnica conocida
- [x] IP hardcodeada en home.page.html → resuelto: usa environment.workerUrl
- [x] Back-arrows rotas → resuelto: ion-back-button en upload/facturas; goBack() en detalle
- [ ] CORS sin restricciones en worker-ocr (aceptable para MVP académico)
- [ ] Sin autenticación de usuarios (Fase 3)
- [ ] Migrar local CSS vars (--surface, --primary) en detalle.page.scss a sb-tokens globales
- [ ] SbSkeletonComponent no está integrado en detalle.page (usa skeletons inline propios)
