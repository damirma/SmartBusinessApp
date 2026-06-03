# Current Focus

**Fase activa:** 1 → 80% completada | 1.5 → 100% completada  
**Última actualización:** 2026-06-02 (cierre de sesión)

---

## Completado esta sesión (2026-06-02) — commit 0dd55ab

### Fix IP dinámica en home.page
- `home.page.html` ahora lee `environment.workerUrl` — ya no hay IP hardcodeada

### Upload page polish
- `ion-back-button` en toolbar (text="")
- Segmento accent: tab activo con bg verde sólido, texto negro
- Radios aumentados: drop-zone → 24px, cards → 16px

### Fase 1.5-A — Navegación contextual (lote)
- **`SesionCargaService`** — signal del lote actual: `iniciarLote`, `agregarALote`, `limpiarLote`, `estaEnLoteActual`
- **upload.page** — llama al servicio al procesar (individual y masiva); pasa `?from=lote` al navegar a detalle
- **detalle.page** — lee queryParam `from`; `goBack()` envía a `/upload` si viene de lote, `/facturas` si no

### Fase 1.5-B — Lista de facturas inteligente (rewrite total)
- Helper puro `src/app/utils/agrupar-facturas.ts` — agrupación mes/proveedor/flat, ordenamiento, subtítulos
- `facturas.page` reescrita con Signals + computed:
  - Agrupación: Por mes | Por proveedor | Sin agrupar
  - Ordenamiento: Más reciente | Más antiguo | Mayor monto | Menor monto
  - Filtros chips: estado (Todos/Pendientes/Pagadas/Vencidas) + rango (Todo/Este mes/Mes pasado/90 días)
  - Búsqueda libre por número, proveedor, NIT
  - Sticky group headers
  - Resumen card global con totales coloreados
  - Skeletons shimmer en lugar de spinner
  - Empty states diferenciados
  - Filtro de lote: `?lote=id1,id2,id3` → chip "Salir del lote"

### Fase 1.5-C — Card "Revisar lote" en upload.page
- Aparece cuando ≥1 archivo procesado en modo masiva
- Navega a `/facturas?lote=ids`
- Limpiar batch también limpia el lote del servicio

### Fase 1.5-D — SbSkeletonComponent
- Standalone en `src/app/components/sb-skeleton/`
- Variantes: `card` | `row` | `block`, con inputs `count`, `height`, `animated`
- Shimmer gradient usando sb-tokens

### Detalle page — modernización
- Control flow `@if` / `@for ... track` (Angular 17+)
- `cargando` y `mostrarModalPago` como Signals
- Skeletons inline reemplazan al spinner

---

## Próxima sesión — orden de prioridad

1. **Onboarding redesign** — estilo iPhone dark, 7 pasos con motion suave en transiciones
2. **B7** — Edición de campos extraídos en detalle.page (modo edit + PATCH Supabase)
3. **Cerrar Fase 1** — verificación E2E con backend real (`146.148.80.200:30080`)
4. **Fase 2** — n8n en producción: router de formato (XML/PDF/imagen) + bot Telegram

---

## Bloqueantes
- Ninguno técnico
- worker-ocr requiere `146.148.80.200:30080` — OCR solo en prod, app local funciona sin él
