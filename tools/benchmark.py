#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, os
# Forzar UTF-8 en stdout para Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
"""
benchmark.py — Compara extracción XML vs PDF Vision vs PDF markitdown
para UNA factura del corpus. Valida antes de escalar a las 152.

Uso:
  python tools/benchmark.py --carpeta "C:\\Users\\Administrator\\Desktop\\Facturas\\08000302720000002837"
  python tools/benchmark.py --carpeta "C:\\Users\\Administrator\\Desktop\\Facturas\\08000302720000002837" --verbose
"""

import argparse
import base64
import io
import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path

# ── parse_xml inline (evita depender de Flask del worker-ocr) ────────────────
NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
}

def _t(el, path, default=""):
    node = el.find(path, NS)
    return (node.text or "").strip() if node is not None else default

def _a(el, path, attr, default=""):
    node = el.find(path, NS)
    return node.get(attr, default) if node is not None else default

def _parse_party(node):
    if node is None:
        return {}
    nombre = (
        _t(node, "cac:Party/cac:PartyName/cbc:Name") or
        _t(node, "cac:Party/cac:PartyTaxScheme/cbc:RegistrationName") or
        _t(node, "cac:Party/cac:PartyLegalEntity/cbc:RegistrationName")
    )
    nit = (
        _t(node, "cac:Party/cac:PartyTaxScheme/cbc:CompanyID") or
        _t(node, "cac:Party/cac:PartyLegalEntity/cbc:CompanyID")
    )
    dir_node = (
        node.find("cac:Party/cac:PhysicalLocation/cac:Address", NS) or
        node.find("cac:Party/cac:PostalAddress", NS)
    )
    direccion = {}
    if dir_node is not None:
        direccion = {
            "linea":        _t(dir_node, "cbc:Line"),
            "ciudad":       _t(dir_node, "cbc:CityName"),
            "departamento": _t(dir_node, "cbc:CountrySubentity"),
        }
    return {
        "nombre":    nombre.strip(),
        "nit":       nit,
        "direccion": direccion,
        "email":     _t(node, "cac:Party/cac:Contact/cbc:ElectronicMail"),
        "telefono":  _t(node, "cac:Party/cac:Contact/cbc:Telephone"),
    }

