import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonButtons, IonProgressBar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, arrowForwardOutline, checkmarkCircle
} from 'ionicons/icons';

interface Step {
  id: string;
  badge: string;
  title: string;
  sub: string;
  type: 'single' | 'multi';
  cols?: number;
  conditional?: (answers: any) => boolean;
  scores?: Record<string, Record<string, number>>;
  impact?: Record<string, string[]>;
  opts: Array<{ icon: string; label: string; sub: string; val: string }>;
}

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonButtons, IonProgressBar
  ],
})
export class OnboardingPage implements OnInit {

  currentStep = 0;
  answers: Record<string, any> = {};
  selectedOpts: string[] = [];
  scores = { inv: 0, svc: 0, aud: 0 };
  perfil: any = null;
  showFinal = false;
  saving = false;

  steps: Step[] = [
    {
      id: 'que_compras',
      badge: 'Perfil de extracción',
      title: '¿Qué compras principalmente?',
      sub: 'Esta pregunta define cómo el sistema va a leer tus documentos.',
      type: 'single', cols: 1,
      scores: {
        reventa:  { inv: 3 }, insumos: { inv: 3 },
        servicios:{ svc: 3 }, activos: { inv: 1, aud: 1 }, mixto: { inv: 1, svc: 1 },
      },
      impact: {
        reventa:  ['Extracción de líneas: cantidad, unidad, precio unitario', 'Validación de sumas activa'],
        insumos:  ['Extracción de materiales con cantidades', 'Separación: materiales vs servicios'],
        servicios:['Retenciones: tipo, base, tarifa, valor', 'Referencias: contrato, orden de servicio'],
        activos:  ['Campos extra: serial, placa', 'Alerta de activo fijo'],
        mixto:    ['Heurística por ítem automática', 'Modo adaptativo'],
      },
      opts: [
        { icon: '📦', label: 'Mercancía para revender', sub: 'La compras y la vendes tal cual', val: 'reventa' },
        { icon: '🧱', label: 'Insumos o materias primas', sub: 'Para producir o fabricar', val: 'insumos' },
        { icon: '🤝', label: 'Servicios externos', sub: 'Transporte, mantenimiento...', val: 'servicios' },
        { icon: '⚙️', label: 'Maquinaria y equipos', sub: 'Herramientas, computadores...', val: 'activos' },
        { icon: '🔀', label: 'Mixto', sub: 'Productos y servicios', val: 'mixto' },
      ]
    },
    {
      id: 'nivel_detalle',
      badge: 'Nivel de extracción',
      title: '¿Cuánto detalle necesitas?',
      sub: 'Define el nivel de información que extraemos.',
      type: 'single', cols: 1,
      scores: { solo_totales: {}, cant_precios: { inv: 2 }, completo: { inv: 2, aud: 2 } },
      impact: {
        solo_totales: ['Nivel 1 — Solo totales y proveedor'],
        cant_precios: ['Nivel 2 — Cantidad, unidad, precio unitario'],
        completo:     ['Nivel 3 — Detalle completo con impuestos'],
      },
      opts: [
        { icon: '🟢', label: 'Solo totales', sub: 'Cuánto gasté, a quién, cuándo', val: 'solo_totales' },
        { icon: '🟡', label: 'Detalle por producto', sub: 'Cantidades y precios', val: 'cant_precios' },
        { icon: '🔴', label: 'Detalle completo', sub: 'Incluye impuestos y descuentos', val: 'completo' },
      ]
    },
    {
      id: 'retenciones',
      badge: 'Retenciones',
      title: '¿Hay retenciones en tus facturas?',
      sub: 'Retefuente, ICA, ReteIVA aparecen como descuentos.',
      type: 'multi', cols: 2,
      scores: {
        fuente: { svc: 2, aud: 1 }, ica: { svc: 1, aud: 1 },
        rete_iva: { svc: 1, aud: 1 }, no_sabe: {}, no: {},
      },
      impact: { default: ['Retenciones: tipo, base, tarifa, valor', 'Validación de retenciones vs total'] },
      opts: [
        { icon: '💼', label: 'Retefuente', sub: 'Retención en la fuente', val: 'fuente' },
        { icon: '🏙️', label: 'ICA', sub: 'Impuesto municipal', val: 'ica' },
        { icon: '🔁', label: 'ReteIVA', sub: 'Retención de IVA', val: 'rete_iva' },
        { icon: '❓', label: 'No sé', sub: '', val: 'no_sabe' },
        { icon: '✖️', label: 'No aplica', sub: '', val: 'no' },
      ]
    },
    {
      id: 'nivel_auditoria',
      badge: 'Uso de documentos',
      title: '¿Para qué usas estos datos?',
      sub: 'Define el nivel de trazabilidad y validación.',
      type: 'single', cols: 1,
      scores: { control: {}, contabilidad: { aud: 1 }, impuestos: { svc: 1, aud: 2 }, auditoria: { aud: 3 } },
      impact: {
        control:     ['Modo operativo — datos esenciales'],
        contabilidad:['CUFE y NIT validados, raw JSON guardado'],
        impuestos:   ['Tributario — IVA y retenciones críticas'],
        auditoria:   ['Auditable — XML guardado, trazabilidad completa'],
      },
      opts: [
        { icon: '📊', label: 'Control interno', sub: 'Solo saber cuánto gasto', val: 'control' },
        { icon: '📒', label: 'Contabilidad', sub: 'Registros contables formales', val: 'contabilidad' },
        { icon: '🧾', label: 'Impuestos', sub: 'Declaraciones de IVA y retenciones', val: 'impuestos' },
        { icon: '🔍', label: 'Auditoría', sub: 'Máximo nivel de detalle', val: 'auditoria' },
      ]
    },
    {
      id: 'fuente_documentos',
      badge: 'Tipo de documento',
      title: '¿Cómo recibes las facturas?',
      sub: 'Define si usamos lectura directa, OCR o IA.',
      type: 'single', cols: 2,
      scores: { xml: { aud: 1 }, pdf_texto: {}, pdf_escaneado: {}, foto: {}, whatsapp: {}, mixto: {} },
      impact: {
        xml:          ['Lectura XML directa — máxima precisión'],
        pdf_texto:    ['Extracción de PDF con texto'],
        pdf_escaneado:['OCR sobre imagen dentro del PDF'],
        foto:         ['OCR + IA con control de confianza'],
        whatsapp:     ['OCR modo tolerante para baja calidad'],
        mixto:        ['Sistema detecta automáticamente'],
      },
      opts: [
        { icon: '📨', label: 'XML (DIAN)', sub: 'Factura electrónica', val: 'xml' },
        { icon: '📧', label: 'PDF con texto', sub: 'Se puede seleccionar', val: 'pdf_texto' },
        { icon: '🖨️', label: 'PDF escaneado', sub: 'Imagen dentro del PDF', val: 'pdf_escaneado' },
        { icon: '📸', label: 'Foto', sub: 'Imagen del celular', val: 'foto' },
        { icon: '💬', label: 'WhatsApp', sub: 'Mensajes de chat', val: 'whatsapp' },
        { icon: '🔀', label: 'Varias fuentes', sub: 'Depende del proveedor', val: 'mixto' },
      ]
    },
    {
      id: 'tolerancia_error',
      badge: 'Automatización',
      title: '¿Qué hago si falta el NIT o el total?',
      sub: 'Define cuándo guardar automáticamente o pedir revisión.',
      type: 'single', cols: 1,
      scores: { velocidad: {}, precision: { aud: 1 }, hibrido: {} },
      impact: {
        velocidad: ['Guarda con campos marcados', 'Recibes alertas después'],
        precision: ['No guarda hasta que revises', 'Cero errores silenciosos'],
        hibrido:   ['Automático en lo simple, pausa en totales'],
      },
      opts: [
        { icon: '⚡', label: 'Que guarde y me avise', sub: 'Velocidad > Precisión', val: 'velocidad' },
        { icon: '🎯', label: 'Que espere a corrección', sub: 'Precisión > Velocidad', val: 'precision' },
        { icon: '⚖️', label: 'Equilibrio', sub: 'Automático en simple', val: 'hibrido' },
      ]
    },
    {
      id: 'volumen',
      badge: 'Volumen mensual',
      title: '¿Cuántos documentos procesas al mes?',
      sub: 'Define si procesamos en tiempo real o en lotes.',
      type: 'single', cols: 1,
      scores: {},
      impact: { default: ['Sistema optimizado para tu volumen'] },
      opts: [
        { icon: '🌱', label: 'Menos de 10', sub: 'Micronegocio', val: 'micro' },
        { icon: '🟢', label: '10-30 al mes', sub: 'Bajo-medio', val: 'bajo' },
        { icon: '📈', label: '30-100 al mes', sub: 'Regular', val: 'medio' },
        { icon: '🚀', label: 'Más de 100', sub: 'Alto movimiento', val: 'alto' },
      ]
    },
  ];

