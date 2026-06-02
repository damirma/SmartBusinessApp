import { Injectable, signal, computed } from '@angular/core';

export interface LoteActual {
  id: string;
  facturaIds: string[];
}

@Injectable({ providedIn: 'root' })
export class SesionCargaService {
  private _lote = signal<LoteActual>({ id: '', facturaIds: [] });

  readonly loteActual = this._lote.asReadonly();
  readonly tieneLote  = computed(() => this._lote().facturaIds.length > 0);

  iniciarLote(): void {
    this._lote.set({ id: crypto.randomUUID(), facturaIds: [] });
  }

  agregarALote(facturaId: string): void {
    this._lote.update(l => ({ ...l, facturaIds: [...l.facturaIds, facturaId] }));
  }

  limpiarLote(): void {
    this._lote.set({ id: '', facturaIds: [] });
  }

  estaEnLoteActual(facturaId: string): boolean {
    return this._lote().facturaIds.includes(facturaId);
  }
}
