# Current Focus

**Phase:** 1 — MVP de procesamiento masivo
**Última actualización:** 2026-06-02

## Completado en esta sesión (2026-06-02)

### Funcionalidades
- **Carga masiva** con progreso individual por archivo, tiempos con `performance.now()`, cola automática máx 3 concurrentes
- **Carga individual** coexistiendo via `IonSegment` ("Carga individual" / "Carga masiva") — estados separados, sin mezcla
- **Navegación al detalle** desde cards de masiva (click cuando estado='listo' + facturaId)
- **Fix drag-and-drop** en modo individual — añadido `onDropIndividual()` y eventos `dragover/dragleave/drop` a la zona de drop individual
- **Modelo `ArchivoEnProceso`** con `facturaId?: string` — se extrae de `resultado.guardado?.factura_id`
- **`procesarArchivo(file)`** en FacturaService — detecta formato por mime/ext, FileReader puro, Observable

### Sistema visual (base lista, páginas pendientes)
- Tokens actualizados: accent `#2ECC71`, fondos más profundos (`#0A0A0F`, `#13131A`, `#1C1C26`)
- Fuentes nuevas vía Google Fonts: **DM Sans** (body), **Outfit** (headings), **JetBrains Mono** (data/IDs/monospace)
- Plugin `frontend-design` adoptado como referencia visual (Linear / Vercel / Stripe / Raycast)
- **Home** rediseñada: stat grid, nav cards con ion-icons, status dots de infraestructura, progress bars, equipo

## Pendientes — próxima sesión

### UI (continuar rediseño)
- [ ] **upload.page** — rediseño visual con nuevo sistema (segmented, drop zone, file cards)
- [ ] **facturas.page** — filtros como tabs, cards con jerarquía clara, badges de estado
- [ ] **detalle.page** — header sticky, secciones bien separadas, tabla de ítems y impuestos limpia
- [ ] **onboarding.page** — progreso visual 7 pasos, transiciones suaves
- [ ] Evaluar estética iPhone-style: cards más redondeadas, blur sutil, iconografía SF-like

### Navegación
- [ ] Fix back-arrows rotas — auditoría de `ion-back-button` y configuración del router
- [ ] Transiciones entre pantallas (Ionic page transitions)

### Funcionalidad
- [ ] **B7** — Edición de campos en detalle.page (Prompt 2 ROADMAP): inputs editables, Guardar PATCH Supabase, Cancelar

## Bloqueantes
- Ninguno técnico — contexto agotado al 87%, sesión cerrada para persistir