  constructor(private router: Router) {
    addIcons({ arrowBackOutline, arrowForwardOutline, checkmarkCircle });
  }

  ngOnInit() { this.loadAnswers(); }

  get visibleSteps() {
    return this.steps.filter(s => !s.conditional || s.conditional(this.answers));
  }
  get currentStepData() { return this.visibleSteps[this.currentStep]; }
  get progress() {
    return Math.round(((this.currentStep + 1) / this.visibleSteps.length) * 100);
  }

  loadAnswers() {
    const saved = sessionStorage.getItem('onboarding_answers');
    if (saved) { this.answers = JSON.parse(saved); this.updateScores(); }
  }
  saveAnswers() {
    sessionStorage.setItem('onboarding_answers', JSON.stringify(this.answers));
  }

  toggleOption(val: string) {
    const step = this.currentStepData;
    if (!step) return;
    if (step.type === 'single') {
      this.selectedOpts = [val];
      this.answers[step.id] = val;
    } else {
      const idx = this.selectedOpts.indexOf(val);
      if (idx >= 0) this.selectedOpts.splice(idx, 1);
      else this.selectedOpts.push(val);
      this.answers[step.id] = [...this.selectedOpts];
    }
    this.updateScores();
    this.saveAnswers();
  }

  updateScores() {
    this.scores = { inv: 0, svc: 0, aud: 0 };
    for (const step of this.steps) {
      if (!this.answers[step.id] || !step.scores) continue;
      const vals = Array.isArray(this.answers[step.id])
        ? this.answers[step.id] : [this.answers[step.id]];
      for (const v of vals) {
        const s = step.scores[v];
        if (!s) continue;
        for (const k in s) this.scores[k as keyof typeof this.scores] += s[k];
      }
    }
    this.calculatePerfil();
  }

