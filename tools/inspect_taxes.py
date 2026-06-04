import xml.etree.ElementTree as ET
import sys
sys.stdout.reconfigure(encoding='utf-8')

NS = {
    'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
}

def txt(node, path):
    el = node.find(path, NS)
    return el.text.strip() if el is not None and el.text else '?'

raw = open('C:/Users/Administrator/Desktop/Facturas/08000302720000002837/08000302720000002837.xml',
           encoding='utf-8', errors='ignore').read()
root = ET.fromstring(raw.encode('utf-8'))
desc = root.find('.//cac:Attachment/cac:ExternalReference/cbc:Description', NS)
inv = ET.fromstring(desc.text.strip().encode('utf-8'))

print('=== TaxTotal (IVA) ===')
for tt in inv.findall('cac:TaxTotal', NS):
    for sub in tt.findall('cac:TaxSubtotal', NS):
        nombre = txt(sub, 'cac:TaxCategory/cac:TaxScheme/cbc:Name')
        pct    = txt(sub, 'cac:TaxCategory/cbc:Percent')
        valor  = txt(sub, 'cbc:TaxAmount')
        base   = txt(sub, 'cbc:TaxableAmount')
        print(f'  {nombre} {pct}% | base={base} valor={valor}')

print()
print('=== WithholdingTaxTotal (Retenciones) ===')
found = 0
for wt in inv.findall('cac:WithholdingTaxTotal', NS):
    for sub in wt.findall('cac:TaxSubtotal', NS):
        nombre = txt(sub, 'cac:TaxCategory/cac:TaxScheme/cbc:Name')
        pct    = txt(sub, 'cac:TaxCategory/cbc:Percent')
        valor  = txt(sub, 'cbc:TaxAmount')
        base   = txt(sub, 'cbc:TaxableAmount')
        print(f'  {nombre} {pct}% | base={base} valor={valor}')
        found += 1
if found == 0:
    print('  (ninguna)')

print()
print(f'Total impuestos en TaxTotal:            {sum(1 for tt in inv.findall("cac:TaxTotal", NS) for _ in tt.findall("cac:TaxSubtotal", NS))}')
print(f'Total retenciones en WithholdingTaxTotal: {sum(1 for wt in inv.findall("cac:WithholdingTaxTotal", NS) for _ in wt.findall("cac:TaxSubtotal", NS))}')
