import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Factura,
  FiltrosFactura,
  RespuestaProcesar,
} from '../models';

@Injectable({ providedIn: 'root' })
export class FacturaService {

  private http = inject(HttpClient);

  private workerUrl   = environment.workerUrl;
  private supabaseUrl = environment.supabaseUrl;
  private supabaseKey = environment.supabaseKey;

  procesarXML(xmlContent: string): Observable<RespuestaProcesar> {
    return this.http.post<RespuestaProcesar>(
      `${this.workerUrl}/procesar`,
      { xml_content: xmlContent }
    );
  }

  procesarImagen(imagenB64: string, mimeType: string): Observable<RespuestaProcesar> {
    return this.http.post<RespuestaProcesar>(
      `${this.workerUrl}/procesar`,
      { imagen_b64: imagenB64, mime_type: mimeType }
    );
  }

  procesarArchivo(file: File): Observable<RespuestaProcesar> {
    const isXml =
      file.type === 'text/xml' ||
      file.type === 'application/xml' ||
      file.name.endsWith('.xml');

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.endsWith('.pdf');

    const isImagen =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif)$/i.test(file.name);

    const isZip =
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      file.name.endsWith('.zip');

    if (isZip) {
      return throwError(() => new Error('ZIP no soportado directamente — extrae los archivos primero'));
    }

    if (!isXml && !isPdf && !isImagen) {
      return throwError(() => new Error('Formato no soportado'));
    }

    return new Observable(observer => {
      const reader = new FileReader();

      reader.onerror = () => {
        observer.error(new Error('Error al leer el archivo'));
      };

      if (isXml) {
        reader.onload = () => {
          const texto = reader.result as string;
          this.procesarXML(texto).subscribe({
            next: v  => { observer.next(v); observer.complete(); },
            error: e => observer.error(e),
          });
        };
        reader.readAsText(file);
      } else {
        // PDF o imagen
        reader.onload = () => {
          const dataUrl  = reader.result as string;
          const base64   = dataUrl.substring(dataUrl.indexOf(',') + 1);
          const mimeType = file.type || 'application/octet-stream';
          this.procesarImagen(base64, mimeType).subscribe({
            next: v  => { observer.next(v); observer.complete(); },
            error: e => observer.error(e),
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  getFacturas(filtros?: FiltrosFactura): Observable<Factura[]> {
    let url = `${this.supabaseUrl}/rest/v1/facturas?select=*&order=procesado_en.desc`;
    if (filtros?.estado) url += `&estado=eq.${filtros.estado}`;
    if (filtros?.pyme_id) url += `&pyme_id=eq.${filtros.pyme_id}`;
    return this.http.get<Factura[]>(url, { headers: this.headers() });
  }

  getFactura(id: string): Observable<Factura[]> {
    const url = `${this.supabaseUrl}/rest/v1/facturas?id=eq.${id}` +
      `&select=*,factura_items(*),factura_impuestos(*),autorizaciones_dian(*)`;
    return this.http.get<Factura[]>(url, { headers: this.headers() });
  }

  actualizarEstado(
    id: string,
    estado: Factura['estado'],
    fechaPago?: string
  ): Observable<void> {
    const body: Partial<Factura> = { estado };
    if (fechaPago) body.fecha_pago = fechaPago;
    return this.http.patch<void>(
      `${this.supabaseUrl}/rest/v1/facturas?id=eq.${id}`,
      body,
      { headers: this.headers() }
    );
  }

  actualizarCampos(id: string, campos: Partial<Factura>): Observable<void> {
    return this.http.patch<void>(
      `${this.supabaseUrl}/rest/v1/facturas?id=eq.${id}`,
      { ...campos, editado_por_usuario: true },
      { headers: this.headers() }
    );
  }

  guardarPerfil(pyme_id: string, perfil: Record<string, unknown>): Observable<unknown> {
    const headers = this.headers().set('Prefer', 'return=minimal');
    return this.http.post<unknown>(
      `${this.supabaseUrl}/rest/v1/perfil_extraccion`,
      { pyme_id, perfil_json: perfil, creado_en: new Date().toISOString() },
      { headers }
    );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
    });
  }
}
