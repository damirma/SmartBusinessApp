import { RespuestaProcesar } from './worker-ocr.model';

export type FormatoArchivo = 'xml' | 'pdf' | 'imagen' | 'zip' | 'desconocido';
export type EstadoArchivo = 'cola' | 'procesando' | 'listo' | 'error';

export interface ArchivoEnProceso {
  id: string;           // generado con crypto.randomUUID()
  archivo: File;
  nombre: string;
  tamaño: number;       // bytes
  formato: FormatoArchivo;
  estado: EstadoArchivo;
  tiempoMs?: number;
  resultado?: RespuestaProcesar;
  facturaId?: string;   // id en Supabase, disponible cuando estado='listo'
  error?: string;
  progreso: number;     // 0-100
}
