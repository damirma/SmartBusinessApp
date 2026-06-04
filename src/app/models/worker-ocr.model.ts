import { AutorizacionDian, Cliente, FacturaImpuesto, FacturaItem, FacturaTotales, Proveedor } from './factura.model';

export interface DocumentoOcr {
  numero: string;
  tipo: string;
  cufe: string;
  fecha_emision: string;
  hora_emision: string;
  moneda: string;
  observaciones: string;
  autorizacion_dian?: AutorizacionDian;
  url_verificacion?: string;
}

export interface PagoOcr {
  forma: string;
  fecha_vencimiento: string;
}

/** Estructura del JSON que devuelve POST /procesar del worker-ocr */
export interface ProcesamientoResultado {
  fuente: 'xml' | 'imagen_gemini' | 'pdf_markdown' | 'pdf_vision';
  procesado_en: string;
  documento: DocumentoOcr;
  proveedor: Proveedor;
  cliente: Cliente;
  pago: PagoOcr;
  items: FacturaItem[];
  impuestos: FacturaImpuesto[];
  totales: FacturaTotales;
}

/** Respuesta completa del endpoint /procesar */
export interface RespuestaProcesar {
  ok: boolean;
  guardado?: { factura_id: string };
  data?: ProcesamientoResultado;
  error?: string;
}

/** Filtros para getFacturas() */
export interface FiltrosFactura {
  estado?: string;
  pyme_id?: string;
  busqueda?: string;
}