  calculatePerfil() {
    let nombre = 'Mixto Adaptativo', icon = '🔀';
    if (this.scores.aud >= 3 && this.scores.aud >= this.scores.inv && this.scores.aud >= this.scores.svc) {
      nombre = 'Auditable / Tributario'; icon = '🔍';
    } else if (this.scores.svc > this.scores.inv) {
      nombre = 'Servicios'; icon = '💼';
    } else if (this.answers['que_compras'] === 'activos') {
      nombre = 'Activos Fijos'; icon = '⚙️';
    } else if (this.scores.inv > 0) {
      nombre = this.scores.inv >= 4 ? 'Inventario / Comercio' : 'Insumos / Producción';
      icon   = this.scores.inv >= 4 ? '🛒' : '🧱';
    }
    this.perfil = { nombre, icon, scores: this.scores };
  }

  loadStep() {
    const step = this.currentStepData;
    if (!step) return;
    this.selectedOpts = this.answers[step.id]
      ? Array.isArray(this.answers[step.id]) ? [...this.answers[step.id]] : [this.answers[step.id]]
      : [];
  }

  goNext() {
    if (this.currentStep < this.visibleSteps.length - 1) { this.currentStep++; this.loadStep(); }
    else this.showFinal = true;
  }
  goBack() {
    if (this.currentStep > 0) { this.currentStep--; this.loadStep(); }
  }
  canNext(): boolean { return this.selectedOpts.length > 0; }

  async finalizarOnboarding() {
    this.saving = true;
    console.log('✅ Respuestas:', this.answers);
    console.log('🎯 Perfil:', this.perfil);
    sessionStorage.removeItem('onboarding_answers');
    this.router.navigate(['/upload']);
    this.saving = false;
  }
}