def parse_xml(xml_content):
    from datetime import datetime
    root = ET.fromstring(
        xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content
    )
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    if tag == "AttachedDocument":
        desc = root.find(".//cac:Attachment/cac:ExternalReference/cbc:Description", NS)
        if desc is None or not desc.text:
            raise ValueError("AttachedDocument sin Invoice embebida")
        inv = ET.fromstring(desc.text.strip().encode("utf-8"))
    elif tag == "Invoice":
        inv = root
    else:
        raise ValueError(f"Tipo XML no reconocido: {tag}")

    ctrl = inv.find(".//sts:InvoiceControl", NS)
    autorizacion = {}
    if ctrl is not None:
        autorizacion = {
            "numero":      _t(ctrl, "sts:InvoiceAuthorization"),
            "prefijo":     _t(ctrl, "sts:AuthorizedInvoices/sts:Prefix"),
            "desde":       _t(ctrl, "sts:AuthorizationPeriod/cbc:StartDate"),
            "hasta":       _t(ctrl, "sts:AuthorizationPeriod/cbc:EndDate"),
            "rango_desde": _t(ctrl, "sts:AuthorizedInvoices/sts:From"),
            "rango_hasta": _t(ctrl, "sts:AuthorizedInvoices/sts:To"),
        }

    items = []
    for line in inv.findall("cac:InvoiceLine", NS):
        items.append({
            "numero_linea":   _t(line, "cbc:ID"),
            "descripcion":    _t(line, "cac:Item/cbc:Description"),
            "cantidad":       _t(line, "cbc:InvoicedQuantity"),
            "unidad":         _a(line, "cbc:InvoicedQuantity", "unitCode"),
            "valor_unitario": _t(line, "cac:Price/cbc:PriceAmount"),
            "valor_total":    _t(line, "cbc:LineExtensionAmount"),
        })

    impuestos = []
    for tt in inv.findall("cac:TaxTotal", NS):
        for sub in tt.findall("cac:TaxSubtotal", NS):
            impuestos.append({
                "nombre":     _t(sub, "cac:TaxCategory/cac:TaxScheme/cbc:Name"),
                "porcentaje": _t(sub, "cac:TaxCategory/cbc:Percent"),
                "base":       _t(sub, "cbc:TaxableAmount"),
                "valor":      _t(sub, "cbc:TaxAmount"),
            })

    lma = inv.find("cac:LegalMonetaryTotal", NS)
    totales = {}
    if lma is not None:
        totales = {
            "subtotal":           _t(lma, "cbc:LineExtensionAmount"),
            "total_con_impuesto": _t(lma, "cbc:TaxInclusiveAmount"),
            "total_pagar":        _t(lma, "cbc:PayableAmount"),
        }

    qr_raw = _t(inv, ".//sts:QRCode")
    qr_url = ""
    if qr_raw:
        m = re.search(r"QRCode:\s*(https?://\S+)", qr_raw)
        if m:
            qr_url = m.group(1)

    pmt = inv.find("cac:PaymentMeans", NS)
    pago = {}
    if pmt is not None:
        codigo = _t(pmt, "cbc:PaymentMeansCode")
        pago = {
            "forma":             {"1": "Contado", "2": "Crédito"}.get(codigo, codigo),
            "fecha_vencimiento": _t(pmt, "cbc:PaymentDueDate"),
        }

    return {
        "fuente":       "xml",
        "procesado_en": datetime.utcnow().isoformat() + "Z",
        "documento": {
            "numero":            _t(inv, "cbc:ID"),
            "tipo":              _t(inv, "cbc:InvoiceTypeCode"),
            "cufe":              _t(inv, "cbc:UUID"),
            "fecha_emision":     _t(inv, "cbc:IssueDate"),
            "hora_emision":      _t(inv, "cbc:IssueTime"),
            "moneda":            _t(inv, "cbc:DocumentCurrencyCode"),
            "observaciones":     " | ".join(
                n.text.strip() for n in inv.findall("cbc:Note", NS)
                if n.text and n.text.strip()
            ),
            "autorizacion_dian": autorizacion,
            "url_verificacion":  qr_url,
        },
        "proveedor": _parse_party(inv.find("cac:AccountingSupplierParty", NS)),
        "cliente":   _parse_party(inv.find("cac:AccountingCustomerParty", NS)),
        "pago":      pago,
        "items":     items,
        "impuestos": impuestos,
        "totales":   totales,
    }

import google.generativeai as genai
import warnings
warnings.filterwarnings("ignore")  # silenciar FutureWarning de genai deprecation

# ── Campos que vamos a comparar ───────────────────────────────────────────────
CAMPOS_CLAVE = [
    ("numero",          "documento.numero",          "Número factura"),
    ("cufe",            "documento.cufe",            "CUFE"),
    ("fecha",           "documento.fecha_emision",   "Fecha emisión"),
    ("nit_proveedor",   "proveedor.nit",             "NIT proveedor"),
    ("nombre_prov",     "proveedor.nombre",          "Nombre proveedor"),
    ("nit_cliente",     "cliente.nit",               "NIT cliente"),
    ("total_pagar",     "totales.total_pagar",       "Total a pagar"),
    ("subtotal",        "totales.subtotal",          "Subtotal"),
    ("num_items",       "items.__len__",             "# ítems"),
    ("num_impuestos",   "impuestos.__len__",         "# impuestos"),
]

