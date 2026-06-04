# Ionic Feature Builder Skill

## Trigger
Use this skill whenever generating, refactoring, or extending:
- Pages in `src/app/pages/` or `src/app/home/`
- Standalone components
- Services that call worker-ocr or Supabase
- Modals, popovers, action sheets
- Forms (reactive)
- Any UI feature in the SmartBusinessApp Ionic project

## Goal
Generate consistent, production-quality Ionic 8 + Angular 20 features that
follow the project's conventions and use the minimalist design system.

## Required structure for every new page

```
src/app/pages/<name>/
├── <name>.page.ts      ← logic, standalone component
├── <name>.page.html    ← template
└── <name>.page.scss    ← page-specific styles
```

NEVER use inline templates or inline styles.

## Template — page.ts
```typescript
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FacturaService } from '../../services/factura';

@Component({
  selector: 'app-<name>',
  templateUrl: './<name>.page.html',
  styleUrls: ['./<name>.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class <Name>Page {
  private router = inject(Router);
  private facturaService = inject(FacturaService);

  // State with Signals (Angular 20)
  protected loading = signal(false);
  protected items = signal<any[]>([]);
  protected error = signal<string | null>(null);

  // Derived state
  protected hasItems = computed(() => this.items().length > 0);
}
```

## Template — page.html (minimalist patterns)

### Loading skeleton
```html
@if (loading()) {
  <div class="sb-skeleton-list">
    @for (i of [1,2,3]; track i) {
      <div class="sb-skeleton-card"></div>
    }
  </div>
}
```

### Empty state
```html
@if (!loading() && !hasItems()) {
  <div class="sb-empty">
    <ion-icon name="document-text-outline" class="sb-empty__icon"></ion-icon>
    <p class="sb-empty__text">No hay facturas todavía</p>
    <ion-button fill="solid" color="success" (click)="goToUpload()">
      Subir primera factura
    </ion-button>
  </div>
}
```

### Card with badge
```html
<div class="sb-card" (click)="open(item)">
  <div class="sb-card__head">
    <span class="sb-card__title">{{ item.numero }}</span>
    <span class="sb-badge" [class]="'sb-badge--' + item.estado">
      {{ item.estado }}
    </span>
  </div>
  <div class="sb-card__body">
    <p class="sb-card__meta">{{ item.proveedor }}</p>
    <p class="sb-card__amount">$ {{ item.total | number }}</p>
  </div>
</div>
```

## Template — page.scss (use tokens, not magic values)

```scss
@import '../../../theme/tokens.scss';

:host {
  --page-padding: var(--sb-space-md);
}

.page-container {
  padding: var(--sb-space-md);
  max-width: 720px;
  margin: 0 auto;
}

.sb-section-title {
  font-size: var(--sb-font-lg);
  font-weight: 600;
  margin-bottom: var(--sb-space-md);
  color: var(--sb-text-primary);
}
```

## Design tokens (already defined in src/theme/tokens.scss)
```scss
// Colors
--sb-bg: #0f0f17;
--sb-bg-card: #1a1a2e;
--sb-bg-elevated: #232336;
--sb-text-primary: #e8e8f0;
--sb-text-secondary: #9999a8;
--sb-text-tertiary: #666674;
--sb-accent: #2ECC71;     // primary green
--sb-accent-hover: #27AE60;
--sb-warning: #F39C12;
--sb-danger: #E74C3C;
--sb-border: #2a2a3e;

// Spacing
--sb-space-xs: 4px;
--sb-space-sm: 8px;
--sb-space-md: 16px;
--sb-space-lg: 24px;
--sb-space-xl: 32px;

// Typography
--sb-font-xs: 12px;
--sb-font-sm: 14px;
--sb-font-md: 16px;
--sb-font-lg: 18px;
--sb-font-xl: 24px;
--sb-font-xxl: 32px;

// Radius
--sb-radius-sm: 4px;
--sb-radius-md: 8px;
--sb-radius-lg: 12px;
```

If the project doesn't have these tokens yet, create them in tokens.scss
BEFORE building the feature.

## Service patterns

When adding a method to factura.ts:
1. Returns `Observable<T>`, never Promise.
2. Uses `environment.workerUrl` or `environment.supabaseUrl`, never hardcode.
3. Uses `this.http` (injected) not constructor.
4. Adds the proper Authorization headers via `this.headers()` for Supabase calls.

```typescript
nuevoMetodo(param: string): Observable<TipoResultado> {
  return this.http.post<TipoResultado>(
    `${this.workerUrl}/endpoint`,
    { campo: param }
  );
}
```

## Form patterns (reactive forms only)
```typescript
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

@Component({
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
  // ...
})
export class MyPage {
  private fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    nit: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
  });

  submit() {
    if (this.form.invalid) return;
    const data = this.form.value;
    // ...
  }
}
```

## Lists with trackBy
```html
@for (factura of facturas(); track factura.id) {
  <div class="sb-card">{{ factura.numero }}</div>
}
```

Always use the `id` (or another stable unique key), never the index.

## Routing
Add new pages to `src/app/app.routes.ts` with lazy loading:
```typescript
{
  path: 'nueva-pagina',
  loadComponent: () =>
    import('./pages/nueva-pagina/nueva-pagina.page')
      .then(m => m.NuevaPaginaPage),
}
```

## Rules (NEVER violate)
1. Never put logic in the template. Use methods or computed signals.
2. Never use `any`. If unsure, define an interface in `src/app/models/`.
3. Never hardcode URLs or credentials.
4. Never use template-driven forms.
5. Never use NgModules (always standalone).
6. Never skip the empty state, error state, or loading state for async UIs.
7. Never use spinners for full-page loads — use skeletons.

## When done
1. Verify `ionic serve` compiles without TS errors.
2. Verify the route works.
3. Add a note to `.claude/memory/CURRENT.md` about what was added.
