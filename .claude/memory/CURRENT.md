# Current Focus

**Phase:** 1.5 — Inteligencia de presentación
**Última actualización:** 2026-06-02

## Completado en esta sesión (2026-06-02)

### Fix rápido
- **IP hardcodeada en home.page** — ahora lee `environment.workerUrl` (fix de "34.26.53.228" → "146.148.80.200")

### UI — Upload page (polish)
- `ion-back-button` en lugar del logo SB en el toolbar
- Segmento verde sólido para tab activo (accent bg, black text)
- Radios aumentados: drop-zone → `radius-xl` (24px), cards → `radius-lg` (16px)

### Navegación contextual (Fase 1.5-A)
- **`SesionCargaService`** creado: signal del lote actual con `iniciarLote`, `agregarALote`, `limpiarLote`, `estaEnLoteActual`
- **upload.page**: llama al servicio al procesar (individual y masiva); pasa `?from=lote` al navegar al detalle
- **detalle.page**: lee `queryParam 'from'`; `goBack()` navega a `/upload` si viene de lote, `/facturas` si no

### Lista de facturas inteligente (Fase 1.5-B)
- **`src/app/utils/agrupar-facturas.ts`** — helper puro: agrupación mes/proveedor/flat, ordenamiento, subtítulos con formato compacto
- **facturas.page** completo rewrite (Signals + computed):
  - Agrupación seleccionable: Por mes | Por proveedor | Sin agrupar
  - Ordenamiento: Más reciente | Más antiguo | Mayor monto | Menor monto
  - Filtros chips: estado (Todos/Pendientes/Pagadas/Vencidas) + rango de fecha (Todo/Este mes/Mes pasado/90 días)
  - Búsqueda libre por número, proveedor, NIT
  - Sticky group headers
  - Resumen card global con stats coloreados (verde/naranja/rojo)
  - Monto por pagar (row separado, danger)
  - Skeletons inline (shimmer) en lugar de spinner
  - Empty states diferenciados: sin data vs. filtros sin resultados
  - Filtro de lote: `?lote=id1,id2,id3` → chip "Salir del lote" + filtrado automático

### Card "Revisar lote" (Fase 1.5-C)
- Upload.page modo masiva: cuando ≥1 procesada aparece card verde con botón "Revisar"
- Navega a `/facturas?lote=ids` con todos los IDs del lote actual
- Al limpiar el batch también limpia el lote del servicio

### Skeleton component (Fase 1.5-D)
- **`SbSkeletonComponent`** standalone creado en `src/app/components/sb-skeleton/`
- Variantes: `card` | `row` | `block`, con `count`, `height`, `animated` inputs
- Shimmer con gradient sweep usando sb-tokens

### Detalle page — modernización
- Control flow Angular 17+: `@if` / `@for ... track` en lugar de `*ngIf` / `*ngFor`
- Spinner reemplazado por skeleton cards inline
- `cargando` y `mostrarModalPago` → Signals
- `inject()` pattern para DI

## Próximos pasos

### Páginas pendientes (rediseño visual)
- [ ] **onboarding.page** — 7 pasos con motion suave (siguiente sesión)
- [ ] **detalle.page** — mejorar visualmente con sb-tokens (usa local vars aún)
- [ ] Evaluación: usar `SbSkeletonComponent` en detalle.page

### Funcionalidad
- [ ] **B7** — Edición de campos en detalle.page (Prompt 2 ROADMAP)
- [ ] Guardar perfil onboarding en `perfil_extraccion` (Supabase)
- [ ] Autenticación usuarios (Fase 3)

## Bloqueantes
- Ninguno técnico
- Backend (worker-ocr) requiere `146.148.80.200:30080` — app funciona, OCR solo en prod
