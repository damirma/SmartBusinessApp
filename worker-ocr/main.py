from flask import Flask, request, jsonify
from flask_cors import CORS
import os, re, json, base64, xml.etree.ElementTree as ET
from datetime import datetime

app = Flask(__name__)
CORS(app)

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
}

MODELO_GEMINI = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# ── Helpers XML ───────────────────────────────────────────────────────────────

def t(el, path, default=""):
    node = el.find(path, NS)
    return (node.text or "").strip() if node is not None else default

def a(el, path, attr, default=""):
    node = el.find(path, NS)
    return node.get(attr, default) if node is not None else default

def parse_party(node):
    if node is None:
        return {}
    nombre = (
        t(node, "cac:Party/cac:PartyName/cbc:Name") or
        t(node, "cac:Party/cac:PartyTaxScheme/cbc:RegistrationName") or
        t(node, "cac:Party/cac:PartyLegalEntity/cbc:RegistrationName")
    )
    nit = (
        t(node, "cac:Party/cac:PartyTaxScheme/cbc:CompanyID") or
        t(node, "cac:Party/cac:PartyLegalEntity/cbc:CompanyID")
    )
    dir_node = (
        node.find("cac:Party/cac:PhysicalLocation/cac:Address", NS) or
        node.find("cac:Party/cac:PostalAddress", NS)
    )
    direccion = {}
    if dir_node is not None:
        direccion = {
            "linea":        t(dir_node, "cbc:Line"),
            "ciudad":       t(dir_node, "cbc:CityName"),
            "departamento": t(dir_node, "cbc:CountrySubentity"),
        }
    return {
        "nombre":    nombre.strip(),
        "nit":       nit,
        "direccion": direccion,
        "email":     t(node, "cac:Party/cac:Contact/cbc:ElectronicMail"),
        "telefono":  t(node, "cac:Party/cac:Contact/cbc:Telephone"),
    }

def parse_xml(xml_content):
    root = ET.fromstring(
        xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content
    )
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    if tag == "AttachedDocument":
        desc = root.find(".//cac:Attachment/cac:ExternalReference/cbc:Description", NS)
        if desc is None or not desc.text:
            raise ValueError("AttachedDocument sin Invoice embebida")
        inv = ET.fromstring(desc.text.strip().encode("utf-8"))
    elif tag in ("Invoice", "CreditNote", "DebitNote"):
        inv = root
    else:
        raise ValueError(f"Tipo XML no reconocido: {tag}")

    # InvoiceLine / CreditNoteLine / DebitNoteLine
    line_tag = "cac:InvoiceLine"
    qty_tag  = "cbc:InvoicedQuantity"
    inv_tag  = inv.tag.split("}")[-1] if "}" in inv.tag else inv.tag
    if inv_tag == "CreditNote":
        line_tag, qty_tag = "cac:CreditNoteLine", "cbc:CreditedQuantity"
    elif inv_tag == "DebitNote":
        line_tag, qty_tag = "cac:DebitNoteLine", "cbc:DebitedQuantity"

    ctrl = inv.find(".//sts:InvoiceControl", NS)
    autorizacion = {}
    if ctrl is not None:
        autorizacion = {
            "numero":       t(ctrl, "sts:InvoiceAuthorization"),
            "prefijo":      t(ctrl, "sts:AuthorizedInvoices/sts:Prefix"),
            "desde":        t(ctrl, "sts:AuthorizationPeriod/cbc:StartDate"),
            "hasta":        t(ctrl, "sts:AuthorizationPeriod/cbc:EndDate"),
            "rango_desde":  t(ctrl, "sts:AuthorizedInvoices/sts:From"),
            "rango_hasta":  t(ctrl, "sts:AuthorizedInvoices/sts:To"),
        }

    items = []
    for line in inv.findall(line_tag, NS):
        items.append({
            "numero_linea":   t(line, "cbc:ID"),
            "descripcion":    t(line, "cac:Item/cbc:Description"),
            "cantidad":       t(line, qty_tag),
            "unidad":         a(line, qty_tag, "unitCode"),
            "valor_unitario": t(line, "cac:Price/cbc:PriceAmount"),
            "valor_total":    t(line, "cbc:LineExtensionAmount"),
        })

    impuestos = []
    for tt in inv.findall("cac:TaxTotal", NS):
        for sub in tt.findall("cac:TaxSubtotal", NS):
            impuestos.append({
                "nombre":     t(sub, "cac:TaxCategory/cac:TaxScheme/cbc:Name"),
                "porcentaje": t(sub, "cac:TaxCategory/cbc:Percent"),
                "base":       t(sub, "cbc:TaxableAmount"),
                "valor":      t(sub, "cbc:TaxAmount"),
            })

    lma = inv.find("cac:LegalMonetaryTotal", NS)
    if lma is None:
        lma = inv.find("cac:RequestedMonetaryTotal", NS)
    totales = {}
    if lma is not None:
        totales = {
            "subtotal":           t(lma, "cbc:LineExtensionAmount"),
            "total_con_impuesto": t(lma, "cbc:TaxInclusiveAmount"),
            "total_pagar":        t(lma, "cbc:PayableAmount"),
        }

    qr_raw = t(inv, ".//sts:QRCode")
    qr_url = ""
    if qr_raw:
        m = re.search(r"QRCode:\s*(https?://\S+)", qr_raw)
        if m:
            qr_url = m.group(1)

    pmt = inv.find("cac:PaymentMeans", NS)
    pago = {}
    if pmt is not None:
        codigo = t(pmt, "cbc:PaymentMeansCode")
        pago = {
            "forma":             {"1": "Contado", "2": "Crédito"}.get(codigo, codigo),
            "fecha_vencimiento": t(pmt, "cbc:PaymentDueDate"),
        }

    return {
        "fuente":       "xml",
        "procesado_en": datetime.utcnow().isoformat() + "Z",
        "documento": {
            "numero":            t(inv, "cbc:ID"),
            "tipo":              t(inv, "cbc:InvoiceTypeCode") or inv_tag,
            "cufe":              t(inv, "cbc:UUID"),
            "fecha_emision":     t(inv, "cbc:IssueDate"),
            "hora_emision":      t(inv, "cbc:IssueTime"),
            "moneda":            t(inv, "cbc:DocumentCurrencyCode"),
            "observaciones":     " | ".join(
                n.text.strip() for n in inv.findall("cbc:Note", NS)
                if n.text and n.text.strip()
            ),
            "autorizacion_dian": autorizacion,
            "url_verificacion":  qr_url,
        },
        "proveedor": parse_party(inv.find("cac:AccountingSupplierParty", NS)),
        "cliente":   parse_party(inv.find("cac:AccountingCustomerParty", NS)),
        "pago":      pago,
        "items":     items,
        "impuestos": impuestos,
        "totales":   totales,
    }


