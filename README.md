# SmartBusiness OCR Suite

Plataforma de OCR e IDP para extraer y estructurar datos de facturas electronicas colombianas, orientada a PyMEs.

**Proyecto academico - ETITC - Facultad de Sistemas - Tecnologia en Desarrollo de Software**

---

## Que hace este sistema?

1. Recibe una factura en XML (DIAN) o PDF/imagen
2. Extrae automaticamente todos los datos fiscales
3. Guarda la informacion estructurada en Supabase (PostgreSQL)
4. n8n orquesta todo el flujo como middleware

---

## Arquitectura

    GCP VM (dam01) - minikube
    |
    |- namespace: infraestructura
    |   L n8n v2.15.0 (orquestador central)
    |           |
    |           | HTTP interno del cluster
    |           v
    |- namespace: pyme-test
    |   L worker-ocr (Flask + Python)
    |       |- Parsea XML nativo DIAN
    |       |- OCR con Gemini (PDF/imagen)
    |       L  Persiste en Supabase
    |
    L APIs externas
        |- Gemini API (Google AI)
        L  Supabase (PostgreSQL)

DNS interno: http://worker-ocr-svc.pyme-test.svc.cluster.local/procesar

---

## Estructura del repositorio

    SmartBusinessApp/
    |- worker-ocr/
    |   |- main.py            <- Microservicio principal (Flask)
    |   |- Dockerfile         <- Imagen Docker
    |   L  requirements.txt   <- Dependencias Python
    |- k8s/
    |   L  worker-ocr.yaml    <- Deployment + Service en Kubernetes
    |- test_facturas/
    |   L  XML_BEC472892161.xml  <- Factura real de prueba (DIAN)
    L  src/                   <- App movil Ionic/Angular (frontend)

---

## Endpoints del worker-ocr

| Metodo | Ruta      | Descripcion                     |
|--------|-----------|---------------------------------|
| GET    | /health   | Estado del servicio             |
| POST   | /procesar | Procesa XML o imagen de factura |

### Ejemplo - enviar un XML

    POST /procesar
    Content-Type: application/json

    {
      "xml_content": "<Invoice>...</Invoice>"
    }

### Ejemplo - enviar imagen o PDF

    POST /procesar
    Content-Type: application/json

    {
      "imagen_b64": "<base64 del archivo>",
      "mime_type": "application/pdf"
    }

### Respuesta exitosa

    {
      "ok": true,
      "guardado": { "factura_id": 1, "pyme_id": 1, "numero": "FE-001" },
      "data": {
        "documento": { "numero": "FE-001", "cufe": "...", "fecha_emision": "2026-04-01" },
        "proveedor": { "nombre": "...", "nit": "900123456-1" },
        "cliente":   { "nombre": "...", "nit": "..." },
        "items":     [{ "descripcion": "...", "cantidad": "2", "valor_total": "100000" }],
        "impuestos": [{ "nombre": "IVA", "porcentaje": "19", "valor": "19000" }],
        "totales":   { "subtotal": "100000", "total_pagar": "119000" }
      }
    }

---

## Como reproducir en la VM

### Prerrequisitos
- GCP VM con Docker, kubectl y minikube instalados
- Cuenta en Supabase y Gemini API

### 1 - Crear el Secret de Kubernetes

    kubectl create namespace pyme-test
    kubectl create namespace infraestructura

    kubectl create secret generic worker-ocr-secret \
      --from-literal=GEMINI_API_KEY="tu_clave" \
      --from-literal=SUPABASE_URL="https://xxx.supabase.co" \
      --from-literal=SUPABASE_KEY="tu_anon_key" \
      -n pyme-test

### 2 - Construir la imagen Docker

    eval $(minikube docker-env)
    cd worker-ocr
    docker build -t worker-ocr:latest .

### 3 - Desplegar en Kubernetes

    kubectl apply -f k8s/worker-ocr.yaml
    kubectl get pods -n pyme-test

### 4 - Probar el servicio

    kubectl port-forward svc/worker-ocr-svc 8080:80 -n pyme-test
    curl http://localhost:8080/health

---

## Variables de entorno (Secret de Kubernetes)

| Variable        | Descripcion                  |
|-----------------|------------------------------|
| GEMINI_API_KEY  | API key de Google Gemini     |
| SUPABASE_URL    | URL del proyecto Supabase    |
| SUPABASE_KEY    | Anon key de Supabase         |

ADVERTENCIA: Nunca subas credenciales reales al repositorio.

---

## Estado actual del proyecto

- [x] VM provisionada (GCP e2-medium, Debian 12)
- [x] minikube instalado y corriendo
- [x] Namespaces creados (pyme-test, infraestructura)
- [x] Secret worker-ocr-secret aplicado
- [x] n8n v2.15.0 desplegado en infraestructura
- [x] Imagen worker-ocr:latest construida
- [ ] worker-ocr Deployment verificado en Kubernetes
- [ ] Comunicacion n8n y worker-ocr verificada
- [ ] Primer workflow de n8n configurado
- [ ] Integracion Supabase completada
- [ ] Migracion a GKE (produccion)

---

## Equipo

| Integrante       | Rol                                        |
|------------------|--------------------------------------------|
| Erik Gil Suarez  | Backend Python, infraestructura Kubernetes |
| Samuel           | Arquitectura Kubernetes, frontend Ionic    |

Docente: Sandra Johana Guerrero Gomez
Institucion: ETITC - Escuela Tecnologica Instituto Tecnico Central
