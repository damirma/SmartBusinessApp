# Prompt para Claude Code — VM dam01 (GCP)

Copia y pega este texto completo como primer mensaje a Claude Code en la VM.

---

## CONTEXTO

Eres Claude Code ejecutándote en la VM `dam01` (GCP, Debian 12). El proyecto es **SmartBusiness OCR Suite**, un microservicio Flask llamado `worker-ocr` que procesa facturas electrónicas colombianas DIAN (XML UBL 2.1 y PDF/imagen) usando Groq como motor de IA.

El worker-ocr corre en Kubernetes (minikube, namespace `pyme-test`). La imagen Docker se construye localmente con el docker de minikube.

**Problema actual:** El archivo `main.py` del worker-ocr está desactualizado — usa la API de Gemini (`google-generativeai`) pero debemos migrar a Groq (`groq`). Además hay un bug: intenta insertar en una tabla `pagos` que no existe en Supabase, lo que causa errores silenciosos.

**Tu misión:** Reemplazar `main.py` y `requirements.txt` con las versiones correctas, reconstruir la imagen Docker y reiniciar el pod en Kubernetes.

---

## PASO 1 — Localizar el proyecto

Primero encuentra dónde está el proyecto:

```bash
find /home -name "main.py" -path "*/worker-ocr/*" 2>/dev/null
find /root -name "main.py" -path "*/worker-ocr/*" 2>/dev/null
```

Una vez que encuentres la ruta (probablemente algo como `/home/dam01/SmartBusinessApp/worker-ocr/` o `/root/SmartBusinessApp/worker-ocr/`), úsala como base para los siguientes pasos.

---

## PASO 2 — Reemplazar `requirements.txt`

Reemplaza el contenido de `requirements.txt` con exactamente esto:

```
flask==3.0.3
requests==2.32.3
groq>=0.9.0
markitdown>=0.0.1
supabase==2.15.0
flask-cors==4.0.1
```

---

## PASO 3 — Reemplazar `main.py`

Reemplaza el contenido completo de `main.py` con el siguiente código. **No modifiques nada, cópialo exactamente:**

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import os, re, json, xml.etree.ElementTree as ET, base64, tempfile
from datetime import datetime

app = Flask(__name__)
CORS(app)

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
}

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
    elif tag == "Invoice":
        inv = root
    else:
        raise ValueError(f"Tipo XML no reconocido: {tag}")

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
    for line in inv.findall("cac:InvoiceLine", NS):
        items.append({
            "numero_linea":   t(line, "cbc:ID"),
            "descripcion":    t(line, "cac:Item/cbc:Description"),
            "cantidad":       t(line, "cbc:InvoicedQuantity"),
            "unidad":         a(line, "cbc:InvoicedQuantity", "unitCode"),
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
            "tipo":              t(inv, "cbc:InvoiceTypeCode"),
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


PROMPT_FACTURA = """Eres experto en facturación electrónica colombiana DIAN.
Analiza el documento y responde SOLO con JSON válido, sin markdown ni texto extra.
Estructura exacta requerida:
{
  "fuente": "imagen_groq",
  "documento": {
    "numero": "",
    "tipo": "",
    "cufe": "",
    "fecha_emision": "",
    "hora_emision": "",
    "moneda": "COP",
    "observaciones": ""
  },
  "proveedor": {
    "nombre": "",
    "nit": "",
    "direccion": {"linea": "", "ciudad": ""},
    "email": "",
    "telefono": ""
  },
  "cliente": {
    "nombre": "",
    "nit": "",
    "direccion": {"ciudad": ""}
  },
  "pago": {
    "forma": "",
    "fecha_vencimiento": ""
  },
  "items": [
    {"numero_linea": "1", "descripcion": "", "cantidad": "", "unidad": "", "valor_unitario": "", "valor_total": ""}
  ],
  "impuestos": [
    {"nombre": "IVA", "porcentaje": "", "base": "", "valor": ""}
  ],
  "totales": {
    "subtotal": "",
    "total_con_impuesto": "",
    "total_pagar": ""
  }
}
Reglas: valores monetarios sin puntos de miles (ej: 1663200.00), campos ausentes como string vacío."""


def parse_imagen_groq(imagen_b64, mime_type, api_key):
    from groq import Groq
    client = Groq(api_key=api_key)

    response = client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{imagen_b64}"},
                },
                {
                    "type": "text",
                    "text": PROMPT_FACTURA,
                },
            ],
        }],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    data = json.loads(raw)
    data["procesado_en"] = datetime.utcnow().isoformat() + "Z"
    data["fuente"] = "imagen_groq"
    return data


