import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons, IonBackButton,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, shareOutline, listOutline, receiptOutline,
  shieldCheckmarkOutline, checkmarkCircleOutline, closeCircleOutline,
  alertCircleOutline, copyOutline, closeOutline, checkmarkOutline,
  ellipseOutline, timeOutline, createOutline, saveOutline,
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';
import { Factura } from '../../models';

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
  private toastCtrl      = inject(ToastController);

  factura: any     = null;
  items: any[]     = [];
  impuestos: any[] = [];
  pagos: any[]     = [];

  cargando         = signal(true);
  mostrarModalPago = signal(false);
  modoEdicion      = signal(false);

  guardandoPago    = false;
  guardandoEdicion = false;
  fechaPago        = new Date().toISOString().split('T')[0];
  formaPago        = 'Transferencia';
  hoy              = new Date().toISOString().split('T')[0];

  readonly fromLote = signal(false);

  edicion: Partial<Factura> & { numero?: string; proveedor_nombre?: string; proveedor_nit?: string } = {};

  constructor() {
    addIcons({
      arrowBackOutline, shareOutline, listOutline, receiptOutline,
      shieldCheckmarkOutline, checkmarkCircleOutline, closeCircleOutline,
      alertCircleOutline, copyOutline, closeOutline, checkmarkOutline,
      ellipseOutline, timeOutline, createOutline, saveOutline,
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

  // ── Edición de campos ──────────────────────────────────────────────

  entrarEdicion(): void {
    this.edicion = {
      numero:           this.factura.numero,
      proveedor_nombre: this.factura.proveedor_nombre,
      proveedor_nit:    this.factura.proveedor_nit,
      total_pagar:      this.factura.total_pagar,
      fecha_emision:    this.factura.fecha_emision,
    };
    this.modoEdicion.set(true);
  }

  cancelarEdicion(): void {
    this.edicion = {};
    this.modoEdicion.set(false);
  }

  guardarEdicion(): void {
    if (!this.factura?.id || this.guardandoEdicion) return;
    this.guardandoEdicion = true;
    this.facturaService.actualizarCampos(this.factura.id, this.edicion as Partial<Factura>).subscribe({
      next: () => {
        Object.assign(this.factura, this.edicion, { editado_por_usuario: true });
        this.edicion = {};
        this.modoEdicion.set(false);
        this.guardandoEdicion = false;
      },
      error: () => { this.guardandoEdicion = false; },
    });
  }

  // ── Estado y pago ────────────────────────────────────────────────

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

  async compartir(): Promise<void> {
    if (!this.factura) return;

    const texto = [
      `Factura ${this.factura.numero ?? '—'}`,
      `Proveedor: ${this.factura.proveedor_nombre ?? '—'}`,
      `NIT: ${this.factura.proveedor_nit ?? '—'}`,
      `Fecha: ${this.factura.fecha_emision ?? '—'}`,
      `Total: $${this.factura.total_pagar?.toLocaleString('es-CO') ?? '0'}`,
      this.factura.cufe ? `CUFE: ${this.factura.cufe}` : null,
      '',
      'Procesado con SmartBusiness OCR',
    ].filter(l => l !== null).join('\n');

    const shareData = { title: `Factura ${this.factura.numero}`, text: texto };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        // AbortError = usuario canceló el diálogo — no es un error real
        if (err?.name !== 'AbortError') {
          await this.copiarAlPortapapeles(texto);
        }
      }
    } else {
      await this.copiarAlPortapapeles(texto);
    }
  }

  private async copiarAlPortapapeles(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      await this.mostrarToast('Resumen copiado al portapapeles', 'success');
    } catch {
      await this.mostrarToast('No se pudo compartir el resumen', 'danger');
    }
  }

  private async mostrarToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
