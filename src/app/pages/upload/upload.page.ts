import { Component, signal, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader, IonToolbar, IonContent,
  IonButton, IonIcon, IonButtons, IonBackButton,
  IonFab, IonFabButton, IonProgressBar, IonSpinner,
  IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline, checkmarkCircle, closeCircle, timeOutline,
  listOutline, chevronForwardOutline, sparklesOutline,
  documentTextOutline, documentOutline, imageOutline,
  addOutline, closeOutline,
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';
import { SesionCargaService } from '../../services/sesion-carga.service';
import { ArchivoEnProceso, FormatoArchivo, RespuestaProcesar } from '../../models';

const MAX_CONCURRENTES = 3;

type ModoIndividual = 'vacio' | 'archivado' | 'procesando' | 'listo' | 'error';

@Component({
  selector: 'app-upload',
  templateUrl: './upload.page.html',
  styleUrls: ['./upload.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader, IonToolbar, IonContent,
    IonButton, IonIcon, IonButtons, IonBackButton,
    IonFab, IonFabButton, IonProgressBar, IonSpinner,
    IonSegment, IonSegmentButton, IonLabel,
  ],
})
export class UploadPage {

  private facturaService = inject(FacturaService);
  private sesionCarga    = inject(SesionCargaService);
  private router         = inject(Router);

  // ── Modo ─────────────────────────────────────────────────────────
  modo = signal<'individual' | 'masiva'>('individual');

  // ── Estado — carga individual ─────────────────────────────────────
  indArchivo    = signal<{ file: File; formato: FormatoArchivo } | null>(null);
  indProcesando = signal(false);
  indResultado  = signal<RespuestaProcesar | null>(null);
  indError      = signal<string | null>(null);
  indTiempoMs   = signal(0);

  indEstado = computed((): ModoIndividual => {
    if (this.indProcesando()) return 'procesando';
    if (this.indResultado()) return 'listo';
    if (this.indError())     return 'error';
    if (this.indArchivo())   return 'archivado';
    return 'vacio';
  });

  // ── Estado — carga masiva ─────────────────────────────────────────
  archivos  = signal<ArchivoEnProceso[]>([]);
  dragging  = signal(false);

  procesandoActivos = computed(() => this.archivos().filter(a => a.estado === 'procesando'));
  completados       = computed(() => this.archivos().filter(a => a.estado === 'listo'));
  errores           = computed(() => this.archivos().filter(a => a.estado === 'error'));
  tiempoTotalMs     = computed(() => this.archivos().reduce((s, a) => s + (a.tiempoMs ?? 0), 0));
  todoListo         = computed(() =>
    this.archivos().length > 0 &&
    this.archivos().every(a => a.estado === 'listo' || a.estado === 'error')
  );

  constructor() {
    addIcons({
      cloudUploadOutline, checkmarkCircle, closeCircle, timeOutline,
      listOutline, chevronForwardOutline, sparklesOutline,
      documentTextOutline, documentOutline, imageOutline,
      addOutline, closeOutline,
    });
  }

  // ── Cambio de modo ────────────────────────────────────────────────
  cambiarModo(event: Event): void {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    this.modo.set(value as 'individual' | 'masiva');
  }

  // ── Individual — métodos ──────────────────────────────────────────
  onDropIndividual(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files[0] ?? null;
    if (file) {
      this.indArchivo.set({ file, formato: this.detectarFormato(file) });
      this.indResultado.set(null);
      this.indError.set(null);
      this.indTiempoMs.set(0);
    }
  }

  onFileIndividual(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    if (file) {
      this.indArchivo.set({ file, formato: this.detectarFormato(file) });
      this.indResultado.set(null);
      this.indError.set(null);
      this.indTiempoMs.set(0);
    }
    input.value = '';
  }

  procesarIndividual(): void {
    const ind = this.indArchivo();
    if (!ind || this.indProcesando()) return;
    this.indProcesando.set(true);
    this.indResultado.set(null);
    this.indError.set(null);
    const inicio = performance.now();
    this.facturaService.procesarArchivo(ind.file).subscribe({
      next: res => {
        this.indTiempoMs.set(Math.round(performance.now() - inicio));
        this.indResultado.set(res);
        this.sesionCarga.iniciarLote();
        if (res.guardado?.factura_id) {
          this.sesionCarga.agregarALote(res.guardado.factura_id);
        }
        this.indProcesando.set(false);
      },
      error: (err: Error) => {
        this.indTiempoMs.set(Math.round(performance.now() - inicio));
        this.indError.set(err?.message ?? 'Error desconocido');
        this.indProcesando.set(false);
      },
    });
  }

  limpiarIndividual(): void {
    this.indArchivo.set(null);
    this.indResultado.set(null);
    this.indError.set(null);
    this.indTiempoMs.set(0);
  }

  verDetalleIndividual(): void {
    const fid = this.indResultado()?.guardado?.factura_id;
    if (fid) this.router.navigate(['/detalle', fid], { queryParams: { from: 'lote' } });
  }

  iconoFormato(fmt: FormatoArchivo): string {
    const map: Record<FormatoArchivo, string> = {
      xml:         'document-text-outline',
      pdf:         'document-outline',
      imagen:      'image-outline',
      zip:         'folder-open-outline',
      desconocido: 'document-outline',
    };
    return map[fmt];
  }

  // ── Masiva — métodos ──────────────────────────────────────────────
  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    this.agregarArchivos(Array.from(e.dataTransfer?.files ?? []));
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.agregarArchivos(Array.from(input.files ?? []));
    input.value = '';
  }

  agregarArchivos(files: File[]): void {
    const filtrados = files.filter(f => {
      const fmt = this.detectarFormato(f);
      return fmt !== 'zip' && fmt !== 'desconocido';
    });
    if (filtrados.length === 0) return;
    // Start a fresh lote only when the queue is empty (new batch)
    if (this.archivos().length === 0) {
      this.sesionCarga.iniciarLote();
    }
    const nuevos: ArchivoEnProceso[] = filtrados.map(f => ({
      id:      crypto.randomUUID(),
      archivo: f,
      nombre:  f.name,
      tamaño:  f.size,
      formato: this.detectarFormato(f),
      estado:  'cola' as const,
      progreso: 0,
    }));
    this.archivos.update(prev => [...prev, ...nuevos]);
    this.procesarCola();
  }

  abrirDetalle(a: ArchivoEnProceso): void {
    if (a.estado === 'listo' && a.facturaId) {
      this.router.navigate(['/detalle', a.facturaId], { queryParams: { from: 'lote' } });
    }
  }

  limpiar(): void {
    this.archivos.set([]);
    this.sesionCarga.limpiarLote();
  }

  verFacturas(): void {
    this.router.navigate(['/facturas']);
  }

  revisarLote(): void {
    const ids = this.sesionCarga.loteActual().facturaIds;
    if (ids.length === 0) {
      this.router.navigate(['/facturas']);
      return;
    }
    this.router.navigate(['/facturas'], { queryParams: { lote: ids.join(',') } });
  }

  get loteCount(): number {
    return this.sesionCarga.loteActual().facturaIds.length;
  }

  // ── Helpers de UI ─────────────────────────────────────────────────
  formatoLabel(fmt: FormatoArchivo): string {
    const map: Record<FormatoArchivo, string> = {
      xml: 'XML', pdf: 'PDF', imagen: 'IMG', zip: 'ZIP', desconocido: '?',
    };
    return map[fmt];
  }

  fileSize(a: ArchivoEnProceso): string {
    return this.formatBytes(a.tamaño);
  }

  formatBytes(bytes: number): string {
    return bytes < 1_048_576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  formatearTiempo(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  formatCOP(amount: number | undefined): string {
    if (!amount) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0,
    }).format(amount);
  }

  trackById(_: number, a: ArchivoEnProceso): string { return a.id; }

  // ── Privados ──────────────────────────────────────────────────────
  private detectarFormato(file: File): FormatoArchivo {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (file.type === 'text/xml' || file.type === 'application/xml' || ext === 'xml') return 'xml';
    if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (file.type.startsWith('image/') || /^(jpe?g|png|webp|gif)$/.test(ext)) return 'imagen';
    if (file.type === 'application/zip' || ext === 'zip') return 'zip';
    return 'desconocido';
  }

  private procesarCola(): void {
    const disponibles = MAX_CONCURRENTES - this.procesandoActivos().length;
    if (disponibles <= 0) return;
    this.archivos()
      .filter(a => a.estado === 'cola')
      .slice(0, disponibles)
      .forEach(a => this.procesarUno(a.id));
  }

  private procesarUno(id: string): void {
    this.actualizarArchivo(id, { estado: 'procesando', progreso: 50 });
    const archivo = this.archivos().find(a => a.id === id);
    if (!archivo) return;

    const inicio = performance.now();
    this.facturaService.procesarArchivo(archivo.archivo).subscribe({
      next: resultado => {
        const tiempoMs   = Math.round(performance.now() - inicio);
        const facturaId  = resultado.guardado?.factura_id;
        if (facturaId) {
          this.sesionCarga.agregarALote(facturaId);
        }
        this.actualizarArchivo(id, { estado: 'listo', progreso: 100, resultado, tiempoMs, facturaId });
        this.procesarCola();
      },
      error: (err: Error) => {
        const tiempoMs = Math.round(performance.now() - inicio);
        this.actualizarArchivo(id, {
          estado: 'error', progreso: 0, tiempoMs,
          error: err?.message ?? 'Error desconocido',
        });
        this.procesarCola();
      },
    });
  }

  private actualizarArchivo(id: string, cambios: Partial<ArchivoEnProceso>): void {
    this.archivos.update(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a));
  }
}
