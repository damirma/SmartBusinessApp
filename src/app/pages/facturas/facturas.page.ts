import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CurrencyPipe, DatePipe }                                   from '@angular/common';
import { Router, RouterLink, ActivatedRoute, NavigationEnd }        from '@angular/router';
import { FormsModule }                                              from '@angular/forms';
import { filter }                                                   from 'rxjs';
import { takeUntilDestroyed }                                       from '@angular/core/rxjs-interop';
import {
  IonHeader, IonToolbar, IonContent, IonBackButton,
  IonButton, IonIcon, IonButtons, IonFab, IonFabButton,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, refreshOutline, searchOutline, closeOutline,
  documentTextOutline, addOutline, chevronForwardOutline,
  timeOutline, checkmarkCircleOutline, alertCircleOutline,
  calendarOutline, peopleOutline, listOutline, filterOutline,
  ellipseOutline, paperPlaneOutline, phonePortraitOutline,
  funnelOutline,
} from 'ionicons/icons';
import { FacturaService }                                            from '../../services/factura';
import { agruparFacturas, AgrupacionTipo, OrdenTipo, GrupoFacturas } from '../../utils/agrupar-facturas';

type FiltroEstado = 'todos' | 'pendiente' | 'pagada' | 'vencida';
type FiltroOrigen = 'todos' | 'app' | 'telegram';
type RangoFecha   = 'todo'  | 'mes' | 'mes-ant' | '90d';
type EstadoEfectivo = 'pendiente' | 'procesada' | 'pagada' | 'vencida';

@Component({
  selector:    'app-facturas',
  templateUrl: './facturas.page.html',
  styleUrls:   ['./facturas.page.scss'],
  standalone:  true,
  imports: [
    RouterLink, FormsModule, CurrencyPipe, DatePipe,
    IonHeader, IonToolbar, IonContent, IonBackButton,
    IonButton, IonIcon, IonButtons, IonFab, IonFabButton,
    IonRefresher, IonRefresherContent,
  ],
})
export class FacturasPage implements OnInit {

  private facturaService = inject(FacturaService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);
  private destroyRef     = inject(DestroyRef);

  // ── Raw state ─────────────────────────────────────────────────────────────
  cargando           = signal(true);
  facturasOriginales = signal<any[]>([]);
  busqueda           = signal('');
  filtroEstado       = signal<FiltroEstado>('todos');
  filtroOrigen       = signal<FiltroOrigen>('todos');
  rangoFecha         = signal<RangoFecha>('todo');
  agrupacion         = signal<AgrupacionTipo>('mes');
  orden              = signal<OrdenTipo>('fecha-desc');

  // lote filter (populated from queryParam "lote" — holds comma-separated IDs)
  filtroLote = signal<string | null>(null);
  loteIds    = signal<string[]>([]);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Effective state (deriva "vencida" desde fecha_vencimiento) ──────────────
  estadoEfectivo(f: any): EstadoEfectivo {
    if (f.estado === 'pagada') return 'pagada';
    if (f.fecha_vencimiento) {
      const venc = new Date(f.fecha_vencimiento).getTime();
      if (!Number.isNaN(venc) && venc < Date.now()) return 'vencida';
    }
    return (f.estado === 'pendiente' || f.estado === 'procesada')
      ? (f.estado as EstadoEfectivo)
      : 'pendiente';
  }

  // ── Base set (lote + origen + rango + búsqueda, SIN filtro de estado) ────────
  // Se usa para los conteos del resumen: así los números no cambian al togglear
  // el estado, y los stats funcionan como filtros estables.
  private facturasBase = computed(() => {
    let lista: any[] = this.facturasOriginales();

    // --- lote
    if (this.filtroLote()) {
      const ids = this.loteIds();
      lista = lista.filter(f => ids.includes(f.id));
    }

    // --- origen / canal
    const ori = this.filtroOrigen();
    if (ori !== 'todos') {
      lista = lista.filter(f => (f.canal || 'app') === ori);
    }

    // --- rango de fecha
    const rango = this.rangoFecha();
    if (rango !== 'todo') {
      const hoy   = new Date();
      const desde = new Date();
      if (rango === 'mes') {
        desde.setDate(1);
        desde.setHours(0, 0, 0, 0);
      } else if (rango === 'mes-ant') {
        desde.setMonth(desde.getMonth() - 1);
        desde.setDate(1);
        desde.setHours(0, 0, 0, 0);
      } else if (rango === '90d') {
        desde.setDate(desde.getDate() - 90);
        desde.setHours(0, 0, 0, 0);
      }
      lista = lista.filter(f => {
        if (!f.fecha_emision) return false;
        const d = new Date(f.fecha_emision);
        if (rango === 'mes-ant') {
          const finMesAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
          return d >= desde && d < finMesAnt;
        }
        return d >= desde;
      });
    }

    // --- búsqueda (incluye canal/origen)
    const q = this.busqueda().trim().toLowerCase();
    if (q) {
      lista = lista.filter(f =>
        f.numero?.toLowerCase().includes(q)            ||
        f.numero_factura?.toLowerCase().includes(q)    ||
        f.proveedor_nombre?.toLowerCase().includes(q)  ||
        f.proveedor_nit?.toLowerCase().includes(q)     ||
        f.canal?.toLowerCase().includes(q),
      );
    }

    return lista;
  });

