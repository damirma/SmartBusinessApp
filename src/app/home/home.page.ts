import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonIcon, IonSkeletonText
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircle, documentTextOutline, chevronForwardOutline,
  receiptOutline, alertCircleOutline, checkmarkCircleOutline,
  timeOutline, trendingUpOutline
} from 'ionicons/icons';
import { FacturaService } from '../services/factura';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink, CurrencyPipe, DatePipe,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonIcon, IonSkeletonText,
  ],
})
export class HomePage implements OnInit {

  private facturaService = inject(FacturaService);
  private router         = inject(Router);

  cargando  = true;
  facturas: any[] = [];
  hoy = new Date();

  get ultimasFacturas(): any[] { return this.facturas.slice(0, 5); }
  get totalFacturas():   number { return this.facturas.length; }
  get totalPendiente():  number {
    return this.facturas
      .filter(f => f.estado !== 'pagada')
      .reduce((s, f) => s + (f.total_pagar || 0), 0);
  }
  get totalPagado(): number {
    return this.facturas
      .filter(f => f.estado === 'pagada')
      .reduce((s, f) => s + (f.total_pagar || 0), 0);
  }
  get cantPendientes(): number {
    return this.facturas.filter(f => f.estado !== 'pagada').length;
  }

  constructor() {
    addIcons({
      addCircle, documentTextOutline, chevronForwardOutline,
      receiptOutline, alertCircleOutline, checkmarkCircleOutline,
      timeOutline, trendingUpOutline
    });
  }

  ngOnInit() { this.cargarDatos(); }

  cargarDatos() {
    this.cargando = true;
    this.facturaService.getFacturas().subscribe({
      next: (data: any[]) => {
        this.facturas = data;
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      pagada: 'pagada', pendiente: 'pendiente',
      procesada: 'pendiente', vencida: 'vencida',
    };
    return map[estado] ?? 'pendiente';
  }

  estadoLabel(estado: string): string {
    const map: Record<string, string> = {
      pagada: 'Pagada', pendiente: 'Pendiente',
      procesada: 'Por revisar', vencida: 'Vencida',
    };
    return map[estado] ?? estado;
  }

  numeroFactura(f: any): string {
    return f.numero_factura || f.numero || '—';
  }

  irADetalle(id: string) {
    this.router.navigate(['/detalle', id]);
  }

  trackById(_: number, item: any): string { return item.id; }
}
