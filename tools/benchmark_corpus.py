#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, os
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
"""
benchmark_corpus.py — Benchmark completo del corpus de 152 facturas.
Compara XML (ground truth) vs PDF Vision vs PDF Markitdown.

Caracteristicas:
  - Guarda incremental: cada fila se escribe al CSV al instante
  - Reanudable: si el CSV ya tiene una (carpeta, metodo) procesada, la salta
  - Tolerante a fallos: un error en una factura no aborta toda la corrida
  - Retry automatico en rate limit 429 de Gemini
  - Progreso [N/M] con ETA

Uso:
  python tools/benchmark_corpus.py --corpus "C:\\...\\Facturas" --limit 5
  python tools/benchmark_corpus.py --corpus "C:\\...\\Facturas"
  python tools/benchmark_corpus.py --corpus "C:\\...\\Facturas" --no-vision
"""

import argparse
import base64
import csv
import io
import json
import random
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

from groq import Groq

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv opcional; si no está instalado se usa la variable de entorno directamente

# ─────────────────────────────────────────────────────────────────────────────
# Configuracion
# ─────────────────────────────────────────────────────────────────────────────

CSV_SALIDA        = Path(__file__).parent / "resultados_benchmark.csv"
MODELO_GROQ       = "llama-3.1-8b-instant"   # texto: mayor calidad para extracción
MODELO_GROQ_VISION = "meta-llama/llama-4-scout-17b-16e-instruct"  # visión: imágenes
MAX_REINTENTOS = 6
PAUSA_MIN_ENTRE_LLAMADAS = 3

CAMPOS_CLAVE = [
    # (id_campo,      ruta_en_dict,             label_csv)
    ("numero",        "documento.numero",        "ok_numero"),
    ("cufe",          "documento.cufe",          "ok_cufe"),
    ("fecha",         "documento.fecha_emision", "ok_fecha"),
    ("nit_prov",      "proveedor.nit",           "ok_nit_prov"),
    ("nombre_prov",   "proveedor.nombre",        "ok_nombre_prov"),
    ("nit_cli",       "cliente.nit",             "ok_nit_cli"),
    ("total",         "totales.total_pagar",     "ok_total"),
    ("subtotal",      "totales.subtotal",        "ok_subtotal"),
    ("num_items",     "items.__len__",           "ok_num_items"),
    ("num_impuestos", "impuestos.__len__",       "ok_num_impuestos"),
]

COLUMNAS_CSV = (
    ["carpeta", "metodo", "exactitud_global"] +
    [c for _, _, c in CAMPOS_CLAVE] +
    ["tiempo_seg", "tokens_entrada", "tokens_salida", "error", "procesado_en"]
)

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
}