  // ── Derived state (base + filtro de estado efectivo) ─────────────────────────
  facturasFiltradas = computed(() => {
    const est = this.filtroEstado();
    if (est === 'todos') return this.facturasBase();
    return this.facturasBase().filter(f => {
      const eff = this.estadoEfectivo(f);
      if (est === 'pendiente') return eff === 'pendiente' || eff === 'procesada';
      return eff === est;   // 'pagada' | 'vencida'
    });
  });

  grupos = computed<GrupoFacturas[]>(() =>
    agruparFacturas(this.facturasFiltradas(), this.agrupacion(), this.orden()),
  );

  // Conteos sobre la base (estables al togglear estado)
  resumen = computed(() => {
    const lista = this.facturasBase();
    let pendientes = 0, pagadas = 0, vencidas = 0, montoPendiente = 0;
    for (const f of lista) {
      const eff = this.estadoEfectivo(f);
      if (eff === 'pagada')       pagadas++;
      else if (eff === 'vencida') { vencidas++; montoPendiente += (f.total_pagar ?? 0); }
      else                        { pendientes++; montoPendiente += (f.total_pagar ?? 0); }
    }
    return {
      total:      lista.length,
      totalMonto: lista.reduce((s, f) => s + (f.total_pagar ?? 0), 0),
      pendientes, pagadas, vencidas, montoPendiente,
    };
  });

  // Nº de filtros activos (excluye lote, que tiene su propio chip)
  filtrosActivos = computed(() => {
    let n = 0;
    if (this.filtroEstado() !== 'todos') n++;
    if (this.filtroOrigen() !== 'todos') n++;
    if (this.rangoFecha()   !== 'todo')  n++;
    if (this.busqueda().trim())          n++;
    return n;
  });

  // Expose skeleton indices to template (no CommonModule needed)
  readonly skeletonItems = [1, 2, 3, 4, 5];

  constructor() {
    addIcons({
      arrowBackOutline, refreshOutline, searchOutline, closeOutline,
      documentTextOutline, addOutline, chevronForwardOutline,
      timeOutline, checkmarkCircleOutline, alertCircleOutline,
      calendarOutline, peopleOutline, listOutline, filterOutline,
      ellipseOutline, paperPlaneOutline, phonePortraitOutline,
      funnelOutline,
    });
  }

  ngOnInit(): void {
    const lote = this.route.snapshot.queryParamMap.get('lote');
    if (lote) {
      this.filtroLote.set(lote);
      this.loteIds.set(lote.split(',').map(s => s.trim()).filter(Boolean));
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      filter(e => (e as NavigationEnd).urlAfterRedirects.startsWith('/facturas')),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.cargarFacturas(this.facturasOriginales().length > 0));
  }

  // Refresca automáticamente cada 30s para mostrar facturas nuevas de Telegram
  ionViewWillEnter(): void {
    this.refreshTimer = setInterval(() => this.cargarFacturas(true), 30_000);
  }

  ionViewWillLeave(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  cargarFacturas(silencioso = false): void {
    if (!silencioso) this.cargando.set(true);
    this.facturaService.getFacturas().subscribe({
      next:  (data: any[]) => { this.facturasOriginales.set(data); this.cargando.set(false); },
      error: ()            => { this.cargando.set(false); },
    });
  }

  // Pull-to-refresh
  doRefresh(ev: CustomEvent): void {
    this.facturaService.getFacturas().subscribe({
      next:  (data: any[]) => { this.facturasOriginales.set(data); (ev.target as HTMLIonRefresherElement).complete(); },
      error: ()            => { (ev.target as HTMLIonRefresherElement).complete(); },
    });
  }

  // ── Toggles (clic en filtro activo lo apaga) ─────────────────────────────────
  toggleEstado(f: FiltroEstado): void {
    this.filtroEstado.set(this.filtroEstado() === f ? 'todos' : f);
  }
  toggleOrigen(o: FiltroOrigen): void {
    this.filtroOrigen.set(this.filtroOrigen() === o ? 'todos' : o);
  }
  toggleRango(r: RangoFecha): void {
    this.rangoFecha.set(this.rangoFecha() === r ? 'todo' : r);
  }

  setAgrupacion(a: AgrupacionTipo): void { this.agrupacion.set(a); }
  setOrden(o: OrdenTipo): void           { this.orden.set(o);      }
  setBusqueda(q: string): void           { this.busqueda.set(q);   }

  salirDeLote(): void {
    this.filtroLote.set(null);
    this.loteIds.set([]);
  }

  clearFiltros(): void {
    this.filtroEstado.set('todos');
    this.filtroOrigen.set('todos');
    this.rangoFecha.set('todo');
    this.busqueda.set('');
  }

  verDetalle(f: any): void { this.router.navigate(['/detalle', f.id]); }
  goToUpload(): void        { this.router.navigate(['/upload']);        }

  // ── Display helpers ──────────────────────────────────────────────────────────
  estadoLabel(estado: string): string {
    const map: Record<string, string> = {
      pendiente: 'Pendiente',
      procesada: 'Por revisar',
      pagada:    'Pagada',
      vencida:   'Vencida',
    };
    return map[estado] ?? estado;
  }

  iconoEstado(estado: string): string {
    const map: Record<string, string> = {
      pendiente: 'time-outline',
      procesada: 'ellipse-outline',
      pagada:    'checkmark-circle-outline',
      vencida:   'alert-circle-outline',
    };
    return map[estado] ?? 'ellipse-outline';
  }

  // ── TrackBy ────────────────────────────────────────────────────────────────
  trackById(_: number, f: any): string              { return f.id;    }
  trackByClave(_: number, g: GrupoFacturas): string { return g.clave; }
  trackByIndex(i: number): number                   { return i;       }
}