# ── IA: Gemini (PDF e imagen) ─────────────────────────────────────────────────

PROMPT_FACTURA = """Eres experto en facturacion electronica colombiana (DIAN).
Analiza el documento y extrae TODOS los datos con maxima precision.
Responde UNICAMENTE con JSON valido. Sin markdown, sin texto extra.

{
  "documento": {"numero":"","tipo":"","cufe":"","fecha_emision":"YYYY-MM-DD","hora_emision":"","moneda":"COP","observaciones":""},
  "proveedor": {"nombre":"","nit":"","direccion":{"linea":"","ciudad":""},"email":"","telefono":""},
  "cliente":   {"nombre":"","nit":"","direccion":{"ciudad":""},"email":""},
  "pago":      {"forma":"","fecha_vencimiento":""},
  "items":     [{"numero_linea":"1","descripcion":"","cantidad":"","unidad":"","valor_unitario":"","valor_total":""}],
  "impuestos": [{"nombre":"IVA","porcentaje":"","base":"","valor":""}],
  "totales":   {"subtotal":"","total_con_impuesto":"","total_pagar":""}
}

REGLAS CRITICAS:
1. NUMERO DE FACTURA: es el ID del documento (ej "FE-1234", "FV0001", "SETP123456").
   Busca "Factura No.", "No. Factura", "Numero". NO uses el CUFE como numero.
2. NIT: SOLO los digitos, SIN guion ni digito de verificacion (ej "900123456-7" -> "900123456").
   Proveedor = quien EMITE. Cliente = quien RECIBE. Son distintos.
3. CUFE: cadena hexadecimal larga (96+ chars). Copiala completa y exacta sin espacios.
4. VALORES MONETARIOS: sin puntos de miles, con punto decimal (ej 83300.00 no 83.300,00).
5. FECHA: formato YYYY-MM-DD siempre.
6. Campos ausentes: string vacio "". NUNCA null ni omitas la clave."""


def _gemini_model(api_key):
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(MODELO_GEMINI)


