# Learnings — Bugs, Gotchas, "Nunca hagas esto"

## 2026-06-02 — IP hardcodeada vieja en home.page.html
**Causa:** `home.page.html` tiene la IP `34.26.53.228:30080` hardcodeada como string en el HTML, no usa `environment.workerUrl`
**Fix pendiente:** Verificar y reemplazar por la IP estática actual `146.148.80.200:30080` o mejor aún, leer desde `environment.workerUrl` en el componente y bindear en el template
**Dónde:** `home.page.html`, sección de infraestructura

## 2026-06-02 — Navegación entre pantallas con back-arrows rota
**Causa:** No auditado aún — `ion-back-button` puede no estar configurado en los headers de las páginas secundarias (upload, facturas, detalle, onboarding)
**Fix pendiente:** Auditar cada página: agregar `<ion-back-button defaultHref="/home">` en los toolbars donde falte; revisar la config de `routerLink` y si los headers usan `ion-buttons slot="start"`
**Afecta:** Todas las páginas excepto home

## 2026-06-02 — Angular template lexer no soporta caracteres ñ/acentos en expresiones
**Causa:** El lexer de plantillas Angular rechaza caracteres no-ASCII en expresiones `{{ }}` y bindings
**Fix:** Los métodos y propiedades referenciadas en HTML deben tener nombres solo ASCII. Usar wrappers si el modelo TypeScript tiene ñ (ej: `archivo.tamaño` → método `fileSize(a)` que accede a la prop internamente)
**Afectó:** `formatearTamaño` y `archivo.tamaño` en upload.page.html

## 2026-06-02 — PowerShell no soporta && para encadenar comandos
**Causa:** El shell en este proyecto es PowerShell 5.1
**Fix:** Usar `;` para secuencial incondicional, o comandos separados
**Nunca:** `npm install && ng serve` → usar `npm install; ng serve`

## 2026-06-02 — AttachedDocument en XML DIAN
**Causa:** El XML de DIAN no es un Invoice directo — envuelve la factura en un AttachedDocument
**Fix:** Extraer el Invoice real del CDATA dentro de `cbc:Description` antes de parsear
**Código:** Función `parse_xml()` en worker-ocr/main.py lo maneja

## 2026-06-02 — Tabla pagos no existe en Supabase
**Causa:** El query en getFactura hacía join con `pagos(*)` pero la tabla no existe
**Fix:** Quitar `,pagos(*)` del select — columnas estado/fecha_pago van directo en `facturas`
**Resuelto en Fase 0**

## 2026-06-02 — socat se cae si minikube reinicia primero
**Causa:** systemd inicia socat antes de que `minikube ip` resuelva
**Fix:** ExecStartPre con loop `until minikube ip succeeds`
**Resuelto en Fase 0**
