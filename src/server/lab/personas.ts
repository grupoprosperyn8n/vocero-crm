/**
 * Las 6 personas GUIONADAS del Laboratorio (FR-030). El cliente simulado no
 * usa LLM: son secuencias fijas — determinismo total del lado del cliente.
 * El agente que responde es el REAL (mismo pipeline de US3).
 *
 * Rubro: SEGUROS (Argentina) — el negocio de este sistema. Los arquetipos y
 * las keys son los del upstream; los guiones se reescribieron del rubro
 * ferretería (demo original) al asegurador para que el lab mida al sistema
 * real (1E). Teléfonos +54 sintéticos estables, jamás números reales.
 */

export type Persona = {
  key: string;
  label: string;
  description: string;
  /** Teléfono sintético estable (jamás un número real). */
  phone: string;
  contactName: string;
  script: string[];
};

export const PERSONAS: Persona[] = [
  {
    key: "comprador_decidido",
    label: "Comprador decidido",
    description: "Sabe lo que quiere y va directo a contratar.",
    phone: "5491100000001",
    contactName: "[Prueba] Comprador decidido",
    script: [
      "Hola, buenas tardes",
      "¿Me cotizan un seguro de auto? Tengo un Cronos 2022",
      "Dale, ¿cuánto sale la cobertura más completa?",
      "Me convence, lo quiero contratar. ¿Cómo hago el pago?",
    ],
  },
  {
    key: "pregunton_precios",
    label: "Preguntón de precios",
    description: "Pide cotización tras cotización sin decidirse.",
    phone: "5491100000002",
    contactName: "[Prueba] Preguntón de precios",
    script: [
      "Hola, ¿qué precio tiene el seguro de hogar?",
      "¿Y para una moto 110, cuánto sale?",
      "¿Qué coberturas tiene el seguro de vida?",
      "¿Hay descuento si aseguro el auto y el hogar juntos?",
      "Ok, lo voy a pensar",
    ],
  },
  {
    key: "cliente_enojado",
    label: "Cliente enojado",
    description: "Llega molesto por un siniestro que no le resuelven.",
    phone: "5491100000003",
    contactName: "[Prueba] Cliente enojado",
    script: [
      "Hola, esto es el colmo",
      "Hace dos semanas que denuncié el choque y nadie me dice nada, es una porquería de servicio",
      "¿Me van a responder o qué? Quiero una solución YA",
      "Si no me lo solucionan, hago la denuncia en defensa del consumidor",
    ],
  },
  {
    key: "fuera_de_kb",
    label: "Pregunta fuera del conocimiento",
    description: "Pregunta algo que el knowledge base no cubre (fuera_de_kb).",
    phone: "5491100000004",
    contactName: "[Prueba] Fuera del conocimiento",
    script: [
      "Hola, una consulta",
      "Contraté una póliza online la semana pasada, ¿tiene garantía y puedo pedir devolución si no me gusta?",
      "¿Y si a los dos meses me arrepiento me devuelven todo lo que pagué?",
      "¿Dónde reclamo la garantía?",
    ],
  },
  {
    key: "pide_humano",
    label: "Pide un humano",
    description: "Quiere ser atendido por una persona (debe escalar).",
    phone: "5491100000005",
    contactName: "[Prueba] Pide humano",
    script: [
      "Hola",
      "Tengo un problema urgente con la denuncia de un siniestro",
      "Prefiero que me atienda una persona, quiero hablar con un humano",
      "Gracias",
    ],
  },
  {
    key: "errores_modismos",
    label: "Errores y modismos",
    description: "Escribe con faltas de ortografía y modismos argentinos.",
    phone: "5491100000006",
    contactName: "[Prueba] Errores y modismos",
    script: [
      "hola q onda, venden seguros pa la moto?",
      "oiga y no me sabes decir si conviene pagar todo el año junto",
      "cuanto sale la cobertura mas basica de una 110",
      "buenisimo, a la tarde te paso los datos, sale",
    ],
  },
];

export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label])
);