PROMPT_GEMINI = """Eres experto en facturación electrónica colombiana (DIAN).
Analiza el siguiente documento y extrae TODOS los datos.
Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto extra, sin bloques ```json.

{{
  "fuente": "{fuente}",
  "documento": {{
    "numero": "",
    "tipo": "",
    "cufe": "",
    "fecha_emision": "YYYY-MM-DD",
    "hora_emision": "",
    "moneda": "COP",
    "observaciones": ""
  }},
  "proveedor": {{"nombre": "", "nit": "", "direccion": {{"linea": "", "ciudad": ""}}, "email": "", "telefono": ""}},
  "cliente":   {{"nombre": "", "nit": "", "direccion": {{"ciudad": ""}}, "email": ""}},
  "pago":      {{"forma": "", "fecha_vencimiento": ""}},
  "items": [
    {{"numero_linea": "1", "descripcion": "", "cantidad": "", "unidad": "", "valor_unitario": "", "valor_total": ""}}
  ],
  "impuestos": [
    {{"nombre": "IVA", "porcentaje": "", "base": "", "valor": ""}}
  ],
  "totales": {{"subtotal": "", "total_con_impuesto": "", "total_pagar": ""}}
}}

REGLAS IMPORTANTES:
- Valores monetarios SIN puntos de miles: 1663200.00 (no 1.663.200,00)
- El CUFE es una cadena hexadecimal larga (96+ caracteres)
- NIT sin guión de verificación: 900123456 (no 900123456-1)
- Si hay retenciones (ReteIVA, Retefuente, ICA) inclúyelas en impuestos
- Incluye TODOS los ítems que aparezcan
- Campos ausentes: string vacío ""
"""


def extraer_valor(data: dict, ruta: str):
    """Extrae un valor de un dict anidado con ruta tipo 'documento.cufe' o 'items.__len__'."""
    if ruta.endswith(".__len__"):
        partes = ruta.split(".")[:-1]
        obj = data
        for p in partes:
            if not isinstance(obj, dict):
                return 0
            obj = obj.get(p, [])
        return len(obj) if isinstance(obj, list) else 0

    partes = ruta.split(".")
    obj = data
    for p in partes:
        if not isinstance(obj, dict):
            return ""
        obj = obj.get(p, "")
    return obj or ""


def normalizar(val) -> str:
    """Normaliza para comparación: strip, sin puntos de miles."""
    s = str(val).strip()
    # Para valores numéricos: remover puntos de miles, normalizar decimales
    try:
        f = float(s.replace(",", ".").replace(".", "").replace(",", "."))
        if s.replace(".", "").replace(",", "").isdigit():
            return str(int(f))
        return f"{f:.2f}"
    except ValueError:
        pass
    return s.lower()


def comparar_campo(gt_val, cmp_val, campo_id: str) -> bool:
    """True si los valores son equivalentes."""
    gt = str(gt_val).strip()
    cmp = str(cmp_val).strip()

    if gt == cmp:
        return True

    # Comparación numérica con tolerancia 0.5%
    if campo_id in ("total_pagar", "subtotal"):
        try:
            n_gt = float(re.sub(r"[^\d.]", "", gt) or "0")
            n_cmp = float(re.sub(r"[^\d.]", "", cmp) or "0")
            if n_gt == 0:
                return n_cmp == 0
            return abs(n_gt - n_cmp) / n_gt < 0.005
        except ValueError:
            return False

    # num_items y num_impuestos: comparación exacta de enteros
    if campo_id in ("num_items", "num_impuestos"):
        return str(gt) == str(cmp)

    # CUFE: primeros 20 chars (Gemini a veces trunca)
    if campo_id == "cufe":
        return len(gt) > 10 and len(cmp) > 10 and gt[:20].lower() == cmp[:20].lower()

    # Nombre: comparación case-insensitive, sin puntuación
    if campo_id in ("nombre_prov",):
        if not gt or not cmp:
            return False
        gt_n = re.sub(r"[^\w\s]", "", gt.lower()).strip()
        cmp_n = re.sub(r"[^\w\s]", "", cmp.lower()).strip()
        return gt_n == cmp_n or gt_n in cmp_n or cmp_n in gt_n

    return False


