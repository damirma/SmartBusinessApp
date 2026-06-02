export type AgrupacionTipo = 'mes' | 'proveedor' | 'flat';
export type OrdenTipo      = 'fecha-desc' | 'fecha-asc' | 'monto-desc' | 'monto-asc';

export interface GrupoFacturas {
  clave:      string;   // "2025-09" | "NIT-123456" | "all"
  titulo:     string;   // "Septiembre 2025" | "Proveedor S.A.S" | ""
  subtitulo:  string;   // "12 facturas · $14.2M"
  facturas:   any[];
  totalMonto: number;
  count:      number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function agruparFacturas(
  facturas:   any[],
  agrupacion: AgrupacionTipo,
  orden:      OrdenTipo,
): GrupoFacturas[] {
  const ordenadas = ordenarFacturas(facturas, orden);

  if (agrupacion === 'flat') {
    return [{
      clave:      'all',
      titulo:     '',
      subtitulo:  '',
      facturas:   ordenadas,
      totalMonto: calcTotal(ordenadas),
      count:      ordenadas.length,
    }];
  }

  if (agrupacion === 'mes') {
    return agruparPorMes(ordenadas);
  }

  return agruparPorProveedor(ordenadas);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

function ordenarFacturas(list: any[], orden: OrdenTipo): any[] {
  return [...list].sort((a, b) => {
    switch (orden) {
      case 'fecha-desc': return compareFechas(b.fecha_emision, a.fecha_emision);
      case 'fecha-asc':  return compareFechas(a.fecha_emision, b.fecha_emision);
      case 'monto-desc': return (b.total_pagar ?? 0) - (a.total_pagar ?? 0);
      case 'monto-asc':  return (a.total_pagar ?? 0) - (b.total_pagar ?? 0);
      default:           return 0;
    }
  });
}

function compareFechas(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a)       return 1;
  if (!b)       return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Group by month
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function agruparPorMes(facturas: any[]): GrupoFacturas[] {
  const map = new Map<string, any[]>();

  for (const f of facturas) {
    const fecha = f.fecha_emision ? new Date(f.fecha_emision) : null;
    const clave = fecha
      ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
      : 'sin-fecha';
    if (!map.has(clave)) map.set(clave, []);
    map.get(clave)!.push(f);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))   // desc: "2025-11" > "2025-09"
    .map(([clave, items]) => {
      let titulo: string;
      if (clave === 'sin-fecha') {
        titulo = 'Sin fecha';
      } else {
        const [yearStr, monthStr] = clave.split('-');
        titulo = `${MESES[Number(monthStr) - 1]} ${yearStr}`;
      }
      const total = calcTotal(items);
      return {
        clave,
        titulo,
        subtitulo: buildSubtitulo(items.length, total),
        facturas:  items,
        totalMonto: total,
        count:      items.length,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group by provider
// ─────────────────────────────────────────────────────────────────────────────

function agruparPorProveedor(facturas: any[]): GrupoFacturas[] {
  const map = new Map<string, any[]>();

  for (const f of facturas) {
    const clave = f.proveedor_nit || f.proveedor_nombre || 'desconocido';
    if (!map.has(clave)) map.set(clave, []);
    map.get(clave)!.push(f);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => calcTotal(b) - calcTotal(a))  // desc monto
    .map(([clave, items]) => {
      const nombre  = items[0]?.proveedor_nombre || clave;
      const nit     = items[0]?.proveedor_nit    || '';
      const total   = calcTotal(items);
      const nitPart = nit ? `NIT ${nit} · ` : '';
      return {
        clave,
        titulo:    nombre,
        subtitulo: nitPart + buildSubtitulo(items.length, total),
        facturas:  items,
        totalMonto: total,
        count:      items.length,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcTotal(list: any[]): number {
  return list.reduce((sum, f) => sum + (f.total_pagar ?? 0), 0);
}

function buildSubtitulo(count: number, total: number): string {
  const plural = count !== 1 ? 's' : '';
  return `${count} factura${plural} · ${compactCOP(total)}`;
}

function compactCOP(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)     return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)         return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}
