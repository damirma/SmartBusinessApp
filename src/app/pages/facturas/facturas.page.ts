import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe }                      from '@angular/common';
import { Router, RouterLink, ActivatedRoute }          from '@angular/router';
import { FormsModule }                                 from '@angular/forms';
import {
  IonHeader, IonToolbar, IonContent, IonBackButton,
  IonButton, IonIcon, IonButtons, IonFab, IonFabButton,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, refreshOutline, searchOutline, closeOutline,
  documentTextOutline, addOutline, chevronForwardOutline,
  timeOutline, checkmarkCircleOutline, alertCircleOutline,
  calendarOutline, peopleOutline, listOutline, filterOutline,
  ellipseOutline,
} from 'ionicons/icons';
import { FacturaService }                                            from '../../services/factura';
import { agruparFacturas, AgrupacionTipo, OrdenTipo, GrupoFacturas } from '../../utils/agrupar-facturas';

type FiltroEstado = 'todos' | 'pendiente' | 'pagada' | 'vencida';
type RangoFecha   = 'todo'  | 'mes'       | 'mes-ant' | '90d';

@Component({
  selector:    'app-facturas',
  templateUrl: './facturas.page.html',
  styleUrls:   ['./facturas.page.scss'],
  standalone:  true,
  imports: [
    RouterLink, FormsModule, CurrencyPipe, DatePipe,
    IonHeader, IonToolbar, IonContent, IonBackButton,
    IonButton, IonIcon, IonButtons, IonFab, IonFabButton,
  ],
})
export class FacturasPage implements OnInit, ViewWillEnter {

  private facturaService = inject(FacturaService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);

  // ── Raw state ─────────────────────────────────────────────────────────────
  cargando           = signal(true);
  facturasOriginales = signal<any[]>([]);
  busqueda           = signal('');
  filtroEstado       = signal<FiltroEstado>('todos');
  rangoFecha         = signal<RangoFecha>('todo');
  agrupacion         = signal<AgrupacionTipo>('mes');
  orden              = signal<OrdenTipo>('fecha-desc');

  // lote filter (populated from queryParam "lote" — holds comma-separated IDs)
  filtroLote = signal<string | null>(null);
  loteIds    = signal<string[]>([]);

  // ── Derived state ──────────────────────────────────────────────────────────
  facturasFiltradas = computed(() => {
    let lista: any[] = this.facturasOriginales();

    // --- lote
    if (this.filtroLote()) {
      const ids = this.loteIds();
      lista = lista.filter(f => ids.includes(f.id));
    }

    // --- estado
    const est = this.filtroEstado();
    if (est !== 'todos') {
      lista = lista.filter(f => {
        if (est === 'pendiente') return f.estado === 'pendiente' || f.estado === 'procesada';
        return f.estado === est;
      });
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

    // --- búsqueda
    const q = this.busqueda().trim().toLowerCase();
    if (q) {
      lista = lista.filter(f =>
        f.numero?.toLowerCase().includes(q)            ||
        f.numero_factura?.toLowerCase().includes(q)    ||
        f.proveedor_nombre?.toLowerCase().includes(q)  ||
        f.proveedor_nit?.toLowerCase().includes(q),
      );
    }

    return lista;
  });

  grupos = computed<GrupoFacturas[]>(() =>
    agruparFacturas(this.facturasFiltradas(), this.agrupacion(), this.orden()),
  );

  resumen = computed(() => {
    const lista = this.facturasFiltradas();
    return {
      total:          lista.length,
      totalMonto:     lista.reduce((s, f) => s + (f.total_pagar ?? 0), 0),
      pendientes:     lista.filter(f => f.estado === 'pendiente' || f.estado === 'procesada').length,
      pagadas:        lista.filter(f => f.estado === 'pagada').length,
      vencidas:       lista.filter(f => f.estado === 'vencida').length,
      montoPendiente: lista.filter(f => f.estado !== 'pagada').reduce((s, f) => s + (f.total_pagar ?? 0), 0),
    };
  });

  // Expose skeleton indices to template (no CommonModule needed)
  readonly skeletonItems = [1, 2, 3, 4, 5];

  constructor() {
    addIcons({
      arrowBackOutline, refreshOutline, searchOutline, closeOutline,
      documentTextOutline, addOutline, chevronForwardOutline,
      timeOutline, checkmarkCircleOutline, alertCircleOutline,
      calendarOutline, peopleOutline, listOutline, filterOutline,
      ellipseOutline,
    });
  }

  ngOnInit(): void {
    // Read lote queryParam once on first load (route doesn't change while page is alive)
    const lote = this.route.snapshot.queryParamMap.get('lote');
    if (lote) {
      this.filtroLote.set(lote);
      this.loteIds.set(lote.split(',').map(s => s.trim()).filter(Boolean));
    }
  }

  // Fires every time the page gains focus (first load AND when navigating back from detalle).
  // This ensures the list reflects changes made in detalle (pago, edición).
  ionViewWillEnter(): void {
    this.cargarFacturas();
  }

  cargarFacturas(): void {
    this.cargando.set(true);
    this.facturaService.getFacturas().subscribe({
      next:  (data: any[]) => { this.facturasOriginales.set(data); this.cargando.set(false); },
      error: ()            => { this.cargando.set(false); },
    });
  }

  // ── Setters for template ───────────────────────────────────────────────────
  setFiltroEstado(f: FiltroEstado): void { this.filtroEstado.set(f); }
  setRango(r: RangoFecha): void          { this.rangoFecha.set(r);   }
  setAgrupacion(a: AgrupacionTipo): void { this.agrupacion.set(a);   }
  setOrden(o: OrdenTipo): void           { this.orden.set(o);        }
  setBusqueda(q: string): void           { this.busqueda.set(q);     }

  salirDeLote(): void {
    this.filtroLote.set(null);
    this.loteIds.set([]);
  }

  clearFiltros(): void {
    this.filtroEstado.set('todos');
    this.busqueda.set('');
    this.rangoFecha.set('todo');
  }

  verDetalle(f: any): void { this.router.navigate(['/detalle', f.id]); }
  goToUpload(): void        { this.router.navigate(['/upload']);         }

  // ── Display helpers ────────────────────────────────────────────────────────
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
  trackById(_: number, f: any): string            { return f.id;    }
  trackByClave(_: number, g: GrupoFacturas): string { return g.clave; }
  trackByIndex(i: number): number                 { return i;        }
}
