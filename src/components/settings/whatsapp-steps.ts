/**
 * 043/045 — Asistente de conexión: datos de los pasos, requisitos previos,
 * datos del negocio para el alta y resumen de handoff.
 *
 * Sin JSX a propósito: el resumen y el catálogo de pasos se testean con
 * Vitest sin montar React (whatsapp-assistant.tsx solo los renderiza).
 */

export type AssistantCaptureField = "businessId" | "wabaId" | "phoneNumberId";

export type AssistantStep = {
  n: number;
  title: string;
  lead: string;
  body: string[];
  link: { href: string; label: string } | null;
  capture: {
    field: AssistantCaptureField;
    label: string;
    placeholder: string;
    hint: string;
    optional?: boolean;
  } | null;
  warning: string | null;
  tip: string | null;
};

export const TOTAL_ASSISTANT_STEPS = 7;

/**
 * 045-A — «Antes de empezar»: lo que conviene tener listo antes del paso 1.
 * Contenido de referencia: no se captura nada de acá.
 */
export type PrerequisiteItem = { title: string; text: string };

export const PREREQUISITES: PrerequisiteItem[] = [
  {
    title: "El número que vas a conectar",
    text: "Si hoy lo usas en la app de WhatsApp del celular, al conectarlo sale de la app (el chip queda para llamadas y SMS). Si quieres seguir usando WhatsApp en el celular, usa OTRO número.",
  },
  {
    title: "Una tarjeta de pago en tu cuenta de Meta",
    text: "Los envíos de WhatsApp se facturan por mensaje: sin un método de pago cargado en Meta, los mensajes no salen.",
  },
  {
    title: "La cuenta de Facebook que administra el negocio",
    text: "Es la del dueño (o la del celular del local): con esa cuenta se hacen todos los pasos.",
  },
  {
    title: "Documentos, si vas a enviar avisos o crecer",
    text: "Para levantar los límites de envío, Meta pide verificar el negocio: constancia fiscal, comprobante de domicilio y una web funcionando. No es obligatorio para arrancar, pero Meta demora unos días: conviene empezarlo temprano.",
  },
  {
    title: "Los datos del negocio a mano (opcional)",
    text: "Nombre visible, rubro, descripción, web y correo: los puedes cargar en «Datos del negocio para el alta», más abajo, y se suman al resumen para quien te ayude.",
  },
];

