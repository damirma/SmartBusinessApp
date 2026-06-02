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
- [ ] **UI upload** — rediseño visual consistente con home
- [ ] **UI facturas** — filtros como tabs, badges de estado pulidos
- [ ] **UI detalle** — header sticky, secciones separadas, tabla limpia
- [ ] **UI onboarding** — progreso 7 pasos, transiciones suaves
- [ ] **UX nav** — fix back-arrows, auditoría ion-back-button

## Fase 1.5 — Inteligencia de presentación

### Navegación contextual (lote)
- [ ] **Nav-A** — `SesionCargaService`: signal de lote actual, iniciarLote/agregarAFLote
- [ ] **Nav-B** — upload.page: llamar al servicio, pasar `?from=lote` al navegar a detalle
- [ ] **Nav-C** — detalle.page: leer queryParam `from`, ajustar destino del back-button

### Lista de facturas inteligente
- [ ] **List-A** — Agrupación por mes | proveedor | sin agrupar (Signals + computed)
- [ ] **List-B** — Ordenamiento dentro del grupo (fecha asc/desc, monto asc/desc)
- [ ] **List-C** — Filtros: estado + rango de fechas + búsqueda libre
- [ ] **List-D** — Sticky headers al agrupar
- [ ] **List-E** — Resumen global (tarjeta top) con totales y mini-stats
- [ ] **List-F** — Filtro de lote: `?lote=id` → chip "Lote: N facturas" + salir

### Revisar lote (upload.page)
- [ ] **Lote-A** — Sección "Revisar las N facturas cargadas" en modo masiva
- [ ] **Lote-B** — Navegación al lote en facturas.page

### Skeleton components
- [ ] **Skel-A** — `SbSkeletonComponent` standalone (variantes: card, row, block)
- [ ] **Skel-B** — Shimmer animation con tokens del sistema
- [ ] **Skel-C** — Aplicar en facturas.page (loading inicial)
- [ ] **Skel-D** — Aplicar en detalle.page (loading de factura)

## Fase 2 — n8n + Telegram
- [ ] **D2** — n8n router completo (webhook detecta formato, enruta)
- [ ] **D5** — Cola de procesamiento en n8n
- [ ] **D4** — Manejo de errores y reintentos
- [ ] **C2** — Bot de Telegram (foto → resumen)
- [ ] **D3** — Notificaciones al terminar

## Fase 3 — Multi-tenant
- [ ] **E1** — Autenticación Supabase Auth
- [ ] **E2** — RLS real por PyME
- [ ] **E3** — Onboarding guarda perfil en `perfil_extraccion`
- [ ] **E5** — Límite freemium 50 facturas/mes
- [ ] **F1** — Dashboard analítico

## Deuda técnica conocida
- [ ] IP hardcodeada en home.page.html → usar environment.workerUrl
- [ ] Back-arrows rotas → auditar ion-back-button en todas las páginas
- [ ] CORS sin restricciones en worker-ocr (aceptable para MVP académico)
- [ ] Sin autenticación de usuarios (Fase 3)
- [ ] Mover URLs hardcodeadas a environment.ts (ya están, verificar workerUrl)