def parse_pdf_texto(pdf_bytes, api_key):
    from markitdown import MarkItDown
    from groq import Groq

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        md = MarkItDown()
        result = md.convert(tmp_path)
        markdown_text = result.text_content or ""
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if len(markdown_text.strip()) < 100:
        raise ValueError("PDF sin texto nativo suficiente — usar visión")

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": PROMPT_FACTURA},
            {"role": "user",   "content": markdown_text},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content.strip()
    data = json.loads(raw)
    data["procesado_en"] = datetime.utcnow().isoformat() + "Z"
    data["fuente"] = "pdf_texto_groq"
    return data


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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "5.0"})

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
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                return jsonify({"error": "GROQ_API_KEY no configurada"}), 500

            mime_type = data.get("mime_type", "image/jpeg")
            imagen_b64 = data["imagen_b64"]

            if mime_type == "application/pdf":
                try:
                    pdf_bytes = base64.b64decode(imagen_b64)
                    resultado = parse_pdf_texto(pdf_bytes, api_key)
                except Exception:
                    resultado = parse_imagen_groq(imagen_b64, mime_type, api_key)
            else:
                resultado = parse_imagen_groq(imagen_b64, mime_type, api_key)

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
```

---

## PASO 4 — Verificar el Secret de Kubernetes

Verifica que el secret `worker-ocr-secret` en el namespace `pyme-test` tiene la key `GROQ_API_KEY` (no `GEMINI_API_KEY`):

```bash
kubectl get secret worker-ocr-secret -n pyme-test -o jsonpath='{.data}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))"
```

Si el secret tiene `GEMINI_API_KEY` en lugar de `GROQ_API_KEY`, actualízalo:

```bash
# Opción A — editar el secret existente (reemplaza TU_GROQ_API_KEY con la key real)
kubectl create secret generic worker-ocr-secret \
  --from-literal=GROQ_API_KEY=TU_GROQ_API_KEY \
  --from-literal=SUPABASE_URL=$(kubectl get secret worker-ocr-secret -n pyme-test -o jsonpath='{.data.SUPABASE_URL}' | base64 -d) \
  --from-literal=SUPABASE_KEY=$(kubectl get secret worker-ocr-secret -n pyme-test -o jsonpath='{.data.SUPABASE_KEY}' | base64 -d) \
  -n pyme-test --dry-run=client -o yaml | kubectl apply -f -
```

---

## PASO 5 — Reconstruir la imagen Docker y redesplegar

```bash
# Apuntar Docker al daemon de minikube
eval $(minikube docker-env)

# Ir al directorio del proyecto (usa la ruta que encontraste en el Paso 1)
cd /ruta/al/proyecto

# Reconstruir la imagen
docker build -t worker-ocr:latest worker-ocr/

# Reiniciar el deployment para que tome la nueva imagen
kubectl rollout restart deployment/worker-ocr -n pyme-test

# Esperar que el pod esté Ready
kubectl rollout status deployment/worker-ocr -n pyme-test
```

---

## PASO 6 — Verificar que funciona

```bash
# Ver logs del pod nuevo
kubectl logs -n pyme-test deployment/worker-ocr --tail=30

# Probar el health endpoint
curl http://localhost:30080/health
# Debe responder: {"status":"ok","version":"5.0"}
```

Si el health responde `"version":"5.0"` el deploy fue exitoso.

---

## PASO 7 — (Opcional) Probar con un PDF de prueba

```bash
# Prueba rápida con la API directa (reemplaza con un PDF en base64 real)
curl -X POST http://localhost:30080/procesar \
  -H "Content-Type: application/json" \
  -d '{"imagen_b64": "AQUI_BASE64_DEL_PDF", "mime_type": "application/pdf", "canal": "telegram"}' \
  | python3 -m json.tool
```

La respuesta debe tener `"ok": true` y los campos `data.proveedor.nombre`, `data.documento.numero`, `data.totales.total_pagar` con valores reales (no vacíos).

---

## Resumen de qué cambió y por qué

| Problema | Causa | Solución |
|---|---|---|
| Todos los campos N/D en Telegram | `main.py` usaba Gemini (`GEMINI_API_KEY`) que ya no existe en el secret | Migrado a Groq (`GROQ_API_KEY`) |
| Error silencioso al guardar | `guardar_en_supabase` insertaba en tabla `pagos` que no existe | Eliminado ese insert |
| No se distinguían facturas de Telegram | No había campo `canal` | Acepta `"canal"` en el body, lo guarda en Supabase |

**No toques el archivo `k8s/worker-ocr.yaml`** — el Deployment ya monta el secret correctamente, solo necesitaba que el código usara `GROQ_API_KEY`.
