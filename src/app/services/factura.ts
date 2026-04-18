import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FacturaService {

  private workerUrl    = 'http://34.26.53.228:30080';
  private supabaseUrl  = 'https://zsoynenfjwmeghsvguvg.supabase.co';
  private supabaseKey  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpzb3luZW5mandtZWdoc3ZndXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODkzMjAsImV4cCI6MjA5MTc2NTMyMH0.SV2S5dxz50gmJhKHGk9S21wo7ColQ63B58CZxdFcVM4';

  constructor(private http: HttpClient) {}

  procesarXML(xmlContent: string): Observable<any> {
    return this.http.post(`${this.workerUrl}/procesar`, { xml_content: xmlContent });
  }

  procesarImagen(imagenB64: string, mimeType: string): Observable<any> {
    return this.http.post(`${this.workerUrl}/procesar`, {
      imagen_b64: imagenB64,
      mime_type: mimeType
    });
  }

  getFacturas(filtros?: any): Observable<any> {
    let url = `${this.supabaseUrl}/rest/v1/facturas?select=*&order=procesado_en.desc`;
    if (filtros?.estado) url += `&estado=eq.${filtros.estado}`;
    if (filtros?.pyme_id) url += `&pyme_id=eq.${filtros.pyme_id}`;
    return this.http.get(url, { headers: this.headers() });
  }

  getFactura(id: string): Observable<any> {
    const url = `${this.supabaseUrl}/rest/v1/facturas?id=eq.${id}&select=*,factura_items(*),factura_impuestos(*),pagos(*),autorizaciones_dian(*)`;
    return this.http.get(url, { headers: this.headers() });
  }

  actualizarEstado(id: string, estado: string, fechaPago?: string): Observable<any> {
    const body: any = { estado };
    if (fechaPago) body.fecha_pago = fechaPago;
    return this.http.patch(
      `${this.supabaseUrl}/rest/v1/facturas?id=eq.${id}`,
      body,
      { headers: this.headers() }
    );
  }

  private headers() {
    return {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
    };
  }
}