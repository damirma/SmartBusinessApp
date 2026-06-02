import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline, cameraOutline, documentTextOutline,
  documentOutline, folderOpenOutline, closeOutline,
  checkmarkCircle, closeCircle, sparklesOutline,
  gridOutline, addOutline, shieldCheckmarkOutline
} from 'ionicons/icons';
import { FacturaService } from '../../services/factura';

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

  archivoSeleccionado: File | null = null;
  tipoArchivo = '';
  iconoArchivo = 'document-outline';
  dragging = false;
  procesando = false;
  procesoStep = 0;
  mensajeProceso = 'Procesando documento...';
  resultado: any = null;
  zipInfo: ZipInfo | null = null;

  constructor(private facturaService: FacturaService) {
    addIcons({
      cloudUploadOutline, cameraOutline, documentTextOutline,
      documentOutline, folderOpenOutline, closeOutline,
      checkmarkCircle, closeCircle, sparklesOutline,
      gridOutline, addOutline, shieldCheckmarkOutline
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
    this.zipInfo = null;
    const ext = file.name.split('.').pop()?.toLowerCase();

    const tipos: Record<string, string> = {
      xml: 'XML', pdf: 'PDF', zip: 'ZIP',
      jpg: 'Imagen', jpeg: 'Imagen', png: 'Imagen'
    };
    this.tipoArchivo = tipos[ext || ''] || ext?.toUpperCase() || '';

    const iconos: Record<string, string> = {
      xml: 'document-text-outline',
      pdf: 'document-outline',
      zip: 'folder-open-outline',
      jpg: 'image-outline',
      jpeg: 'image-outline',
      png: 'image-outline'
    };
    this.iconoArchivo = iconos[ext || ''] || 'document-outline';

    if (ext === 'zip') this.inspeccionarZip(file);
  }

  async inspeccionarZip(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

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
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => this.onFileSelected(e);
    input.click();
  }

  limpiar() {
    this.archivoSeleccionado = null;
    this.resultado = null;
    this.tipoArchivo = '';
    this.zipInfo = null;
    this.procesoStep = 0;
  }

  async procesarFactura() {
    if (!this.archivoSeleccionado) return;
    this.procesando = true;
    this.procesoStep = 1;

    const simularPasos = setInterval(() => {
      if (this.procesoStep < 3) this.procesoStep++;
    }, 1200);

    try {
      const ext = this.archivoSeleccionado.name.split('.').pop()?.toLowerCase();

      if (ext === 'xml') {
        this.mensajeProceso = 'Parseando XML DIAN...';
        const texto = await this.archivoSeleccionado.text();
        this.facturaService.procesarXML(texto).subscribe({
          next: (res) => {
            this.resultado = res;
            this.procesando = false;
            clearInterval(simularPasos);
          },
          error: () => {
            this.procesando = false;
            clearInterval(simularPasos);
          }
        });
      } else {
        this.mensajeProceso = ext === 'zip'
          ? 'Extrayendo XML del ZIP...'
          : 'Analizando con Gemini Vision...';
        const b64 = await this.fileToBase64(this.archivoSeleccionado);
        const mime = ext === 'pdf' ? 'application/pdf'
          : ext === 'zip' ? 'application/zip'
          : `image/${ext}`;
        this.facturaService.procesarImagen(b64, mime).subscribe({
          next: (res) => {
            this.resultado = res;
            this.procesando = false;
            clearInterval(simularPasos);
          },
          error: () => {
            this.procesando = false;
            clearInterval(simularPasos);
          }
        });
      }
    } catch {
      this.procesando = false;
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  }
}