def _extraer_json(texto):
    texto = re.sub(r"^```(?:json)?\s*", "", texto.strip(), flags=re.MULTILINE)
    texto = re.sub(r"\s*```$", "", texto.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", texto, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise ValueError(f"JSON invalido de Gemini: {texto[:200]}")


def parse_documento_gemini(doc_bytes, mime_type, api_key, fuente):
    model = _gemini_model(api_key)
    resp = model.generate_content(
        [
            {"mime_type": mime_type, "data": doc_bytes},
            PROMPT_FACTURA,
        ],
        generation_config={
            "temperature": 0,
            "response_mime_type": "application/json",
            "max_output_tokens": 8192,
        },
    )
    data = _extraer_json(resp.text or "")
    data.setdefault("items", [])
    data.setdefault("impuestos", [])
    data["procesado_en"] = datetime.utcnow().isoformat() + "Z"
    data["fuente"] = fuente
    return data


# ── Supabase ──────────────────────────────────────────────────────────────────

def guardar_en_supabase(data, canal="app"):
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL o SUPABASE_KEY no configuradas")

    sb = create_client(url, key)

    cliente_nit    = data.get("cliente", {}).get("nit", "")
    cliente_nombre = data.get("cliente", {}).get("nombre", "")

    pyme_id = None
    if cliente_nit:
        res = sb.table("pymes").select("id").eq("nit", cliente_nit).execute()
        if res.data:
            pyme_id = res.data[0]["id"]
        else:
            nueva = sb.table("pymes").insert({
                "nombre": cliente_nombre or f"PyME {cliente_nit}",
                "nit":    cliente_nit,
            }).execute()
            pyme_id = nueva.data[0]["id"]

    doc       = data.get("documento", {})
    totales   = data.get("totales", {})
    proveedor = data.get("proveedor", {})

    def to_float(v):
        try:
            return float(v) if v else 0.0
        except Exception:
            return 0.0

    subtotal    = to_float(totales.get("subtotal"))
    total_imp   = to_float(totales.get("total_con_impuesto")) - subtotal
    total_pagar = to_float(totales.get("total_pagar"))

    factura_res = sb.table("facturas").insert({
        "pyme_id":          pyme_id,
        "numero":           doc.get("numero", ""),
        "tipo":             doc.get("tipo", ""),
        "cufe":             doc.get("cufe", ""),
        "fecha_emision":    doc.get("fecha_emision") or None,
        "moneda":           doc.get("moneda", "COP"),
        "fuente":           data.get("fuente", ""),
        "canal":            canal,
        "estado":           "procesada",
        "proveedor_nombre": proveedor.get("nombre", ""),
        "proveedor_nit":    proveedor.get("nit", ""),
        "cliente_nombre":   cliente_nombre,
        "cliente_nit":      cliente_nit,
        "subtotal":         subtotal,
        "total_impuestos":  total_imp,
        "total_pagar":      total_pagar,
        "raw_json":         data,
    }).execute()
    factura_id = factura_res.data[0]["id"]

    for item in data.get("items", []):
        sb.table("factura_items").insert({
            "factura_id":     factura_id,
            "numero_linea":   item.get("numero_linea", ""),
            "descripcion":    item.get("descripcion", ""),
            "cantidad":       to_float(item.get("cantidad")),
            "unidad":         item.get("unidad", ""),
            "valor_unitario": to_float(item.get("valor_unitario")),
            "valor_total":    to_float(item.get("valor_total")),
        }).execute()

    for imp in data.get("impuestos", []):
        sb.table("factura_impuestos").insert({
            "factura_id":  factura_id,
            "nombre":      imp.get("nombre", ""),
            "porcentaje":  to_float(imp.get("porcentaje")),
            "base":        to_float(imp.get("base")),
            "valor":       to_float(imp.get("valor")),
        }).execute()

    auth = doc.get("autorizacion_dian", {})
    if auth.get("numero"):
        sb.table("autorizaciones_dian").insert({
            "factura_id":   factura_id,
            "numero":       auth.get("numero", ""),
            "prefijo":      auth.get("prefijo", ""),
            "valida_desde": auth.get("desde") or None,
            "valida_hasta": auth.get("hasta") or None,
            "rango_desde":  auth.get("rango_desde", ""),
            "rango_hasta":  auth.get("rango_hasta", ""),
        }).execute()

    sb.table("procesamiento_log").insert({
        "factura_id": factura_id,
        "pyme_id":    pyme_id,
        "evento":     "factura_procesada",
        "detalle":    f"Factura {doc.get('numero')} procesada correctamente via {canal}",
        "fuente":     data.get("fuente", ""),
    }).execute()

    return {
        "factura_id": factura_id,
        "pyme_id":    pyme_id,
        "numero":     doc.get("numero", ""),
    }


# ── Rutas ─────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "6.0-gemini", "modelo": MODELO_GEMINI})

@app.route("/procesar", methods=["POST"])
def procesar():
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "Body JSON requerido"}), 400

    canal = data.get("canal", "app")

    try:
        if "xml_content" in data:
            resultado = parse_xml(data["xml_content"])

        elif "imagen_b64" in data:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                return jsonify({"error": "GEMINI_API_KEY no configurada"}), 500

            mime_type  = data.get("mime_type", "image/jpeg")
            doc_bytes  = base64.b64decode(data["imagen_b64"])
            fuente     = "pdf_gemini" if mime_type == "application/pdf" else "imagen_gemini"
            resultado  = parse_documento_gemini(doc_bytes, mime_type, api_key, fuente)

        else:
            return jsonify({"error": "Envía xml_content o imagen_b64"}), 400

        guardado = None
        if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"):
            guardado = guardar_en_supabase(resultado, canal=canal)

        return jsonify({
            "ok":       True,
            "guardado": guardado,
            "data":     resultado,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