export const ASSISTANT_STEPS: AssistantStep[] = [
  {
    n: 1,
    title: "Tu negocio en Meta",
    lead: "Primero, el espacio de tu negocio en Meta: ahí van a vivir tu app, tu cuenta de WhatsApp y tu número.",
    body: [
      "Entra a business.facebook.com con la cuenta de Facebook del negocio.",
      "Si ya tienes una «Configuración del negocio», usa esa; si no, Meta te ofrece crear una.",
      "Anota el ID del negocio: está en Configuración del negocio → Información del negocio.",
    ],
    link: {
      href: "https://business.facebook.com/latest/settings/",
      label: "Abrir Configuración del negocio",
    },
    capture: {
      field: "businessId",
      label: "ID del negocio (opcional)",
      placeholder: "ej. 123456789012345",
      hint: "Está en Configuración del negocio → Información del negocio. Nos sirve por si algún día hace falta el traspaso.",
      optional: true,
    },
    warning:
      "Usa la cuenta de Facebook que va a administrar el WhatsApp del negocio (la del dueño, o la que usa el celular del local).",
    tip: null,
  },
  {
    n: 2,
    title: "La app de Meta",
    lead: "Tu negocio necesita una app propia en Meta (es gratis): es la puerta por la que el CRM habla con WhatsApp.",
    body: [
      "Entra a developers.facebook.com/apps con la misma cuenta del paso 1.",
      "Toca «Crear app».",
      "Elige el caso de uso «Conectar con clientes a través de WhatsApp».",
      "Ponle un nombre (ej. «CRM de mi negocio»), elige el negocio del paso 1 y créala.",
    ],
    link: {
      href: "https://developers.facebook.com/apps/",
      label: "Abrir mis apps de Meta",
    },
    capture: null,
    warning: null,
    tip: "El nombre de la app es interno: nadie más lo ve. Elige el negocio (portfolio) del paso 1 cuando te lo pida.",
  },
  {
    n: 3,
    title: "Tu cuenta de WhatsApp Business",
    lead: "La cuenta (WABA) es la que agrupa tus números de WhatsApp.",
    body: [
      "En el panel de tu app (la del paso 2), abre el menú WhatsApp → «API Setup».",
      "En «Conectar una cuenta de WhatsApp Business»: usa la que te muestre o crea una nueva.",
      "Copia el «WhatsApp Business Account ID» que aparece en esa pantalla.",
    ],
    link: {
      href: "https://developers.facebook.com/apps/",
      label: "Abrir el panel de mi app",
    },
    capture: {
      field: "wabaId",
      label: "WhatsApp Business Account ID",
      placeholder: "el número largo que aparece arriba de todo en API Setup",
      hint: "Lo encuentras en el panel de tu app → WhatsApp → API Setup.",
    },
    warning: null,
    tip: "Si tu negocio ya usa WhatsApp Business en un celular, la cuenta que aparece suele ser esa. Igual eliges qué número conectar en el paso 4.",
  },
  {
    n: 4,
    title: "Tu número de WhatsApp",
    lead: "Hora de conectar el número con el que vas a atender.",
    body: [
      "En API Setup (o en WhatsApp Manager → Números), toca «Agregar número de teléfono».",
      "Elige el país y escribe el número del negocio.",
      "Verifícalo: te llega un código por SMS o por llamada a ESE número.",
      "Te va a pedir un PIN de 6 dígitos: es la clave del número para la API. Anótala.",
      "Copia el «Phone Number ID» (el número largo que aparece al lado de tu número).",
    ],
    link: {
      href: "https://business.facebook.com/latest/whatsapp_manager/overview/",
      label: "Abrir WhatsApp Manager",
    },
    capture: {
      field: "phoneNumberId",
      label: "Phone Number ID",
      placeholder: "el número largo que aparece al lado de tu número",
      hint: "En API Setup o WhatsApp Manager → Números, al lado de tu número.",
    },
    warning:
      "El número conectado sale de la app de WhatsApp del celular: deja de verse ahí y los mensajes se atienden desde el CRM. El chip sigue funcionando para llamadas y SMS comunes. Si quieres seguir usando WhatsApp en el celular, usa OTRO número para el CRM.",
    tip: "Si el número ya está en uso en la app de WhatsApp, Meta te pide borrar esa cuenta de la app antes de continuar. El historial de la app no se migra.",
  },
  {
    n: 5,
    title: "El usuario del sistema y el token",
    lead: "Último dato antes de conectar: el token con el que el CRM habla con Meta. Es duradero y es tuyo.",
    body: [
      "En Configuración del negocio → «Usuarios del sistema», toca «Agregar» (nombre ej. «crm», rol Administrador).",
      "En «Asignar activos»: elige TU APP y TU CUENTA DE WHATSAPP, ambos con permiso completo.",
      "Toca «Generar token» y marca estos tres permisos: business_management, whatsapp_business_messaging y whatsapp_business_management.",
      "Copia el token (empieza con EAA…): lo pegas en el paso 6, acá abajo.",
    ],
    link: {
      href: "https://business.facebook.com/latest/settings/",
      label: "Abrir Configuración del negocio",
    },
    capture: null,
    warning:
      "Trata el token como una contraseña: no lo mandes por chat. Si algún día se revoca, se genera otro y se pega de nuevo acá.",
    tip: "El token del usuario del sistema no vence: se genera una vez. Ojo: el token temporal que muestra «API Setup» dura 24 horas — no sirve para el CRM.",
  },
  {
    n: 6,
    title: "Probar la conexión y guardar",
    lead: "Pega los datos y probamos contra Meta: si el token es válido, vas a ver tu número.",
    body: [],
    link: null,
    capture: null,
    warning: null,
    tip: null,
  },
  {
    n: 7,
    title: "El webhook y la prueba final",
    lead: "Que los mensajes entren al CRM: conecta la entrega de eventos y pruébala en vivo.",
    body: [
      "En el panel de tu app → WhatsApp → «Configuration» → Webhooks: pega la URL y el verify token que ves acá abajo.",
      "Suscribe el campo «messages» (es el que trae los mensajes entrantes).",
      "Prueba real: desde OTRO celular, escríbele a tu número. El mensaje aparece en tu Bandeja.",
      "Responde desde el CRM: se ve como cualquier conversación de WhatsApp.",
    ],
    link: {
      href: "https://developers.facebook.com/apps/",
      label: "Abrir el panel de mi app",
    },
    capture: null,
    warning: null,
    tip: "La firma de los eventos (App Secret) la configura quien administra el servidor, con la variable META_APP_SECRET. Si falta, el asistente te lo avisa acá abajo.",
  },
];

