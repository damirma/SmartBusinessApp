import { Component, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons, IonFab, IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, refreshOutline, searchOutline,
  closeOutline, documentTextOutline, addOutline
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';

@Component({
  selector: 'app-facturas',
  templateUrl: './facturas.page.html',
  styleUrls: ['./facturas.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, CurrencyPipe, DatePipe,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonButtons, IonFab, IonFabButton
  ],
})
export class FacturasPage implements OnInit {

  facturas: any[]         = [];
  facturasFiltradas: any[] = [];
  cargando                = true;
  filtroActivo            = 'todos';
  busqueda                = '';

  get totalFacturas()  { return this.facturas.length; }
  get totalPendientes(){ return this.facturas.filter(f => f.estado === 'pendiente' || f.estado === 'procesada').length; }
  get totalPagadas()   { return this.facturas.filter(f => f.estado === 'pagada').length; }
  get montoPendiente() {
    return this.facturas
      .filter(f => f.estado !== 'pagada')
      .reduce((sum, f) => sum + (f.total_pagar || 0), 0);
  }

  constructor(
    private facturaService: FacturaService,
    private router: Router
  ) {
    addIcons({
      arrowBackOutline, refreshOutline, searchOutline,
      closeOutline, documentTextOutline, addOutline
    });
  }

  ngOnInit() { this.cargarFacturas(); }

  cargarFacturas() {
    this.cargando = true;
    this.facturaService.getFacturas().subscribe({
      next: (data: any[]) => {
        this.facturas = data;
        this.filtrarLocal();
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  setFiltro(filtro: string) {
    this.filtroActivo = filtro;
    this.filtrarLocal();
  }

  filtrarLocal() {
    let lista = [...this.facturas];

    if (this.filtroActivo !== 'todos') {
      lista = lista.filter(f => {
        if (this.filtroActivo === 'pendiente')
          return f.estado === 'pendiente' || f.estado === 'procesada';
        return f.estado === this.filtroActivo;
      });
    }

    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase();
      lista = lista.filter(f =>
        f.numero?.toLowerCase().includes(q) ||
        f.proveedor_nombre?.toLowerCase().includes(q) ||
        f.cliente_nombre?.toLowerCase().includes(q)
      );
    }

    this.facturasFiltradas = lista;
  }

  estadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      pagada:    'Pagada',
      procesada: 'Por revisar',
      vencida:   'Vencida',
    };
    return labels[estado] || estado;
  }

  trackById(index: number, item: any): string {
  return item.id;
}

  verDetalle(factura: any) {
    this.router.navigate(['/detalle', factura.id]);
  }
}