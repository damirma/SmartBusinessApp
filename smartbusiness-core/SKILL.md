# SmartBusiness Core Skill

## Trigger
Use this skill on EVERY task related to the SmartBusinessApp project.
This is the technical bible of the project. Always read it before:
- Writing code in this repo
- Making infrastructure changes
- Debugging connection issues
- Adding new pages, services, or backend logic

## Project at a glance
SaaS for processing Colombian DIAN electronic invoices for micronegocios.
Three input formats (XML, PDF, image), two channels (Ionic app, Telegram),
all routed through n8n to worker-ocr on Kubernetes.

## Critical infrastructure facts

### URLs and IPs (DO NOT CHANGE WITHOUT ASKING)
- VM public IP: **146.148.80.200** (static, reserved as smartbusiness-ip)
- worker-ocr external: `http://146.148.80.200:30080`
- worker-ocr internal: `http://worker-ocr-svc.pyme-test.svc.cluster.local`
- Supabase: `https://zsoynenfjwmeghsvguvg.supabase.co`
- No-IP: `smartbusinessdam.sytes.net`
- GCP project: `prototipo-01-491503`
- VM zone: `us-central1-a` (region us-central1)

### Stack versions
- Ionic 8 + Angular 20 (standalone components, no NgModules)
- Capacitor 8.3.0, TypeScript 5.9
- Python 3.11 + Flask 3.0.3
- worker-ocr v4.0 (Groq-based, NOT Gemini)
- Groq models: `llama-3.3-70b-versatile` (text) + `meta-llama/llama-4-scout-17b-16e-instruct` (vision)
- minikube on Debian 12 VM (e2-medium)
- n8n v2.15 in namespace `infraestructura`
- worker-ocr in namespace `pyme-test`

### Kubernetes details
- Pod name pattern: `worker-ocr-xxxxx`
- Service: `worker-ocr-svc` (NodePort 30080 → 8080)
- Secret: `worker-ocr-secret` (GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY)
- Socat tunnel: `/etc/systemd/system/socat-worker-ocr.service` (robust, waits for minikube)

### Database schema (Supabase, 8 tables)
- `pymes` — empresas (id, nit, nombre, plan, created_at)
- `usuarios` — id, pyme_id, email, rol
- `perfil_extraccion` — onboarding scores per PyME
- `facturas` — header + raw_json (includes estado, fecha_pago, forma_pago)
- `factura_items` — line items
- `factura_impuestos` — tax breakdown
- `autorizaciones_dian` — DIAN authorization data
- `procesamiento_log` — audit log (fuente, duracion_ms, resultado)

⚠️ There is NO `pagos` table. Do not query it.

### Frontend files of importance
- `src/environments/environment.ts` — workerUrl, supabaseUrl, supabaseKey
- `src/app/services/factura.ts` — HTTP client (worker-ocr + Supabase REST)
- `src/app/models/factura.model.ts` — all interfaces
- `src/theme/tokens.scss` — design tokens (dark, accent green)
- `src/global.scss` — imports tokens, base resets

### Routes (lazy-loaded)
- `/` → redirect to `/home`
- `/home` → dev dashboard
- `/onboarding` → 7-step profile setup
- `/upload` → process invoice
- `/facturas` → list with filters
- `/detalle/:id` → invoice detail + payment

## Coding conventions
1. **Always separate files**: `.ts`, `.html`, `.scss` — never inline templates.
2. **Standalone components**: every component has `standalone: true`.
3. **Lazy loading**: routes use `loadComponent()`.
4. **Reactive forms**, not template-driven.
5. **Observables** from services, not Promises.
6. **trackBy** on every `*ngFor`.
7. **Use Angular Signals** for reactive state in new code (Angular 20).
8. **Inject pattern**: `private http = inject(HttpClient)`, not constructor injection.
9. **PowerShell on Windows**: NEVER use `&&` to chain commands; use `;` or separate lines.
10. **Credentials**: never paste in code. Use `environment.ts` (gitignored) or K8s secrets.

## Processing pipeline
```
[User]
  ↓ uploads XML/PDF/image (base64)
[App Ionic]
  ↓ POST to worker-ocr /procesar
[worker-ocr Flask]
  ├── XML → parse_xml() (2ms, 100% accuracy)
  ├── PDF → MarkItDown → Groq Llama 70B
  └── Image → Groq Llama 4 Scout (vision)
  ↓ INSERT into 6 Supabase tables
[Supabase]
  ↓ PostgREST
[App displays result]
```

## Common gotchas (read before debugging)
1. **`pagos` table does NOT exist**. If a 400 hits Supabase, check the select doesn't include `pagos(*)`.
2. **The IP changes on VM restart unless reserved**. Currently reserved as `smartbusiness-ip`.
3. **socat must wait for minikube ip to resolve**, otherwise it binds to garbage.
4. **Groq returns markdown around JSON sometimes**. Strip with regex before `json.loads`.
5. **MarkItDown fails on scanned PDFs**. Falls back to error 422 in worker-ocr v4.0+.
6. **CORS**: worker-ocr accepts everything (Flask-CORS no origins).
7. **The frontend uses anon key**, not service_role. Worker-ocr uses service_role to bypass RLS.

## When making changes
1. Read `.claude/memory/CURRENT.md` to know the current phase.
2. Read `.claude/memory/LEARNINGS.md` to avoid re-doing solved problems.
3. Follow the coding conventions above strictly.
4. After completing a task, suggest updating `.claude/memory/CURRENT.md`.

## Reference documents in the repo
- `CLAUDE.md` — same context, narrative format
- `ROADMAP.md` — phases and feature requirements
- This skill — quick-lookup technical reference