/** 045-B — Datos del negocio para el alta (perfil de WhatsApp), opcionales. */
export type BusinessProfile = {
  name: string;
  category: string;
  description: string;
  website: string;
  email: string;
  address: string;
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  name: "",
  category: "",
  description: "",
  website: "",
  email: "",
  address: "",
};

/** Deep link a «Personas» de la Configuración del negocio (acceso de quien ayuda). */
export const META_PEOPLE_URL =
  "https://business.facebook.com/settings/people";

export type AssistantState = {
  step: number;
  done: number[];
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
  connected: boolean;
  profile?: BusinessProfile;
};

/**
 * 043 — Texto plano para «Pasarle esto a quien me ayuda»: estado de los pasos
 * + datos ya conseguidos, SIN el token (nunca se comparte por chat).
 */
export function buildHandoffSummary(s: AssistantState): string {
  const lines: string[] = [];
  lines.push(
    "¡Hola! Necesito una mano para conectar el WhatsApp del negocio al CRM (Vocero)."
  );
  lines.push("");
  lines.push(
    `Estado del asistente — paso ${s.step} de ${TOTAL_ASSISTANT_STEPS}${s.connected ? " (la conexión ya quedó guardada ✅)" : ""}:`
  );
  for (const st of ASSISTANT_STEPS) {
    const ok = s.connected || s.done.includes(st.n);
    lines.push(`${ok ? "✅" : "⬜"} ${st.n}. ${st.title}`);
  }

  const datos: string[] = [];
  if (s.businessId.trim()) {
    datos.push(`- ID del negocio: ${s.businessId.trim()}`);
  }
  if (s.wabaId.trim()) {
    datos.push(`- WhatsApp Business Account ID: ${s.wabaId.trim()}`);
  }
  if (s.phoneNumberId.trim()) {
    datos.push(`- Phone Number ID: ${s.phoneNumberId.trim()}`);
  }
  if (datos.length > 0) {
    lines.push("", "Datos que ya conseguí:", ...datos);
  }

  const perfil: string[] = [];
  if (s.profile) {
    const p = s.profile;
    if (p.name.trim()) perfil.push(`- Nombre visible: ${p.name.trim()}`);
    if (p.category.trim()) perfil.push(`- Rubro: ${p.category.trim()}`);
    if (p.description.trim())
      perfil.push(`- Descripción: ${p.description.trim()}`);
    if (p.website.trim()) perfil.push(`- Sitio web: ${p.website.trim()}`);
    if (p.email.trim()) perfil.push(`- Correo de contacto: ${p.email.trim()}`);
    if (p.address.trim()) perfil.push(`- Dirección: ${p.address.trim()}`);
  }
  if (perfil.length > 0) {
    lines.push("", "Datos del negocio (para el alta):", ...perfil);
  }

  lines.push(
    "",
    "(El token de acceso no se comparte por acá: se genera y se pega al final, en el CRM → Ajustes → WhatsApp.)"
  );

  const pendiente = ASSISTANT_STEPS.find(
    (st) => !(s.connected || s.done.includes(st.n))
  );
  lines.push(
    "",
    s.connected
      ? "Falta: nada, la conexión ya está guardada. Si algo no funciona, avísame."
      : `Falta: paso ${pendiente?.n ?? s.step} — ${pendiente?.title ?? "terminar la conexión"}.`
  );
  lines.push(
    "",
    "¿Cómo me puedes dar una mano?",
    `1) Para los pasos de Meta: te doy acceso a mi Configuración del negocio (Personas → rol Administrador): ${META_PEOPLE_URL}`,
    "2) En mi CRM: te doy acceso desde Ajustes → Equipo (rol Administrador) y sigues los pasos en Ajustes → WhatsApp.",
    "3) O me dices qué necesitas y lo hago yo.",
    "",
    "¡Gracias!"
  );
  return lines.join("\n");
}