def metodo_vision(pdf_bytes: bytes, api_key: str) -> tuple[dict, float, int, int]:
    """PDF → Gemini Vision (imagen). Retorna (resultado, segundos, tokens_entrada, tokens_salida)."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = PROMPT_GEMINI.format(fuente="pdf_vision")
    img_b64 = base64.b64encode(pdf_bytes).decode()

    t0 = time.perf_counter()
    response = model.generate_content([
        {"mime_type": "application/pdf", "data": img_b64},
        prompt,
    ])
    duracion = time.perf_counter() - t0

    tok_in  = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
    tok_out = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        obj, _ = json.JSONDecoder().raw_decode(raw)
        data = obj
    data.setdefault("items", [])
    data.setdefault("impuestos", [])
    return data, duracion, tok_in, tok_out


def metodo_markitdown(pdf_bytes: bytes, api_key: str) -> tuple[dict, float, int, int, str]:
    """PDF → markitdown → Gemini texto. Retorna (resultado, segundos, tokens_entrada, tokens_salida, markdown)."""
    from markitdown import MarkItDown

    # Paso 1: PDF → markdown
    t0 = time.perf_counter()
    md = MarkItDown()
    result = md.convert_stream(io.BytesIO(pdf_bytes), file_extension=".pdf")
    markdown_text = result.text_content
    t_md = time.perf_counter() - t0

    # Paso 2: markdown → Gemini (como texto)
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = PROMPT_GEMINI.format(fuente="pdf_markdown") + f"\n\nDOCUMENTO:\n---\n{markdown_text}\n---"

    t1 = time.perf_counter()
    response = model.generate_content(prompt)
    t_gemini = time.perf_counter() - t1
    duracion = t_md + t_gemini

    tok_in  = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
    tok_out = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        obj, _ = json.JSONDecoder().raw_decode(raw)
        data = obj
    data.setdefault("items", [])
    data.setdefault("impuestos", [])
    return data, duracion, tok_in, tok_out, markdown_text


def encontrar_archivos(carpeta: Path) -> tuple[Path | None, Path | None]:
    xml_path = pdf_path = None
    for f in carpeta.iterdir():
        ext = f.suffix.lower()
        if ext == ".xml":
            xml_path = f
        elif ext == ".pdf":
            pdf_path = f
    return xml_path, pdf_path


def tabla_comparacion(gt: dict, resultados: dict[str, dict]) -> str:
    """Genera tabla de comparación visual en texto."""
    metodos = list(resultados.keys())
    col_w = [max(20, len(m) + 2) for m in metodos]
    label_w = 18

    # Encabezado
    sep = "─" * (label_w + 2 + sum(col_w) + len(col_w) * 3)
    header = f"{'Campo':<{label_w}}  " + "  ".join(f"{m:<{w}}" for m, w in zip(metodos, col_w))
    lineas = [sep, header, sep]

    score_total  = {m: 0 for m in metodos}
    campos_total = len(CAMPOS_CLAVE)

    for campo_id, ruta, label in CAMPOS_CLAVE:
        gt_val = extraer_valor(gt, ruta)

        fila = f"{label:<{label_w}}  "
        for m, w in zip(metodos, col_w):
            cmp_data = resultados[m].get("data", {})
            cmp_val  = extraer_valor(cmp_data, ruta)
            ok       = comparar_campo(gt_val, cmp_val, campo_id)
            if ok:
                score_total[m] += 1

            # Truncar para la tabla
            display = str(cmp_val)
            if campo_id == "cufe" and len(display) > 16:
                display = display[:14] + "…"
            elif len(display) > w - 4:
                display = display[:w - 5] + "…"

            marca = "✓" if ok else "✗"
            celda = f"{marca} {display}"
            fila += f"{celda:<{w}}  "
        lineas.append(fila)

    # Ground truth separado
    lineas.append(sep)
    lineas.append(f"{'[GROUND TRUTH XML]':<{label_w}}  ")
    for campo_id, ruta, label in CAMPOS_CLAVE:
        gt_val = extraer_valor(gt, ruta)
        display = str(gt_val)
        if campo_id == "cufe" and len(display) > 40:
            display = display[:38] + "…"
        lineas.append(f"  {label:<{label_w - 2}}: {display}")

    # Exactitud
    lineas.append(sep)
    lineas.append("EXACTITUD POR CAMPO:")
    exactitud_fila = f"{'Exactitud':<{label_w}}  "
    for m, w in zip(metodos, col_w):
        pct = score_total[m] / campos_total * 100
        exactitud_fila += f"{pct:.0f}% ({score_total[m]}/{campos_total}){'':<{w - 10}}  "
    lineas.append(exactitud_fila)
    lineas.append(sep)

    return "\n".join(lineas)


def main():
    parser = argparse.ArgumentParser(description="Benchmark XML vs PDF Vision vs PDF markitdown")
    parser.add_argument("--carpeta", required=True, help="Carpeta de la factura a procesar")
    parser.add_argument("--verbose", action="store_true", help="Mostrar markdown extraído")
    parser.add_argument("--no-vision", action="store_true", help="Saltar método Vision (más rápido)")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        print("ERROR: Variable GEMINI_API_KEY no está definida.")
        print("  PowerShell: $env:GEMINI_API_KEY = 'tu-clave'")
        sys.exit(1)

    carpeta = Path(args.carpeta)
    if not carpeta.exists():
        print(f"ERROR: Carpeta no existe: {carpeta}")
        sys.exit(1)

    xml_path, pdf_path = encontrar_archivos(carpeta)
    if not xml_path:
        print(f"ERROR: No se encontró XML en {carpeta}")
        sys.exit(1)
    if not pdf_path:
        print(f"ERROR: No se encontró PDF en {carpeta}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  BENCHMARK - {carpeta.name}")
    print(f"{'='*60}")
    print(f"  XML: {xml_path.name} ({xml_path.stat().st_size // 1024} KB)")
    print(f"  PDF: {pdf_path.name} ({pdf_path.stat().st_size // 1024} KB)")
    print()

    resultados: dict[str, dict] = {}

    # ── Método 1: XML (ground truth) ─────────────────────────────────────────
    print("[1/3] XML DIAN (ground truth)...", end=" ", flush=True)
    t0 = time.perf_counter()
    try:
        xml_content = xml_path.read_text(encoding="utf-8", errors="ignore")
        gt = parse_xml(xml_content)
        dur_xml = time.perf_counter() - t0
        print(f"OK ({dur_xml*1000:.0f} ms)")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    # ── Método 2: PDF Vision ──────────────────────────────────────────────────
    pdf_bytes = pdf_path.read_bytes()

    if not args.no_vision:
        print("[2/3] PDF -> Gemini Vision...", end=" ", flush=True)
        try:
            data_v, dur_v, tok_in_v, tok_out_v = metodo_vision(pdf_bytes, api_key)
            print(f"OK ({dur_v:.1f}s | {tok_in_v:,} tokens entrada / {tok_out_v:,} salida)")
            resultados["PDF Vision"] = {
                "data": data_v, "duracion": dur_v,
                "tokens_entrada": tok_in_v, "tokens_salida": tok_out_v,
            }
        except Exception as e:
            print(f"ERROR: {e}")
            resultados["PDF Vision"] = {"data": {}, "duracion": 0, "tokens_entrada": 0, "tokens_salida": 0, "error": str(e)}
    else:
        print("[2/3] PDF Vision -> OMITIDO (--no-vision)")

    # ── Método 3: PDF markitdown ──────────────────────────────────────────────
    print("[3/3] PDF -> markitdown -> Gemini texto...", end=" ", flush=True)
    try:
        data_md, dur_md, tok_in_md, tok_out_md, markdown_text = metodo_markitdown(pdf_bytes, api_key)
        print(f"OK ({dur_md:.1f}s | {tok_in_md:,} tokens entrada / {tok_out_md:,} salida)")
        resultados["PDF Markdown"] = {
            "data": data_md, "duracion": dur_md,
            "tokens_entrada": tok_in_md, "tokens_salida": tok_out_md,
        }
    except Exception as e:
        print(f"ERROR: {e}")
        resultados["PDF Markdown"] = {"data": {}, "duracion": 0, "tokens_entrada": 0, "tokens_salida": 0, "error": str(e)}

    # ── Tabla comparativa ─────────────────────────────────────────────────────
    print()
    print(tabla_comparacion(gt, resultados))

    # ── Resumen de rendimiento ────────────────────────────────────────────────
    print("\nRENDIMIENTO:")
    print(f"  XML directo   : {dur_xml*1000:.0f} ms  |  0 tokens (sin IA)")
    for nombre, r in resultados.items():
        dur = r.get("duracion", 0)
        ti  = r.get("tokens_entrada", 0)
        to  = r.get("tokens_salida", 0)
        print(f"  {nombre:<14}: {dur:.1f}s  |  {ti:,} tok. entrada / {to:,} tok. salida")

    # ── Veredicto ─────────────────────────────────────────────────────────────
    if len(resultados) >= 2 and "PDF Vision" in resultados and "PDF Markdown" in resultados:
        print("\nVEREDICTO:")

        def score(nombre):
            r = resultados[nombre]
            s = sum(
                1 for campo_id, ruta, _ in CAMPOS_CLAVE
                if comparar_campo(extraer_valor(gt, ruta), extraer_valor(r.get("data", {}), ruta), campo_id)
            )
            return s / len(CAMPOS_CLAVE) * 100

        s_v  = score("PDF Vision")
        s_md = score("PDF Markdown")
        tok_v  = resultados["PDF Vision"].get("tokens_entrada", 0)
        tok_md = resultados["PDF Markdown"].get("tokens_entrada", 0)
        dur_v  = resultados["PDF Vision"].get("duracion", 0)
        dur_md = resultados["PDF Markdown"].get("duracion", 0)

        reduccion_tokens = (tok_v - tok_md) / tok_v * 100 if tok_v > 0 else 0
        diferencia_exactitud = s_md - s_v

        print(f"  Vision  : {s_v:.0f}% exactitud | {dur_v:.1f}s | {tok_v:,} tokens")
        print(f"  Markdown: {s_md:.0f}% exactitud | {dur_md:.1f}s | {tok_md:,} tokens")
        print(f"  Reducción de tokens: {reduccion_tokens:+.0f}%")
        print(f"  Diferencia de exactitud: {diferencia_exactitud:+.0f}pp")

        if diferencia_exactitud > 0:
            print(f"  → Markitdown gana en exactitud (+{diferencia_exactitud:.0f}pp)")
        elif diferencia_exactitud < 0:
            print(f"  → Vision gana en exactitud (+{-diferencia_exactitud:.0f}pp)")
        else:
            print("  → Empate en exactitud")

        if reduccion_tokens > 0:
            print(f"  → Markitdown usa {reduccion_tokens:.0f}% menos tokens (menor costo)")
        else:
            print(f"  → Vision usa menos tokens en este caso")

    # ── Verbose: markdown extraído ────────────────────────────────────────────
    if args.verbose and "markdown_text" in dir():
        print("\n" + "="*60)
        print("MARKDOWN EXTRAÍDO POR MARKITDOWN:")
        print("="*60)
        print(markdown_text[:3000])
        if len(markdown_text) > 3000:
            print(f"... [{len(markdown_text)} chars total]")

    print()


if __name__ == "__main__":
    main()
