import csv, sys
sys.stdout.reconfigure(encoding='utf-8')

campos_ok = ['ok_numero','ok_cufe','ok_fecha','ok_nit_prov','ok_nombre_prov',
             'ok_nit_cli','ok_total','ok_subtotal','ok_num_items','ok_num_impuestos']

with open('tools/test_5_facturas.csv', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

print(f"Filas en CSV: {len(rows)}\n")
print(f"{'Carpeta':<32} {'Metodo':<14} {'Exactitud':>9}  {'Tiempo':>7}  {'TokIn':>6}  Estado")
print("-" * 90)
for r in rows:
    err = r.get('error','')
    estado = ('ERR: ' + err[:35]) if err else 'OK'
    print(f"{r['carpeta'][:30]:<32} {r['metodo']:<14} {r['exactitud_global']:>9}  "
          f"{r['tiempo_seg']:>6}s  {r['tokens_entrada']:>6}  {estado}")
