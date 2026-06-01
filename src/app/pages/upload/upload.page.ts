import { Component, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline, cameraOutline, documentTextOutline,
  documentOutline, folderOpenOutline, closeOutline,
  checkmarkCircle, closeCircle, arrowForwardOutline,
  addOutline, alertCircleOutline, refreshOutline, imageOutline
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';
import { RespuestaProcesar } from '../../models';

interface ZipInfo {
  valido: boolean;
  tieneXml: boolean;
  tienePdf: boolean;
  archivos: string[];
}

@Component({
  selector: 'app-upload',
  templateUrl: './upload.page.html',
  styleUrls: ['./upload.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink, CurrencyPipe,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonButtons,
  ],
})
export class UploadPage {

  private facturaService = inject(FacturaService);
  private router         = inject(Router);

  archivoSeleccionado: File | null = null;
  tipoArchivo  = '';
  iconoArchivo = 'document-outline';
  dragging     = false;
  procesando   = false;
  procesoStep  = 0;
  mensajeProceso = 'Procesando documento...';
  resultado: RespuestaProcesar | null = null;
  errorMensaje: string | null = null;
  zipInfo: ZipInfo | null = null;

  get facturaId(): string | null {
    return this.resultado?.guardado?.factura_id ?? null;
  }

  constructor() {
    addIcons({
      cloudUploadOutline, cameraOutline, documentTextOutline,
      documentOutline, folderOpenOutline, closeOutline,
      checkmarkCircle, closeCircle, arrowForwardOutline,
      addOutline, alertCircleOutline, refreshOutline, imageOutline
    });
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging = true;
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.procesarArchivo(file);
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) this.procesarArchivo(file);
  }

  procesarArchivo(file: File) {
    this.archivoSeleccionado = file;
    this.resultado = null;
    this.errorMensaje = null;
    this.zipInfo = null;
    const ext = file.name.split('.').pop()?.toLowerCase();

    const tipos: Record<string, string> = {
      xml: 'XML', pdf: 'PDF', zip: 'ZIP',
      jpg: 'Imagen', jpeg: 'Imagen', png: 'Imagen'
    };
    this.tipoArchivo = tipos[ext || ''] || ext?.toUpperCase() || '';

    const iconos: Record<string, string> = {
      xml:  'document-text-outline',
      pdf:  'document-outline',
      zip:  'folder-open-outline',
      jpg:  'image-outline',
      jpeg: 'image-outline',
      png:  'image-outline'
    };
    this.iconoArchivo = iconos[ext || ''] || 'document-outline';

    if (ext === 'zip') this.inspeccionarZip(file);
  }

  async inspeccionarZip(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      const text   = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const archivos: string[] = [];
      const regex = /PK\x03\x04.{26}([^\x00]+)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const nombre = match[1].replace(/[^\x20-\x7E]/g, '').trim();
        if (nombre) archivos.push(nombre);
      }
      const tieneXml = archivos.some(a => a.toLowerCase().endsWith('.xml'));
      const tienePdf = archivos.some(a => a.toLowerCase().endsWith('.pdf'));
      this.zipInfo = { valido: tieneXml, tieneXml, tienePdf, archivos };
    } catch {
      this.zipInfo = { valido: false, tieneXml: false, tienePdf: false, archivos: [] };
    }
  }

  tomarFoto() {
    const input = document.createElement('input');
    input.type    = 'file';
    input.accept  = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => this.onFileSelected(e);
    input.click();
  }

  limpiar() {
    this.archivoSeleccionado = null;
    this.resultado    = null;
    this.errorMensaje = null;
    this.tipoArchivo  = '';
    this.zipInfo      = null;
    this.procesoStep  = 0;
  }

  async procesarFactura() {
    if (!this.archivoSeleccionado) return;
    this.procesando   = true;
    this.errorMensaje = null;
    this.procesoStep  = 1;

    const simularPasos = setInterval(() => {
      if (this.procesoStep < 3) this.procesoStep++;
    }, 1200);

    const onError = (err: any) => {
      clearInterval(simularPasos);
      this.procesando   = false;
      this.errorMensaje = err?.error?.error
        || 'No se pudo conectar con el servidor. Verifica tu conexión.';
    };

    try {
      const ext = this.archivoSeleccionado.name.split('.').pop()?.toLowerCase();

      if (ext === 'xml') {
        this.mensajeProceso = 'Leyendo documento...';
        const texto = await this.archivoSeleccionado.text();
        this.facturaService.procesarXML(texto).subscribe({
          next: (res) => { this.resultado = res; this.procesando = false; clearInterval(simularPasos); },
          error: onError
        });
      } else {
        this.mensajeProceso = 'Analizando documento...';
        const b64  = await this.fileToBase64(this.archivoSeleccionado);
        const mime = ext === 'pdf' ? 'application/pdf'
          : ext === 'zip' ? 'application/zip'
          : `image/${ext}`;
        this.facturaService.procesarImagen(b64, mime).subscribe({
          next: (res) => { this.resultado = res; this.procesando = false; clearInterval(simularPasos); },
          error: onError
        });
      }
    } catch {
      clearInterval(simularPasos);
      this.procesando   = false;
      this.errorMensaje = 'Error al leer el archivo. Intenta con otro documento.';
    }
  }

  irADetalle() {
    if (this.facturaId) this.router.navigate(['/detalle', this.facturaId]);
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  }
}