PROMPT_GEMINI = """Eres experto en facturacion electronica colombiana (DIAN).
Analiza el documento y extrae TODOS los datos con maxima precision.
Responde UNICAMENTE con JSON valido. Sin markdown, sin texto extra, sin bloques ```json.

{{
  "fuente": "{fuente}",
  "documento": {{"numero":"","tipo":"","cufe":"","fecha_emision":"YYYY-MM-DD","hora_emision":"","moneda":"COP","observaciones":""}},
  "proveedor": {{"nombre":"","nit":"","direccion":{{"linea":"","ciudad":""}},"email":"","telefono":""}},
  "cliente":   {{"nombre":"","nit":"","direccion":{{"ciudad":""}},"email":""}},
  "pago":      {{"forma":"","fecha_vencimiento":""}},
  "items":     [{{"numero_linea":"1","descripcion":"","cantidad":"","unidad":"","valor_unitario":"","valor_total":""}}],
  "impuestos": [{{"nombre":"IVA","porcentaje":"","base":"","valor":""}}],
  "totales":   {{"subtotal":"","total_con_impuesto":"","total_pagar":""}}
}}

REGLAS CRITICAS — leelas con atencion:

1. NUMERO DE FACTURA: es el ID del documento, tipicamente empieza con letras seguidas de numeros
   (ej: "FE-1234", "FV0001", "SETP123456"). Busca campos como "Factura No.", "No. Factura",
   "Numero", "Invoice No." o el identificador principal del documento. NO uses el CUFE como numero.

2. NIT — regla estricta:
   - Extrae SOLO los digitos numericos del NIT, SIN guion ni digito de verificacion.
   - Ejemplo: si ves "900123456-7" → escribe "900123456"
   - Ejemplo: si ves "800.123.456-1" → escribe "800123456"
   - El NIT del PROVEEDOR (emisor/vendedor) y el NIT del CLIENTE (receptor/comprador) son distintos.
   - Proveedor = quien EMITE la factura. Cliente = quien la RECIBE.

3. CUFE: cadena hexadecimal larga (96+ caracteres). Copiala completa y exacta sin espacios.

4. VALORES MONETARIOS: sin puntos de miles, con punto decimal (ej: 83300.00 no 83.300,00).

5. FECHA: formato YYYY-MM-DD siempre.

6. Campos ausentes o no encontrados: string vacio "". NUNCA uses null ni omitas la clave.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Parser XML (sin depender de Flask)
# ─────────────────────────────────────────────────────────────────────────────

def _t(el, path, default=""):
    node = el.find(path, NS)
    return (node.text or "").strip() if node is not None else default

def _a(el, path, attr, default=""):
    node = el.find(path, NS)
    return node.get(attr, default) if node is not None else default

def _parse_party(node):
    if node is None:
        return {"nombre": "", "nit": "", "direccion": {}, "email": "", "telefono": ""}
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
            "linea":   _t(dir_node, "cbc:Line"),
            "ciudad":  _t(dir_node, "cbc:CityName"),
        }
    return {
        "nombre":   nombre.strip(),
        "nit":      nit,
        "direccion": direccion,
        "email":    _t(node, "cac:Party/cac:Contact/cbc:ElectronicMail"),
        "telefono": _t(node, "cac:Party/cac:Contact/cbc:Telephone"),
    }

def parse_xml(xml_content: str) -> dict:
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

    return {
        "fuente": "xml",
        "documento": {
            "numero":        _t(inv, "cbc:ID"),
            "tipo":          _t(inv, "cbc:InvoiceTypeCode"),
            "cufe":          _t(inv, "cbc:UUID"),
            "fecha_emision": _t(inv, "cbc:IssueDate"),
            "hora_emision":  _t(inv, "cbc:IssueTime"),
            "moneda":        _t(inv, "cbc:DocumentCurrencyCode"),
            "observaciones": "",
        },
        "proveedor": _parse_party(inv.find("cac:AccountingSupplierParty", NS)),
        "cliente":   _parse_party(inv.find("cac:AccountingCustomerParty", NS)),
        "items":     items,
        "impuestos": impuestos,
        "totales":   totales,
    }

# ─────────────────────────────────────────────────────────────────────────────
# Comparacion de campos
# ─────────────────────────────────────────────────────────────────────────────

def extraer_valor(data: dict, ruta: str):
    if ruta.endswith(".__len__"):
        obj = data
        for p in ruta.split(".")[:-1]:
            if not isinstance(obj, dict):
                return 0
            obj = obj.get(p, [])
        return len(obj) if isinstance(obj, list) else 0
    obj = data
    for p in ruta.split("."):
        if not isinstance(obj, dict):
            return ""
        obj = obj.get(p, "")
    return obj or ""

def comparar_campo(gt_val, cmp_val, campo_id: str) -> bool:
    gt  = str(gt_val).strip()
    cmp = str(cmp_val).strip()
    if gt == cmp:
        return True
    if campo_id in ("total", "subtotal"):
        try:
            n_gt  = float(re.sub(r"[^\d.]", "", gt)  or "0")
            n_cmp = float(re.sub(r"[^\d.]", "", cmp) or "0")
            if n_gt == 0:
                return n_cmp == 0
            return abs(n_gt - n_cmp) / n_gt < 0.005
        except ValueError:
            return False
    if campo_id in ("num_items", "num_impuestos"):
        return str(gt) == str(cmp)
    if campo_id == "cufe":
        return len(gt) > 10 and len(cmp) > 10 and gt[:20].lower() == cmp[:20].lower()
    if campo_id == "nombre_prov":
        if not gt or not cmp:
            return False
        gt_n  = re.sub(r"[^\w\s]", "", gt.lower()).strip()
        cmp_n = re.sub(r"[^\w\s]", "", cmp.lower()).strip()
        return gt_n == cmp_n or gt_n in cmp_n or cmp_n in gt_n
    return False

def calcular_scores(gt: dict, resultado: dict) -> dict[str, int]:
    """Retorna {label_csv: 1|0} por cada campo."""
    scores = {}
    for campo_id, ruta, label in CAMPOS_CLAVE:
        gt_val  = extraer_valor(gt, ruta)
        cmp_val = extraer_valor(resultado, ruta)
        scores[label] = 1 if comparar_campo(gt_val, cmp_val, campo_id) else 0
    return scores

# ─────────────────────────────────────────────────────────────────────────────
# Metodos Gemini con retry
# ─────────────────────────────────────────────────────────────────────────────

_ultimo_llamada_groq = 0.0  # timestamp de la ultima llamada

def _respetar_pausa():
    """Espera el minimo necesario entre llamadas Groq para no superar el rate limit."""
    global _ultimo_llamada_groq
    transcurrido = time.perf_counter() - _ultimo_llamada_groq
    if transcurrido < PAUSA_MIN_ENTRE_LLAMADAS:
        falta = PAUSA_MIN_ENTRE_LLAMADAS - transcurrido
        print(f" [pausa {falta:.0f}s rate-limit]", end="", flush=True)
        time.sleep(falta)
    _ultimo_llamada_groq = time.perf_counter()

def _llamar_groq(fn, *args, **kwargs):
    """Llama fn(*args) con retry ante 429. Gestiona la pausa de rate limit."""
    global _ultimo_llamada_groq
    for intento in range(MAX_REINTENTOS):
        _respetar_pausa()
        try:
            result = fn(*args, **kwargs)
            _ultimo_llamada_groq = time.perf_counter()
            return result
        except Exception as e:
            err = str(e)
            es_rate_limit = "429" in err or "rate_limit" in err.lower() or "rate limit" in err.lower()
            if es_rate_limit:
                m = re.search(r"try again in (\d+(?:\.\d+)?)s", err, re.IGNORECASE)
                delay = float(m.group(1)) + 2 if m else 30
                print(f" [429, esperando {delay:.0f}s...]", end="", flush=True)
                time.sleep(delay)
                _ultimo_llamada_groq = 0.0  # forzar pausa completa
            else:
                raise
    raise Exception(f"Rate limit persistente tras {MAX_REINTENTOS} reintentos")

def _parse_json_llm(texto: str) -> dict:
    """Limpia y parsea el JSON que devuelve el LLM, tolerando texto sobrante."""
    texto = re.sub(r"^```(?:json)?\s*", "", texto.strip(), flags=re.MULTILINE)
    texto = re.sub(r"\s*```$",          "", texto.strip(), flags=re.MULTILINE)
    texto = texto.strip()

    # Intento 1: JSON limpio
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        pass

    # Intento 2: raw_decode ignora texto sobrante tras el primer objeto JSON
    try:
        obj, _ = json.JSONDecoder().raw_decode(texto)
        return obj
    except json.JSONDecodeError:
        pass

    # Intento 3: extraer primer bloque {...} completo
    m = re.search(r"\{.*\}", texto, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"JSON invalido del LLM: {texto[:200]}")

def _get_client(api_key: str) -> Groq:
    return Groq(api_key=api_key)

def metodo_vision(img_bytes: bytes, api_key: str, mime: str = "image/jpeg") -> tuple[dict, float, int, int]:
    client = _get_client(api_key)
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    prompt = PROMPT_GEMINI.format(fuente="img_vision")

    def _llamada():
        t0 = time.perf_counter()
        resp = client.chat.completions.create(
            model=MODELO_GROQ_VISION,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": prompt},
                ],
            }],
            temperature=0,
        )
        dur = time.perf_counter() - t0
        tok_in  = getattr(resp.usage, "prompt_tokens",     0) or 0
        tok_out = getattr(resp.usage, "completion_tokens", 0) or 0
        texto   = resp.choices[0].message.content or ""
        data = _parse_json_llm(texto)
        data.setdefault("items",     [])
        data.setdefault("impuestos", [])
        return data, dur, tok_in, tok_out

    return _llamar_groq(_llamada)

def metodo_markitdown(pdf_bytes: bytes, api_key: str) -> tuple[dict, float, int, int]:
    from markitdown import MarkItDown

    t0 = time.perf_counter()
    md_result = MarkItDown().convert_stream(io.BytesIO(pdf_bytes), file_extension=".pdf")
    markdown_text = md_result.text_content
    t_md = time.perf_counter() - t0

    client = _get_client(api_key)
    prompt = PROMPT_GEMINI.format(fuente="pdf_markdown") + f"\n\nDOCUMENTO:\n---\n{markdown_text}\n---"

    def _llamada():
        t1 = time.perf_counter()
        resp = client.chat.completions.create(
            model=MODELO_GROQ,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        dur_total = t_md + (time.perf_counter() - t1)
        tok_in  = getattr(resp.usage, "prompt_tokens",     0) or 0
        tok_out = getattr(resp.usage, "completion_tokens", 0) or 0
        texto   = resp.choices[0].message.content or ""
        data = _parse_json_llm(texto)
        data.setdefault("items",     [])
        data.setdefault("impuestos", [])
        return data, dur_total, tok_in, tok_out

    return _llamar_groq(_llamada)

# ─────────────────────────────────────────────────────────────────────────────
# CSV incremental
# ─────────────────────────────────────────────────────────────────────────────

def cargar_procesados(csv_path: Path) -> set[tuple[str, str]]:
    """Devuelve conjunto de (carpeta, metodo) ya presentes en el CSV."""
    procesados = set()
    if not csv_path.exists():
        return procesados
    with open(csv_path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            procesados.add((row["carpeta"], row["metodo"]))
    return procesados

def abrir_csv(csv_path: Path) -> tuple[csv.DictWriter, object]:
    """Abre el CSV en modo append. Escribe header si es nuevo."""
    es_nuevo = not csv_path.exists() or csv_path.stat().st_size == 0
    f = open(csv_path, "a", encoding="utf-8", newline="")
    writer = csv.DictWriter(f, fieldnames=COLUMNAS_CSV, extrasaction="ignore")
    if es_nuevo:
        writer.writeheader()
        f.flush()
    return writer, f

def escribir_fila(writer, f, carpeta: str, metodo: str, scores: dict,
                  exactitud: float, tiempo: float, tok_in: int, tok_out: int,
                  error: str = ""):
    fila = {
        "carpeta":          carpeta,
        "metodo":           metodo,
        "exactitud_global": f"{exactitud:.4f}",
        "tiempo_seg":       f"{tiempo:.3f}",
        "tokens_entrada":   tok_in,
        "tokens_salida":    tok_out,
        "error":            error,
        "procesado_en":     datetime.utcnow().isoformat() + "Z",
    }
    fila.update(scores)
    writer.writerow(fila)
    f.flush()

def scores_xml_perfectos() -> dict[str, int]:
    """El XML es ground truth: todos los campos son 1."""
    return {label: 1 for _, _, label in CAMPOS_CLAVE}

def scores_vacios() -> dict[str, int]:
    """Fila de error: todos los campos son 0."""
    return {label: 0 for _, _, label in CAMPOS_CLAVE}

# ─────────────────────────────────────────────────────────────────────────────
# Progreso y ETA
# ─────────────────────────────────────────────────────────────────────────────

def fmt_eta(segundos: float) -> str:
    if segundos < 60:
        return f"{segundos:.0f}s"
    elif segundos < 3600:
        return f"{segundos/60:.0f}min"
    else:
        h = int(segundos // 3600)
        m = int((segundos % 3600) // 60)
        return f"{h}h{m:02d}min"

def barra_progreso(actual: int, total: int, inicio: float, completados: int) -> str:
    pct = actual / total * 100
    bloques = int(pct / 5)
    barra = "#" * bloques + "-" * (20 - bloques)
    eta_str = ""
    if completados > 0:
        transcurrido = time.perf_counter() - inicio
        por_factura = transcurrido / completados
        restantes = (total - actual) * por_factura
        eta_str = f" ETA:{fmt_eta(restantes)}"
    return f"[{actual:>3}/{total}] [{barra}] {pct:.0f}%{eta_str}"

# ─────────────────────────────────────────────────────────────────────────────
# Resumen final
# ─────────────────────────────────────────────────────────────────────────────

def imprimir_resumen(csv_path: Path):
    if not csv_path.exists():
        return

    filas = []
    with open(csv_path, encoding="utf-8", newline="") as f:
        filas = list(csv.DictReader(f))

    if not filas:
        return

    metodos = ["img_vision", "pdf_markdown"]
    print()
    print("=" * 65)
    print("  RESUMEN AGREGADO")
    print("=" * 65)

    for metodo in metodos:
        rows = [r for r in filas if r["metodo"] == metodo and not r["error"]]
        if not rows:
            continue

        n = len(rows)
        exactitud_prom = sum(float(r["exactitud_global"]) for r in rows) / n
        tiempo_prom    = sum(float(r["tiempo_seg"])       for r in rows) / n
        tok_in_prom    = sum(int(r["tokens_entrada"])     for r in rows) / n
        tok_out_prom   = sum(int(r["tokens_salida"])      for r in rows) / n

        label = "Imagen Vision" if metodo == "img_vision" else "PDF Markdown "
        print(f"\n  {label} ({n} facturas procesadas):")
        print(f"    Exactitud promedio  : {exactitud_prom*100:.1f}%")
        print(f"    Tiempo promedio     : {tiempo_prom:.1f}s")
        print(f"    Tokens entrada prom : {tok_in_prom:,.0f}")
        print(f"    Tokens salida prom  : {tok_out_prom:,.0f}")

        fallas = {}
        for _, _, label_col in CAMPOS_CLAVE:
            ok = sum(int(r.get(label_col, 0)) for r in rows)
            fallas[label_col] = 1 - ok / n
        top3_fallas = sorted(fallas.items(), key=lambda x: -x[1])[:3]
        print(f"    Campos con mas fallos:")
        for campo, tasa in top3_fallas:
            print(f"      {campo:<20} {tasa*100:.0f}% de error")

        errores = [r for r in filas if r["metodo"] == metodo and r["error"]]
        if errores:
            print(f"    Facturas con error  : {len(errores)}")

    # Comparacion entre metodos
    v_rows  = [r for r in filas if r["metodo"] == "img_vision"  and not r["error"]]
    md_rows = [r for r in filas if r["metodo"] == "pdf_markdown" and not r["error"]]
    if v_rows and md_rows:
        v_acc  = sum(float(r["exactitud_global"]) for r in v_rows)  / len(v_rows)
        md_acc = sum(float(r["exactitud_global"]) for r in md_rows) / len(md_rows)
        v_t    = sum(float(r["tiempo_seg"])       for r in v_rows)  / len(v_rows)
        md_t   = sum(float(r["tiempo_seg"])       for r in md_rows) / len(md_rows)
        print()
        print("  COMPARACION DIRECTA:")
        ganador_acc = "Vision" if v_acc > md_acc else ("Markdown" if md_acc > v_acc else "Empate")
        ganador_vel = "Markdown" if md_t < v_t else "Vision"
        print(f"    Exactitud: Vision={v_acc*100:.1f}% vs Markdown={md_acc*100:.1f}% -> Gana {ganador_acc}")
        print(f"    Velocidad: Vision={v_t:.1f}s  vs Markdown={md_t:.1f}s  -> Gana {ganador_vel}")
        tok_v_prom  = sum(int(r["tokens_entrada"]) for r in v_rows)  / len(v_rows)
        tok_md_prom = sum(int(r["tokens_entrada"]) for r in md_rows) / len(md_rows)
        print(f"    Tokens:   Vision={tok_v_prom:,.0f} vs Markdown={tok_md_prom:,.0f}")

    print("=" * 65)
    print(f"  CSV: {csv_path}")
    print("=" * 65)

# ─────────────────────────────────────────────────────────────────────────────
# Loop principal
# ─────────────────────────────────────────────────────────────────────────────

def encontrar_archivos(carpeta: Path) -> tuple[Path | None, Path | None, Path | None]:
    xml_path = pdf_path = img_path = None
    for f in carpeta.iterdir():
        ext = f.suffix.lower()
        if ext == ".xml" and xml_path is None:
            xml_path = f
        elif ext == ".pdf" and pdf_path is None:
            pdf_path = f
        elif ext in (".jpg", ".jpeg", ".png") and img_path is None:
            img_path = f
    return xml_path, pdf_path, img_path

def procesar_corpus(corpus: Path, api_key: str, csv_path: Path,
                    limit: int, sin_vision: bool, sample: int = 0, seed: int = 42):

    carpetas = sorted([d for d in corpus.iterdir() if d.is_dir()])
    if sample:
        random.seed(seed)
        carpetas = random.sample(carpetas, min(sample, len(carpetas)))
        carpetas = sorted(carpetas)
    elif limit:
        carpetas = carpetas[:limit]
    total = len(carpetas)

    procesados = cargar_procesados(csv_path)
    ya_procesadas = len({c for c, _ in procesados})
    writer, csv_file = abrir_csv(csv_path)

    print(f"\nCorpus: {corpus}")
    print(f"Facturas a procesar: {total} | Ya en CSV: {ya_procesadas} | Salida: {csv_path.name}")
    if sin_vision:
        print("Modo: solo PDF Markdown (--no-vision)")
    else:
        print("Modo: PDF Markdown + Imagen Vision")

    print("Pausa inicial 5s...", end="", flush=True)
    time.sleep(5)
    print(" listo.")
    print()

    inicio = time.perf_counter()
    completados = 0

    try:
        for i, carpeta in enumerate(carpetas, 1):
            nombre = carpeta.name

            # ── Encontrar archivos ──────────────────────────────────────────
            try:
                xml_path, pdf_path, img_path = encontrar_archivos(carpeta)
            except Exception as e:
                print(f"{barra_progreso(i, total, inicio, completados)} {nombre[:30]}")
                print(f"  ERROR iterando carpeta: {e}")
                continue

            if not xml_path:
                print(f"{barra_progreso(i, total, inicio, completados)} {nombre[:30]} | sin XML, saltando")
                continue

            # ── Metodo XML (ground truth) ───────────────────────────────────
            gt = None
            if (nombre, "xml") not in procesados:
                try:
                    t0 = time.perf_counter()
                    xml_content = xml_path.read_text(encoding="utf-8", errors="ignore")
                    gt = parse_xml(xml_content)
                    dur_xml = time.perf_counter() - t0
                    scores = scores_xml_perfectos()
                    escribir_fila(writer, csv_file, nombre, "xml",
                                  scores, 1.0, dur_xml, 0, 0)
                    procesados.add((nombre, "xml"))
                    estado_xml = f"XML:{dur_xml*1000:.0f}ms"
                except Exception as e:
                    escribir_fila(writer, csv_file, nombre, "xml",
                                  scores_vacios(), 0.0, 0, 0, 0, str(e)[:120])
                    procesados.add((nombre, "xml"))
                    estado_xml = "XML:ERR"
            else:
                try:
                    xml_content = xml_path.read_text(encoding="utf-8", errors="ignore")
                    gt = parse_xml(xml_content)
                except Exception:
                    gt = None
                estado_xml = "XML:skip"

            if gt is None:
                print(f"{barra_progreso(i, total, inicio, completados)} {nombre[:30]} | {estado_xml} | sin GT, saltando IA")
                completados += 1
                continue

            estado_v = estado_md = "skip"

            # ── Metodo Vision (imagen JPG/PNG) ──────────────────────────────
            if not sin_vision:
                if img_path and (nombre, "img_vision") not in procesados:
                    try:
                        mime = "image/png" if img_path.suffix.lower() == ".png" else "image/jpeg"
                        data_v, dur_v, tok_in_v, tok_out_v = metodo_vision(
                            img_path.read_bytes(), api_key, mime
                        )
                        scores = calcular_scores(gt, data_v)
                        exactitud = sum(scores.values()) / len(CAMPOS_CLAVE)
                        escribir_fila(writer, csv_file, nombre, "img_vision",
                                      scores, exactitud, dur_v, tok_in_v, tok_out_v)
                        procesados.add((nombre, "img_vision"))
                        estado_v = f"V:{exactitud*100:.0f}%({dur_v:.0f}s)"
                    except Exception as e:
                        escribir_fila(writer, csv_file, nombre, "img_vision",
                                      scores_vacios(), 0.0, 0, 0, 0, str(e)[:120])
                        procesados.add((nombre, "img_vision"))
                        estado_v = "V:ERR"
                elif not img_path and not sin_vision:
                    estado_v = "V:sinIMG"
                else:
                    estado_v = "V:skip"

            # ── Metodo Markitdown (PDF) ─────────────────────────────────────
            if pdf_path:
                if (nombre, "pdf_markdown") not in procesados:
                    try:
                        data_md, dur_md, tok_in_md, tok_out_md = metodo_markitdown(
                            pdf_path.read_bytes(), api_key
                        )
                        scores = calcular_scores(gt, data_md)
                        exactitud = sum(scores.values()) / len(CAMPOS_CLAVE)
                        escribir_fila(writer, csv_file, nombre, "pdf_markdown",
                                      scores, exactitud, dur_md, tok_in_md, tok_out_md)
                        procesados.add((nombre, "pdf_markdown"))
                        estado_md = f"MD:{exactitud*100:.0f}%({dur_md:.0f}s)"
                    except Exception as e:
                        escribir_fila(writer, csv_file, nombre, "pdf_markdown",
                                      scores_vacios(), 0.0, 0, 0, 0, str(e)[:120])
                        procesados.add((nombre, "pdf_markdown"))
                        estado_md = "MD:ERR"
                else:
                    estado_md = "MD:skip"
            else:
                estado_md = "MD:sinPDF"

            completados += 1
            print(f"{barra_progreso(i, total, inicio, completados)} {nombre[:28]:<28} | {estado_xml} | {estado_v} | {estado_md}")

    finally:
        csv_file.close()

    imprimir_resumen(csv_path)

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Modo imágenes sueltas (sin ground truth XML)
# ─────────────────────────────────────────────────────────────────────────────

def procesar_imagenes_sueltas(corpus: Path, api_key: str, csv_path: Path):
    """Procesa imágenes JPG/PNG sueltas en la raíz del corpus, sin comparar con XML."""
    extensiones = {".jpg", ".jpeg", ".png"}
    imagenes = sorted([f for f in corpus.iterdir() if f.suffix.lower() in extensiones])

    if not imagenes:
        print("No se encontraron imágenes JPG/PNG en la raíz del corpus.")
        return

    # CSV propio para imágenes — columnas simples
    campos_img = ["archivo", "numero", "cufe", "fecha_emision", "nit_prov", "nombre_prov",
                  "nit_cli", "nombre_cli", "total_pagar", "subtotal", "num_items",
                  "num_impuestos", "tiempo_seg", "tokens_entrada", "tokens_salida",
                  "error", "procesado_en"]

    es_nuevo = not csv_path.exists() or csv_path.stat().st_size == 0
    csv_file  = open(csv_path, "a", encoding="utf-8", newline="")
    writer    = csv.DictWriter(csv_file, fieldnames=campos_img, extrasaction="ignore")
    if es_nuevo:
        writer.writeheader()
        csv_file.flush()

    # Cargar ya procesadas
    procesadas = set()
    if not es_nuevo:
        csv_file_r = open(csv_path, encoding="utf-8", newline="")
        for row in csv.DictReader(csv_file_r):
            procesadas.add(row["archivo"])
        csv_file_r.close()

    total = len(imagenes)
    print(f"\nCorpus: {corpus}")
    print(f"Imágenes encontradas: {total} | Ya procesadas: {len(procesadas)}")
    print(f"Modelo visión: {MODELO_GROQ_VISION}")
    print(f"Salida: {csv_path.name}\n")

    for i, img_path in enumerate(imagenes, 1):
        nombre = img_path.name
        print(f"[{i:2}/{total}] {nombre:<35}", end="", flush=True)

        if nombre in procesadas:
            print(" skip")
            continue

        try:
            mime = "image/png" if img_path.suffix.lower() == ".png" else "image/jpeg"
            data, dur, tok_in, tok_out = metodo_vision(img_path.read_bytes(), api_key, mime)

            fila = {
                "archivo":        nombre,
                "numero":         data.get("documento", {}).get("numero", ""),
                "cufe":           data.get("documento", {}).get("cufe", ""),
                "fecha_emision":  data.get("documento", {}).get("fecha_emision", ""),
                "nit_prov":       data.get("proveedor",  {}).get("nit", ""),
                "nombre_prov":    data.get("proveedor",  {}).get("nombre", ""),
                "nit_cli":        data.get("cliente",    {}).get("nit", ""),
                "nombre_cli":     data.get("cliente",    {}).get("nombre", ""),
                "total_pagar":    data.get("totales",    {}).get("total_pagar", ""),
                "subtotal":       data.get("totales",    {}).get("subtotal", ""),
                "num_items":      len(data.get("items",     [])),
                "num_impuestos":  len(data.get("impuestos", [])),
                "tiempo_seg":     f"{dur:.3f}",
                "tokens_entrada": tok_in,
                "tokens_salida":  tok_out,
                "error":          "",
                "procesado_en":   datetime.utcnow().isoformat() + "Z",
            }
            writer.writerow(fila)
            csv_file.flush()
            print(f" OK  {dur:.1f}s | prov={fila['nombre_prov'][:20]} | total={fila['total_pagar']}")

        except Exception as e:
            writer.writerow({
                "archivo": nombre, "error": str(e)[:150],
                "procesado_en": datetime.utcnow().isoformat() + "Z",
            })
            csv_file.flush()
            print(f" ERR {str(e)[:60]}")

    csv_file.close()
    print(f"\nCSV guardado: {csv_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Benchmark corpus completo: XML vs PDF Vision vs PDF Markdown"
    )
    parser.add_argument("--corpus",        required=True, help="Carpeta raiz del corpus")
    parser.add_argument("--limit",         type=int, default=0, help="Procesar solo primeras N facturas (0=todas)")
    parser.add_argument("--sample",        type=int, default=0, help="Muestra aleatoria de N facturas (0=no muestrear)")
    parser.add_argument("--seed",          type=int, default=42, help="Seed para la muestra aleatoria (default: 42)")
    parser.add_argument("--no-vision",     action="store_true", help="Saltar metodo imagen Vision")
    parser.add_argument("--solo-imagenes", action="store_true", help="Procesar solo las imagenes JPG/PNG sueltas en la raiz")
    parser.add_argument("--csv",           default=str(CSV_SALIDA), help="Ruta del CSV de salida")
    args = parser.parse_args()

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        print("ERROR: GROQ_API_KEY no definida.")
        print("  PowerShell: $env:GROQ_API_KEY = 'gsk_...'")
        print("  O crea un archivo .env con GROQ_API_KEY=... en la raiz del proyecto")
        sys.exit(1)

    corpus = Path(args.corpus)
    if not corpus.exists():
        print(f"ERROR: Corpus no existe: {corpus}")
        sys.exit(1)

    csv_path = Path(args.csv)

    if args.solo_imagenes:
        procesar_imagenes_sueltas(corpus, api_key, csv_path)
    else:
        procesar_corpus(corpus, api_key, csv_path, args.limit, args.no_vision, args.sample, args.seed)


if __name__ == "__main__":
    main()
