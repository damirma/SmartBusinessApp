import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons, IonBackButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, shareOutline, listOutline, receiptOutline,
  shieldCheckmarkOutline, checkmarkCircleOutline, closeCircleOutline,
  alertCircleOutline, copyOutline, closeOutline, checkmarkOutline,
  ellipseOutline, timeOutline,
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';

@Component({
  selector: 'app-detalle',
  templateUrl: './detalle.page.html',
  styleUrls: ['./detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, CurrencyPipe, DatePipe,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonButtons, IonBackButton,
  ],
})
export class DetallePage implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private facturaService = inject(FacturaService);

  factura: any     = null;
  items: any[]     = [];
  impuestos: any[] = [];
  pagos: any[]     = [];

  cargando         = signal(true);
  mostrarModalPago = signal(false);

  guardandoPago = false;
  fechaPago     = new Date().toISOString().split('T')[0];
  formaPago     = 'Transferencia';
  hoy           = new Date().toISOString().split('T')[0];

  readonly fromLote = signal(false);

  constructor() {
    addIcons({
      arrowBackOutline, shareOutline, listOutline, receiptOutline,
      shieldCheckmarkOutline, checkmarkCircleOutline, closeCircleOutline,
      alertCircleOutline, copyOutline, closeOutline, checkmarkOutline,
      ellipseOutline, timeOutline,
    });
  }

  ngOnInit(): void {
    const from = this.route.snapshot.queryParamMap.get('from');
    this.fromLote.set(from === 'lote');
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.cargarFactura(id);
  }

  goBack(): void {
    if (this.fromLote()) {
      this.router.navigate(['/upload']);
    } else {
      this.router.navigate(['/facturas']);
    }
  }

  cargarFactura(id: string): void {
    this.cargando.set(true);
    this.facturaService.getFactura(id).subscribe({
      next: (data: any[]) => {
        if (data && data.length > 0) {
          const f        = data[0];
          this.factura   = f;
          this.items     = f.factura_items     || [];
          this.impuestos = f.factura_impuestos || [];
          this.pagos     = f.pagos             || [];
        }
        this.cargando.set(false);
      },
      error: () => { this.cargando.set(false); },
    });
  }

  iconoEstado(estado: string): string {
    const iconos: Record<string, string> = {
      pendiente: 'time-outline',
      procesada: 'ellipse-outline',
      pagada:    'checkmark-circle-outline',
      vencida:   'alert-circle-outline',
    };
    return iconos[estado] || 'ellipse-outline';
  }

  estadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente de pago',
      procesada: 'Por revisar',
      pagada:    'Pagada',
      vencida:   'Vencida',
    };
    return labels[estado] || estado;
  }

  esVencida(f: any): boolean {
    if (!f?.fecha_vencimiento) return false;
    return new Date(f.fecha_vencimiento) < new Date() && f.estado !== 'pagada';
  }

  confirmarPago(): void {
    if (!this.factura) return;
    this.guardandoPago = true;
    this.facturaService.actualizarEstado(this.factura.id, 'pagada', this.fechaPago).subscribe({
      next: () => {
        this.factura.estado = 'pagada';
        this.mostrarModalPago.set(false);
        this.guardandoPago = false;
      },
      error: () => { this.guardandoPago = false; },
    });
  }

  desmarcarPago(): void {
    if (!this.factura) return;
    this.facturaService.actualizarEstado(this.factura.id, 'pendiente').subscribe({
      next: () => { this.factura.estado = 'pendiente'; },
    });
  }

  copiarCufe(): void {
    if (this.factura?.cufe) navigator.clipboard.writeText(this.factura.cufe);
  }

  compartir(): void {
    if (!this.factura) return;
    const texto = [
      `Factura ${this.factura.numero}`,
      `Proveedor: ${this.factura.proveedor_nombre}`,
      `Total: $${this.factura.total_pagar?.toLocaleString('es-CO')}`,
      `Estado: ${this.estadoLabel(this.factura.estado)}`,
    ].join('\n');
    if (navigator.share) {
      navigator.share({ title: `Factura ${this.factura.numero}`, text: texto });
    } else {
      navigator.clipboard.writeText(texto);
    }
  }
}
