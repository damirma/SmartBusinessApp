export interface AutorizacionDian {
  numero: string;
  desde: string;
  hasta: string;
  prefijo: string;
  fecha: string;
}

export interface Proveedor {
  nombre: string;
  nit: string;
  direccion: string;
  email: string;
  telefono: string;
}

export interface Cliente {
  nombre: string;
  nit: string;
  direccion: string;
  email: string;
}

export interface FacturaItem {
  id?: string;
  factura_id?: string;
  numero_linea: number;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor_unitario: number;
  valor_total: number;
}

export interface FacturaImpuesto {
  id?: string;
  factura_id?: string;
  nombre: string;
  porcentaje: number;
  base: number;
  valor: number;
}

export interface FacturaTotales {
  subtotal: number;
  total_con_impuesto: number;
  total_pagar: number;
}

export type EstadoFactura = 'pendiente' | 'pagada' | 'vencida' | 'procesando';
export type FormaPago = 'transferencia' | 'efectivo' | 'cheque' | 'tarjeta' | 'pse';

export interface Factura {
  id?: string;
  pyme_id?: string;
  numero_factura: string;
  tipo: string;
  cufe: string;
  fecha_emision: string;
  hora_emision: string;
  moneda: string;
  observaciones: string;
  url_verificacion?: string;
  estado: EstadoFactura;
  fecha_pago?: string;
  forma_pago?: FormaPago;
  fecha_vencimiento?: string;
  subtotal: number;
  total_con_impuesto: number;
  total_pagar: number;
  raw_json?: unknown;
  procesado_en?: string;
  editado_por_usuario?: boolean;
  // Relaciones (cuando se hace SELECT con JOIN)
  factura_items?: FacturaItem[];
  factura_impuestos?: FacturaImpuesto[];
  autorizaciones_dian?: AutorizacionDian[];
}
