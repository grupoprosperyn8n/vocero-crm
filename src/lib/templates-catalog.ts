/**
 * 044b-B13 — Catálogo semilla de las Plantillas de Meta (43 mensajes
 * segmentados para WhatsApp, cargados en Configuración→Plantillas / hub Crear)
 * + su versión pre-cargada para el Constructor de publicaciones (el baúl).
 *
 * Fuente: catálogo curado de Rafael Allende Seguros. Es DATO, no lógica:
 * lo siembra `seedTemplateCatalog()` en el servidor (idempotente por code).
 * NO editar a mano sin actualizar también /tmp y el skill; la UI usa
 * CATALOGO_NOMBRE para mostrar el nombre legible de las plantillas sembradas.
 */

export type CatalogoBoton = { tipo: string; label: string };

export type CatalogoPublicacion = {
  titulo: string;
  subtitulo?: string | null;
  cuerpo: string;
  beneficio?: string | null;
  cta?: string | null;
};

export type CatalogoPlantilla = {
  code: string;
  segmento: string;
  nombre: string;
  categoriaMeta: string;
  cuando: string;
  encabezado?: string | null;
  cuerpo: string;
  pie?: string | null;
  variables?: Record<string, string>;
  botones?: CatalogoBoton[];
  auto: boolean;
  reglaAuto?: string | null;
  publicacion: CatalogoPublicacion;
};

export const CATALOGO_VERSION = 1;

/** Los 15 segmentos del catálogo (id -> nombre). */
export const CATALOGO_SEGMENTOS: Record<string, string> = {
  "siniestros": "🔧 Siniestros y gestión",
  "cotizacion": "🔎 Cotización y ventas",
  "renovacion": "🔄 Renovación",
  "bienvenida": "👋 Bienvenida y altas",
  "cobranzas": "💳 Cobranzas",
  "activacion": "🌱 Activación",
  "reactivacion": "💤 Reactivación",
  "retencion": "🛡️ Retención",
  "venta-cruzada": "✚ Venta cruzada",
  "promos": "🎁 Promos y beneficios",
  "calidad": "⭐ Calidad y encuestas",
  "emergencias": "🚨 Emergencias y prevención",
  "terceros": "🤝 Terceros",
  "atencion": "👤 Atención y derivaciones",
  "fidelizacion": "🎂 Fidelización"
};

/** Nombre legible por código (la UI muestra esto en vez del slug). */
export const CATALOGO_NOMBRE: Record<string, { nombre: string; segmento: string }> = {
  "siniestro-documentacion": {
    "nombre": "Documentación de siniestro",
    "segmento": "siniestros"
  },
  "siniestro-estado": {
    "nombre": "Estado del siniestro",
    "segmento": "siniestros"
  },
  "siniestro-derivacion-taller": {
    "nombre": "Derivación a taller / orden de reparación",
    "segmento": "siniestros"
  },
  "siniestro-formulario-denuncia": {
    "nombre": "Formulario de denuncia de siniestro",
    "segmento": "siniestros"
  },
  "poliza-endoso": {
    "nombre": "Actualización de póliza (endoso)",
    "segmento": "siniestros"
  },
  "cotizacion-toma-datos": {
    "nombre": "Cotización: toma de datos",
    "segmento": "cotizacion"
  },
  "cotizacion-recaptura": {
    "nombre": "Recaptura de cotizaciones incompletas",
    "segmento": "cotizacion"
  },
  "cotizacion-seguimiento": {
    "nombre": "Seguimiento de consulta inicial",
    "segmento": "cotizacion"
  },
  "renovacion-aviso": {
    "nombre": "Aviso de vencimiento",
    "segmento": "renovacion"
  },
  "renovacion-cliente-fiel": {
    "nombre": "Renovación cliente fiel",
    "segmento": "renovacion"
  },
  "renovacion-suma": {
    "nombre": "Actualización anual de suma asegurada",
    "segmento": "renovacion"
  },
  "bienvenida-onboarding": {
    "nombre": "Bienvenida a nuevos clientes",
    "segmento": "bienvenida"
  },
  "bienvenida-formulario-legajo": {
    "nombre": "Formulario de actualización de legajo",
    "segmento": "bienvenida"
  },
  "cobranza-pago-rechazado": {
    "nombre": "Pago rechazado",
    "segmento": "cobranzas"
  },
  "cobranza-debito-automatico": {
    "nombre": "Promo débito automático",
    "segmento": "cobranzas"
  },
  "activacion-lead-dormido": {
    "nombre": "Activación de lead dormido",
    "segmento": "activacion"
  },
  "activacion-tramite-incompleto": {
    "nombre": "Activación de trámite incompleto",
    "segmento": "activacion"
  },
  "reactivacion-exclientes": {
    "nombre": "Reactivación de ex clientes (win-back)",
    "segmento": "reactivacion"
  },
  "reactivacion-bonificacion": {
    "nombre": "Reactivación con bonificación",
    "segmento": "reactivacion"
  },
  "reactivacion-venta-vehiculo": {
    "nombre": "Reactivación por venta de vehículo",
    "segmento": "reactivacion"
  },
  "retencion-baja": {
    "nombre": "Retención: solicitud de baja",
    "segmento": "retencion"
  },
  "retencion-precio": {
    "nombre": "Retención preventiva por precio",
    "segmento": "retencion"
  },
  "retencion-morosidad": {
    "nombre": "Retención por morosidad",
    "segmento": "retencion"
  },
  "cruzada-hogar": {
    "nombre": "De auto a hogar",
    "segmento": "venta-cruzada"
  },
  "cruzada-vida": {
    "nombre": "De auto a accidentes personales / vida",
    "segmento": "venta-cruzada"
  },
  "cruzada-multivehiculo": {
    "nombre": "Multivehículo",
    "segmento": "venta-cruzada"
  },
  "cruzada-tecnico": {
    "nombre": "Seguro técnico / movilidad urbana",
    "segmento": "venta-cruzada"
  },
  "cruzada-viaje": {
    "nombre": "Seguro de viaje estacional",
    "segmento": "venta-cruzada"
  },
  "cruzada-upselling": {
    "nombre": "Mejora de cobertura (upselling)",
    "segmento": "venta-cruzada"
  },
  "promo-grupo-familiar": {
    "nombre": "Descuento grupo familiar",
    "segmento": "promos"
  },
  "promo-relampago": {
    "nombre": "Rebaja estacional / relámpago",
    "segmento": "promos"
  },
  "promo-referidos": {
    "nombre": "Promoción por referidos",
    "segmento": "promos"
  },
  "promo-voucher-recompensa": {
    "nombre": "Voucher de recompensa por referidos",
    "segmento": "promos"
  },
  "promo-voucher-alianza": {
    "nombre": "Voucher de alianza comercial",
    "segmento": "promos"
  },
  "promo-voucher-reactivacion": {
    "nombre": "Voucher de bonificación por reactivación",
    "segmento": "promos"
  },
  "calidad-nps": {
    "nombre": "Encuesta rápida NPS",
    "segmento": "calidad"
  },
  "calidad-encuesta-salida": {
    "nombre": "Encuesta de salida",
    "segmento": "calidad"
  },
  "calidad-encuesta-satisfaccion": {
    "nombre": "Encuesta de satisfacción",
    "segmento": "calidad"
  },
  "emergencia-auxilio": {
    "nombre": "Asistencia en ruta / grúa",
    "segmento": "emergencias"
  },
  "emergencia-prevencion-clima": {
    "nombre": "Prevención por alertas climáticas",
    "segmento": "emergencias"
  },
  "terceros-reclamo": {
    "nombre": "Terceros: reclamo de siniestro",
    "segmento": "terceros"
  },
  "atencion-handoff": {
    "nombre": "Transición a asesor humano",
    "segmento": "atencion"
  },
  "fidelizacion-cumpleanos": {
    "nombre": "Saludo de cumpleaños",
    "segmento": "fidelizacion"
  }
};

/** Las 43 plantillas, con su versión lista para el Constructor. */
export const CATALOGO_PLANTILLAS: CatalogoPlantilla[] = [
  {
    "code": "siniestro-documentacion",
    "segmento": "siniestros",
    "nombre": "Documentación de siniestro",
    "categoriaMeta": "Utilidad",
    "cuando": "El liquidador necesita una foto o documento del siniestro para avanzar. Se pide por WhatsApp y el cliente responde con el archivo.",
    "encabezado": "Documentación requerida 📄",
    "cuerpo": "Hola {{1}}. Soy el asistente virtual de Rafael Allende Seguros. El liquidador de tu siniestro {{2}} necesita: {{3}}. Podés enviarlo respondiendo a este mensaje.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del cliente",
      "2": "N° de siniestro",
      "3": "Documentación faltante"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Envío ahora"
      },
      {
        "tipo": "respuesta",
        "label": "Tengo una duda"
      }
    ],
    "auto": true,
    "reglaAuto": "Al registrarse un faltante de documentación en el siniestro",
    "publicacion": {
      "titulo": "Tu siniestro necesita un documento",
      "subtitulo": "Para no frenar el reclamo",
      "cuerpo": "El liquidador está esperando {{3}} para avanzar con tu siniestro {{2}}. Podés enviarlo por acá en un minuto.",
      "beneficio": "Reclamo sin demoras",
      "cta": "Enviar documento"
    }
  },
  {
    "code": "siniestro-estado",
    "segmento": "siniestros",
    "nombre": "Estado del siniestro",
    "categoriaMeta": "Utilidad",
    "cuando": "Cada vez que cambia el estado del trámite en el sistema, avisa el nuevo estado para que el cliente no tenga que preguntar.",
    "encabezado": "Actualización de tu siniestro ✅",
    "cuerpo": "Hola {{1}}. Tu gestión {{2}} ahora está: {{3}}. Cualquier duda me consultás por acá.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del cliente",
      "2": "N° de gestión / patente",
      "3": "Estado actual"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Gracias"
      },
      {
        "tipo": "respuesta",
        "label": "Quiero hablar con el asesor"
      }
    ],
    "auto": true,
    "reglaAuto": "Al cambiar el estado del siniestro en el sistema",
    "publicacion": {
      "titulo": "Tu siniestro avanzó",
      "subtitulo": "Ya está en estado: {{3}}",
      "cuerpo": "Te avisamos apenas se mueve el trámite de {{2}}: ahora está en {{3}}. No hace falta que preguntes, nosotros te escribimos.",
      "beneficio": "Seguimiento transparente",
      "cta": "Ver estado"
    }
  },
  {
    "code": "siniestro-derivacion-taller",
    "segmento": "siniestros",
    "nombre": "Derivación a taller / orden de reparación",
    "categoriaMeta": "Utilidad",
    "cuando": "Cuando el siniestro se aprueba y el auto pasa a reparación: se envía la orden al taller elegido.",
    "encabezado": "Tu auto pasa a reparación 🔧",
    "cuerpo": "Hola {{1}}. Tu siniestro {{2}} fue aprobado y el auto ingresa al taller {{3}}. Podés hacer el seguimiento de la reparación respondiendo por acá.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del cliente",
      "2": "N° de siniestro",
      "3": "Taller asignado"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Confirmo"
      },
      {
        "tipo": "respuesta",
        "label": "Consultar"
      }
    ],
    "auto": true,
    "reglaAuto": "Al aprobarse el siniestro y asignarse taller",
    "publicacion": {
      "titulo": "Tu auto entra al taller",
      "subtitulo": "Siniestro aprobado",
      "cuerpo": "El siniestro {{2}} quedó aprobado y el auto ingresa a {{3}}. Te acompañamos hasta que lo tengas de vuelta.",
      "beneficio": "Reparación en marcha",
      "cta": "Ver taller"
    }
  },
  {
    "code": "siniestro-formulario-denuncia",
    "segmento": "siniestros",
    "nombre": "Formulario de denuncia de siniestro",
    "categoriaMeta": "Utilidad",
    "cuando": "Al avisar un siniestro, se completa la denuncia online con fotos y datos — sin papeles.",
    "encabezado": "Denuncia de siniestro 📋",
    "cuerpo": "Hola {{1}}. Lamentamos lo sucedido. Completá la denuncia de tu {{2}} con fotos del daño y te contactamos hoy mismo.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del cliente",
      "2": "Vehículo / bien afectado"
    },
    "botones": [
      {
        "tipo": "enlace",
        "label": "Completar denuncia"
      },
      {
        "tipo": "respuesta",
        "label": "Estoy bien, gracias"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Denunciá tu siniestro online",
      "subtitulo": "Con fotos, en 2 minutos",
      "cuerpo": "Completá el formulario con fotos del daño y activamos el reclamo al instante.",
      "beneficio": "Sin papeles",
      "cta": "Denunciar ahora"
    }
  },
  {
    "code": "poliza-endoso",
    "segmento": "siniestros",
    "nombre": "Actualización de póliza (endoso)",
    "categoriaMeta": "Utilidad",
    "cuando": "Cuando se procesa un cambio en la póliza (titular, vehículo, uso) y se informa el endoso con los nuevos valores.",
    "encabezado": "Póliza actualizada 🔄",
    "cuerpo": "Hola {{1}}. Te confirmamos que tu póliza {{2}} fue actualizada: {{3}}. La nueva documentación queda disponible.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del cliente",
      "2": "N° de póliza",
      "3": "Detalle del endoso"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Recibido"
      },
      {
        "tipo": "respuesta",
        "label": "Consultar detalle"
      }
    ],
    "auto": true,
    "reglaAuto": "Al procesarse un endoso en la póliza",
    "publicacion": {
      "titulo": "Tu póliza quedó actualizada",
      "subtitulo": "Endoso procesado",
      "cuerpo": "El cambio en {{2}} ya está aplicado: {{3}}. La documentación queda a tu disposición.",
      "beneficio": "Todo en regla",
      "cta": "Ver póliza"
    }
  },
  {
    "code": "cotizacion-toma-datos",
    "segmento": "cotizacion",
    "nombre": "Cotización: toma de datos",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente pide precio: se piden los datos mínimos (vehículo, año, zona) para cotizar en minutos.",
    "encabezado": "Tu cotización en minutos 🚗",
    "cuerpo": "¡Hola {{1}}! Soy {{2}} de Rafael Allende Seguros. Para cotizar tu {{3}} necesito: año, modelo y código postal. ¿Me los pasás y te armo el precio hoy?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Asesor",
      "3": "Tipo de vehículo/seguro"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Te paso los datos"
      },
      {
        "tipo": "respuesta",
        "label": "Quiero que me llames"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Tu cotización en minutos",
      "subtitulo": "Precio de tu {{3}} hoy mismo",
      "cuerpo": "Mandanos año, modelo y código postal y recibís el precio el mismo día.",
      "beneficio": "Respuesta en el día",
      "cta": "Cotizar ahora"
    }
  },
  {
    "code": "cotizacion-recaptura",
    "segmento": "cotizacion",
    "nombre": "Recaptura de cotizaciones incompletas",
    "categoriaMeta": "Marketing",
    "cuando": "La cotización quedó a medias (faltan datos): se recuerda que el precio está reservado unos días.",
    "encabezado": "Tu cotización quedó a medias ⏳",
    "cuerpo": "Hola {{1}}. Guardamos el precio que te pasamos por tu {{2}}, sigue vigente hasta el {{3}}. ¿Terminamos la cotización?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Vehículo/seguro",
      "3": "Fecha de vigencia"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Terminemos"
      },
      {
        "tipo": "respuesta",
        "label": "Después"
      }
    ],
    "auto": true,
    "reglaAuto": "24 h después de una cotización incompleta",
    "publicacion": {
      "titulo": "Tu precio sigue reservado",
      "subtitulo": "Hasta el {{3}}",
      "cuerpo": "Nos quedó pendiente terminar tu cotización de {{2}}. El precio que te pasamos sigue vigente si la cerramos esta semana.",
      "beneficio": "Precio reservado",
      "cta": "Terminar cotización"
    }
  },
  {
    "code": "cotizacion-seguimiento",
    "segmento": "cotizacion",
    "nombre": "Seguimiento de consulta inicial",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente consultó y no respondió: a los 3 días se retoma con una pregunta simple, sin presión.",
    "encabezado": "Seguimiento de tu consulta 📝",
    "cuerpo": "¡Hola {{1}}! Soy {{2}} de Rafael Allende Seguros. Nos consultaste por {{3}} — ¿pudiste verlo o te quedó alguna duda?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Asesor",
      "3": "Producto consultado"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Sí, tengo dudas"
      },
      {
        "tipo": "respuesta",
        "label": "Ya lo resolví"
      },
      {
        "tipo": "respuesta",
        "label": "Hablemos más tarde"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "¿Pudiste ver la información?",
      "subtitulo": "Seguimos por acá",
      "cuerpo": "Te escribimos por tu consulta de {{3}}: si te quedó alguna duda, la resolvemos juntos en minutos.",
      "beneficio": "Atención personal",
      "cta": "Tengo una duda"
    }
  },
  {
    "code": "renovacion-aviso",
    "segmento": "renovacion",
    "nombre": "Aviso de vencimiento",
    "categoriaMeta": "Utilidad",
    "cuando": "15 días antes del vencimiento de la póliza, para que no quede sin cobertura.",
    "encabezado": "Tu póliza está por renovarse 🔔",
    "cuerpo": "Hola {{1}}, tu póliza {{2}} vence el {{3}}. ¿Querés que iniciemos la renovación con las mismas condiciones?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza / vehículo",
      "3": "Fecha de vencimiento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Renovar ahora"
      },
      {
        "tipo": "respuesta",
        "label": "Quiero revisar cobertura"
      }
    ],
    "auto": true,
    "reglaAuto": "15 días antes del vencimiento",
    "publicacion": {
      "titulo": "Tu póliza está por renovarse",
      "subtitulo": "Vence el {{3}}",
      "cuerpo": "Renová antes del vencimiento y mantenés tu cobertura y tu descuento por buen pagador.",
      "beneficio": "Cobertura sin cortes",
      "cta": "Renovar"
    }
  },
  {
    "code": "renovacion-cliente-fiel",
    "segmento": "renovacion",
    "nombre": "Renovación cliente fiel",
    "categoriaMeta": "Marketing",
    "cuando": "Al renovar, se reconoce el historial del cliente con una bonificación.",
    "encabezado": "Gracias por seguir con nosotros 💙",
    "cuerpo": "Hola {{1}}. Por tus {{2}} años con nosotros, tu renovación de {{3}} incluye una bonificación especial. ¿La aplicamos?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Años como cliente",
      "3": "Póliza"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Aplicala"
      },
      {
        "tipo": "respuesta",
        "label": "Ver otras opciones"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Cliente fiel: bonificación en tu renovación",
      "subtitulo": "{{2}} años juntos",
      "cuerpo": "Tu historial tiene premio: renová {{3}} con bonificación especial este mes.",
      "beneficio": "Bonificación especial",
      "cta": "Aplicar"
    }
  },
  {
    "code": "renovacion-suma",
    "segmento": "renovacion",
    "nombre": "Actualización anual de suma asegurada",
    "categoriaMeta": "Utilidad",
    "cuando": "Una vez al año, se propone actualizar la suma asegurada para que la cobertura no quede desfasada.",
    "encabezado": "Revisemos tu cobertura 📈",
    "cuerpo": "Hola {{1}}. Pasó un año desde la última revisión de tu {{2}}. ¿Actualizamos la suma asegurada para que la cobertura siga a tono con los valores de hoy?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Bien asegurado"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Actualizar"
      },
      {
        "tipo": "respuesta",
        "label": "Revisar con vos"
      }
    ],
    "auto": true,
    "reglaAuto": "Aniversario de póliza",
    "publicacion": {
      "titulo": "Tu cobertura, a valor de hoy",
      "subtitulo": "Revisión anual",
      "cuerpo": "Los valores cambiaron: verifiquemos que {{2}} siga asegurado por lo que vale hoy.",
      "beneficio": "Protección actualizada",
      "cta": "Revisar"
    }
  },
  {
    "code": "bienvenida-onboarding",
    "segmento": "bienvenida",
    "nombre": "Bienvenida a nuevos clientes",
    "categoriaMeta": "Utilidad",
    "cuando": "Algunos días después del alta: se presenta el canal de WhatsApp para consultas y gestiones.",
    "encabezado": "¡Bienvenido a Rafael Allende Seguros! 👋",
    "cuerpo": "Hola {{1}}. Sos cliente nuevo: este canal es tu línea directa para consultar, hacer una gestión o pedir asistencia cuando la necesites.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Guardar contacto"
      },
      {
        "tipo": "respuesta",
        "label": "Consultar algo"
      }
    ],
    "auto": true,
    "reglaAuto": "3 días después del alta",
    "publicacion": {
      "titulo": "¡Bienvenido! Ya sos parte",
      "subtitulo": "Tu línea directa por WhatsApp",
      "cuerpo": "Desde ahora nos escribís por acá para cualquier consulta, gestión o urgencia. Guardá el contacto.",
      "beneficio": "Atención directa",
      "cta": "Guardar contacto"
    }
  },
  {
    "code": "bienvenida-formulario-legajo",
    "segmento": "bienvenida",
    "nombre": "Formulario de actualización de legajo",
    "categoriaMeta": "Utilidad",
    "cuando": "Al alta o renovación, se completan los datos del legajo (DNI, licencia, datos del vehículo) de una sola vez.",
    "encabezado": "Completá tu legajo 📋",
    "cuerpo": "Hola {{1}}. Para dejar todo en orden con tu póliza {{2}}, completá tus datos en el formulario. Son 2 minutos y te queda guardado.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza"
    },
    "botones": [
      {
        "tipo": "enlace",
        "label": "Completar formulario"
      },
      {
        "tipo": "respuesta",
        "label": "Completar después"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Completá tu legajo en 2 minutos",
      "subtitulo": "Todo en orden",
      "cuerpo": "Con tus datos actualizados gestionamos más rápido cualquier trámite o siniestro.",
      "beneficio": "Trámites más ágiles",
      "cta": "Completar"
    }
  },
  {
    "code": "cobranza-pago-rechazado",
    "segmento": "cobranzas",
    "nombre": "Pago rechazado",
    "categoriaMeta": "Utilidad",
    "cuando": "El banco rechaza la cuota: se avisa para actualizar el medio de pago y evitar la suspensión de la cobertura.",
    "encabezado": "Aviso de cobro 📢",
    "cuerpo": "Hola {{1}}. El cobro de la cuota {{2}} fue rechazado. Actualizá tu medio de pago antes del {{3}} y seguís cubierto sin interrupciones.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Cuota / período",
      "3": "Fecha límite"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Actualizo ahora"
      },
      {
        "tipo": "respuesta",
        "label": "Cómo hago"
      }
    ],
    "auto": true,
    "reglaAuto": "Al rechazo del cobro por el banco",
    "publicacion": {
      "titulo": "Tu cuota no pudo cobrarse",
      "subtitulo": "Antes del {{3}}",
      "cuerpo": "Actualizá tu medio de pago y seguís cubierto: no dejes que se suspenda la póliza.",
      "beneficio": "Cobertura continua",
      "cta": "Actualizar pago"
    }
  },
  {
    "code": "cobranza-debito-automatico",
    "segmento": "cobranzas",
    "nombre": "Promo débito automático",
    "categoriaMeta": "Marketing",
    "cuando": "Se ofrece adherir la cuota al débito automático con descuento, para evitar olvidos y rechazos.",
    "encabezado": "Pagá menos con débito automático 💳",
    "cuerpo": "Hola {{1}}. Adhiriendo tu póliza {{2}} al débito automático obtenés {{3}}% de descuento y nunca más te olvidás de una cuota.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza",
      "3": "Descuento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Quiero adherir"
      },
      {
        "tipo": "respuesta",
        "label": "Más info"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Ahorrá con débito automático",
      "subtitulo": "{{3}}% de descuento",
      "cuerpo": "Adherí el débito automático y sumá descuento a tu cuota, sin riesgo de olvidos.",
      "beneficio": "Descuento todos los meses",
      "cta": "Adherir"
    }
  },
  {
    "code": "activacion-lead-dormido",
    "segmento": "activacion",
    "nombre": "Activación de lead dormido",
    "categoriaMeta": "Marketing",
    "cuando": "Alguien pidió precio hace tiempo y nunca respondió: se reactiva con tarifas actualizadas.",
    "encabezado": "Actualizamos tu cotización 🔄",
    "cuerpo": "Hola {{1}}. Actualizamos tarifas y bonificaciones para tu {{2}}. ¿Te envío el precio de hoy?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Vehículo/seguro"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Sí, mandame"
      },
      {
        "tipo": "respuesta",
        "label": "No por ahora"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Volvimos con mejores precios",
      "subtitulo": "Tu {{2}}, actualizado",
      "cuerpo": "Bajaron las tarifas y vos podés aprovecharlo. Te paso el número de hoy sin compromiso.",
      "beneficio": "Precio actualizado",
      "cta": "Ver precio"
    }
  },
  {
    "code": "activacion-tramite-incompleto",
    "segmento": "activacion",
    "nombre": "Activación de trámite incompleto",
    "categoriaMeta": "Marketing",
    "cuando": "Una gestión quedó a mitad de camino: se recuerda amablemente para terminarla.",
    "encabezado": "Nos quedó algo pendiente ⏳",
    "cuerpo": "Hola {{1}}. Tu {{2}} quedó a un paso: falta {{3}}. ¿Lo terminamos hoy y queda todo listo?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Trámite/gestión",
      "3": "Paso faltante"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Terminemos"
      },
      {
        "tipo": "respuesta",
        "label": "Te escribo luego"
      }
    ],
    "auto": true,
    "reglaAuto": "48 h después de un trámite sin completar",
    "publicacion": {
      "titulo": "Falta un paso para terminar",
      "subtitulo": "Tu gestión casi lista",
      "cuerpo": "Nos quedó pendiente {{3}} para cerrar tu {{2}}. Lo resolvemos hoy mismo.",
      "beneficio": "Cierre inmediato",
      "cta": "Terminar"
    }
  },
  {
    "code": "reactivacion-exclientes",
    "segmento": "reactivacion",
    "nombre": "Reactivación de ex clientes (win-back)",
    "categoriaMeta": "Marketing",
    "cuando": "Clientes que se fueron: se reabre la conversación con una evaluación de cobertura sin compromiso.",
    "encabezado": "¿Te ayudamos a volver? 🛡️",
    "cuerpo": "Hola {{1}}. Te escribimos de Rafael Allende Seguros. ¿Seguís con el {{2}}? Si querés, te evalúo la cobertura que tenés hoy sin compromiso.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Vehículo"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Sí, evalúen"
      },
      {
        "tipo": "respuesta",
        "label": "No por ahora"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Volvé con beneficios",
      "subtitulo": "Evaluación sin cargo",
      "cuerpo": "Si hoy tenés otra cobertura, te mostramos en cuánto te quedaría con nosotros. Sin compromiso.",
      "beneficio": "Compará y decidí",
      "cta": "Evaluar"
    }
  },
  {
    "code": "reactivacion-bonificacion",
    "segmento": "reactivacion",
    "nombre": "Reactivación con bonificación",
    "categoriaMeta": "Marketing",
    "cuando": "Se ofrece conservar la bonificación histórica para incentivar la vuelta.",
    "encabezado": "Tu bonificación sigue disponible 🎖️",
    "cuerpo": "Hola {{1}}. Tu bonificación por historial sigue guardada: si retomás tu póliza antes del {{2}}, la mantenés entera.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Fecha límite"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Quiero retomar"
      },
      {
        "tipo": "respuesta",
        "label": "Contame más"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Tu bonificación te espera",
      "subtitulo": "Hasta el {{2}}",
      "cuerpo": "Reactivá tu póliza y conservás la bonificación que ganaste como cliente.",
      "beneficio": "Descuento conservado",
      "cta": "Reactivar"
    }
  },
  {
    "code": "reactivacion-venta-vehiculo",
    "segmento": "reactivacion",
    "nombre": "Reactivación por venta de vehículo",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente vendió el auto: se ofrece cubrir el nuevo vehículo.",
    "encabezado": "¿Cambiaste el auto? 🚙",
    "cuerpo": "Hola {{1}}. ¿Vendiste tu auto? Si ya tenés el nuevo, te paso la cotización para dejarlo asegurado desde el primer día.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Sí, cotizame"
      },
      {
        "tipo": "respuesta",
        "label": "Todavía no"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Aseguramos tu auto nuevo",
      "subtitulo": "Desde el día uno",
      "cuerpo": "Vendiste el auto y tenés otro en camino: cotizamos el nuevo para que no salgas sin cobertura.",
      "beneficio": "Sin días sin seguro",
      "cta": "Cotizar nuevo auto"
    }
  },
  {
    "code": "retencion-baja",
    "segmento": "retencion",
    "nombre": "Retención: solicitud de baja",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente pide dar de baja: antes de procesarla, se ofrece una alternativa con descuento.",
    "encabezado": "Antes de dar de baja… 🛡️",
    "cuerpo": "Hola {{1}}, recibimos tu pedido por la póliza {{2}}. Antes de avanzar, ¿te muestro una alternativa con {{3}}% de descuento para seguir protegido?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza",
      "3": "Descuento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Mostrame la alternativa"
      },
      {
        "tipo": "respuesta",
        "label": "Confirmar baja"
      }
    ],
    "auto": true,
    "reglaAuto": "Al registrarse una solicitud de baja",
    "publicacion": {
      "titulo": "Esperá antes de darte de baja",
      "subtitulo": "Tenemos una alternativa",
      "cuerpo": "Antes de cancelar tu póliza, mirá la propuesta con bonificación que preparamos para vos.",
      "beneficio": "{{3}}% de descuento",
      "cta": "Ver alternativa"
    }
  },
  {
    "code": "retencion-precio",
    "segmento": "retencion",
    "nombre": "Retención preventiva por precio",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente expresa que el precio subió demasiado: se ofrece ajuste o plan de pago.",
    "encabezado": "Escuchamos tu preocupación 💬",
    "cuerpo": "Hola {{1}}. Sabemos que ajustar el precio no es el mejor momento. Revisemos juntos tu {{2}}: hay opciones para sostener la cobertura pagando menos.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Ver opciones"
      },
      {
        "tipo": "respuesta",
        "label": "Hablar con vos"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Pagá menos sin perder cobertura",
      "subtitulo": "Opciones de ajuste",
      "cuerpo": "Revisamos tu póliza y aplicamos el mejor ajuste disponible para que sigas protegido.",
      "beneficio": "Cuota más baja",
      "cta": "Ver opciones"
    }
  },
  {
    "code": "retencion-morosidad",
    "segmento": "retencion",
    "nombre": "Retención por morosidad",
    "categoriaMeta": "Marketing",
    "cuando": "Hay cuotas vencidas: se ofrece regularizar en partes antes de que se suspenda la cobertura.",
    "encabezado": "Regularicemos tu situación 🤝",
    "cuerpo": "Hola {{1}}. Tu póliza {{2}} tiene {{3}} pendiente. Podemos armar un plan para regularizarla y no perder la cobertura. ¿Te llamo?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza",
      "3": "Saldo pendiente"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Armemos un plan"
      },
      {
        "tipo": "respuesta",
        "label": "Llamame"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Podés regularizar en partes",
      "subtitulo": "Sin perder cobertura",
      "cuerpo": "Armamos un plan de pago a tu medida para que la póliza quede al día.",
      "beneficio": "Plan flexible",
      "cta": "Armar plan"
    }
  },
  {
    "code": "cruzada-hogar",
    "segmento": "venta-cruzada",
    "nombre": "De auto a hogar",
    "categoriaMeta": "Marketing",
    "cuando": "60 días después del alta de un auto: se ofrece el seguro de hogar con descuento por ser cliente.",
    "encabezado": "Tu casa también merece protección 🏠",
    "cuerpo": "Hola {{1}}. Por ser cliente tenés {{2}}% de descuento para asegurar tu casa. ¿Te paso una cotización rápida?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Descuento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Cotizame el hogar"
      },
      {
        "tipo": "respuesta",
        "label": "Ahora no"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Asegurá tu casa con descuento",
      "subtitulo": "Solo para clientes de auto",
      "cuerpo": "Sumá el hogar a tu cobertura con precio preferencial por ya ser cliente nuestro.",
      "beneficio": "{{2}}% off por ser cliente",
      "cta": "Cotizar hogar"
    }
  },
  {
    "code": "cruzada-vida",
    "segmento": "venta-cruzada",
    "nombre": "De auto a accidentes personales / vida",
    "categoriaMeta": "Marketing",
    "cuando": "Se ofrece la cobertura de accidentes personales o vida al cliente que ya tiene auto — protege a la familia.",
    "encabezado": "Protegé a tu familia 👨‍👩‍👧",
    "cuerpo": "Hola {{1}}. ¿Pensaste qué pasaría con tu familia ante un imprevisto? Tenemos la cobertura de {{2}} desde un costo muy accesible. ¿Te cuento?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Accidentes personales / vida"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Contame"
      },
      {
        "tipo": "respuesta",
        "label": "Después"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "La protección más importante",
      "subtitulo": "Cobertura para tu familia",
      "cuerpo": "Un imprevisto cambia todo: sumá la protección de {{2}} desde un costo accesible.",
      "beneficio": "Tranquilidad",
      "cta": "Ver cobertura"
    }
  },
  {
    "code": "cruzada-multivehiculo",
    "segmento": "venta-cruzada",
    "nombre": "Multivehículo",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente tiene más de un vehículo: se ofrece la póliza múltiple con descuento.",
    "encabezado": "¿Tenés más de un vehículo? 🚗🚙",
    "cuerpo": "Hola {{1}}. Asegurando todos tus vehículos con nosotros obtenés {{2}}% de descuento en el total. ¿Te armo la cotización de la familia completa?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Descuento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Cotizá todo"
      },
      {
        "tipo": "respuesta",
        "label": "Más info"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Sumá todos tus vehículos",
      "subtitulo": "{{2}}% de descuento",
      "cuerpo": "Con la póliza múltiple asegurás cada vehículo pagando menos que por separado.",
      "beneficio": "Descuento combinado",
      "cta": "Cotizar"
    }
  },
  {
    "code": "cruzada-tecnico",
    "segmento": "venta-cruzada",
    "nombre": "Seguro técnico / movilidad urbana",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente usa el auto para trabajar (apps, delivery): se ofrece el seguro técnico con cobertura de fuente de trabajo.",
    "encabezado": "Si el auto labura, cubrilo distinto 🧰",
    "cuerpo": "Hola {{1}}. Si usás el vehículo para trabajar, el seguro técnico cubre lo que una póliza común deja afuera. ¿Te muestro cómo funciona?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Mostrame"
      },
      {
        "tipo": "respuesta",
        "label": "Otra vez será"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Tu herramienta de trabajo, protegida",
      "subtitulo": "Seguro técnico",
      "cuerpo": "Si el auto te da de comer, necesita una cobertura pensada para eso.",
      "beneficio": "Cobertura más completa",
      "cta": "Ver plan"
    }
  },
  {
    "code": "cruzada-viaje",
    "segmento": "venta-cruzada",
    "nombre": "Seguro de viaje estacional",
    "categoriaMeta": "Marketing",
    "cuando": "Antes de las vacaciones o viajes: se ofrece la asistencia de viaje (médica, equipaje).",
    "encabezado": "¿Vacaciones a la vista? ✈️",
    "cuerpo": "Hola {{1}}. Si estás planeando un viaje, la asistencia cubre lo imprevisto: médico, equipaje y más. ¿Te paso los planes?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Pasame los planes"
      },
      {
        "tipo": "respuesta",
        "label": "No viajo"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Viajá tranquilo",
      "subtitulo": "Asistencia de viaje",
      "cuerpo": "Cobertura médica, equipaje y cancelaciones: lo imprevisto deja de ser problema.",
      "beneficio": "Vacaciones tranquilas",
      "cta": "Ver planes"
    }
  },
  {
    "code": "cruzada-upselling",
    "segmento": "venta-cruzada",
    "nombre": "Mejora de cobertura (upselling)",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente tiene cobertura básica: se propone subir a todo riesgo o agregar granizo / cristales.",
    "encabezado": "Mejorá tu cobertura 🛡️",
    "cuerpo": "Hola {{1}}. Tu póliza {{2}} está en una cobertura básica. Por una diferencia chica podés sumar {{3}}. ¿Querés que te calcule el cambio?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza",
      "3": "Cobertura adicional"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Calculame"
      },
      {
        "tipo": "respuesta",
        "label": "Estoy bien así"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Un paso más de protección",
      "subtitulo": "Sumá {{3}}",
      "cuerpo": "Con una diferencia mínima en la cuota ampliás lo que cubre tu póliza.",
      "beneficio": "Más cobertura, poco costo",
      "cta": "Calcular"
    }
  },
  {
    "code": "promo-grupo-familiar",
    "segmento": "promos",
    "nombre": "Descuento grupo familiar",
    "categoriaMeta": "Marketing",
    "cuando": "Hay varios integrantes de la misma familia con vehículos u hogares: se agrupan y todos ganan descuento.",
    "encabezado": "Plan para toda la familia 👨‍👩‍👦",
    "cuerpo": "Hola {{1}}. Asegurando los vehículos de tu familia con nosotros, todos reciben {{2}}% de descuento. ¿Te cuento cómo?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Descuento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Contame cómo"
      },
      {
        "tipo": "respuesta",
        "label": "Después"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Plan Grupo Familiar",
      "subtitulo": "Todos ganan descuento",
      "cuerpo": "Agrupá los seguros de tu familia y paguen menos cada uno.",
      "beneficio": "{{2}}% para todos",
      "cta": "Ver el plan"
    }
  },
  {
    "code": "promo-relampago",
    "segmento": "promos",
    "nombre": "Rebaja estacional / relámpago",
    "categoriaMeta": "Marketing",
    "cuando": "Campaña de días: descuento por tiempo limitado para incentivar cierres y reactivaciones.",
    "encabezado": "¡Precio relámpago! ⚡",
    "cuerpo": "Hola {{1}}. Hasta el {{2}} tenemos {{3}}% de descuento en {{4}}. Es solo por estos días — ¿aprovechamos?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Fecha de cierre",
      "3": "Descuento",
      "4": "Producto"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "¡Aprovecho!"
      },
      {
        "tipo": "respuesta",
        "label": "No, gracias"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Descuento relámpago",
      "subtitulo": "Solo hasta el {{2}}",
      "cuerpo": "{{3}}% off en {{4}} por tiempo limitado. Los precios vuelven el lunes.",
      "beneficio": "{{3}}% solo por días",
      "cta": "Aprovechar"
    }
  },
  {
    "code": "promo-referidos",
    "segmento": "promos",
    "nombre": "Promoción por referidos",
    "categoriaMeta": "Marketing",
    "cuando": "El cliente puede recomendar: se premia con beneficio por cada referido que asegure.",
    "encabezado": "Recomendá y ganá 🎁",
    "cuerpo": "Hola {{1}}. Si nos recomendás a un amigo o familiar y asegura con nosotros, vos recibís {{2}}. ¿A quién tenemos que cuidar?",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Beneficio/recompensa"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Te paso el contacto"
      },
      {
        "tipo": "respuesta",
        "label": "Cómo funciona"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Recomendá y ganá",
      "subtitulo": "Un premio por cada referido",
      "cuerpo": "Presentanos a alguien que quiera asegurarse y llevás {{2}} cuando concreta.",
      "beneficio": "Beneficio por referir",
      "cta": "Recomendar"
    }
  },
  {
    "code": "promo-voucher-recompensa",
    "segmento": "promos",
    "nombre": "Voucher de recompensa por referidos",
    "categoriaMeta": "Marketing",
    "cuando": "El referido concretó: se entrega el voucher digital con el código para canjear el beneficio.",
    "encabezado": "¡Ganaste tu recompensa! 🎟️",
    "cuerpo": "Hola {{1}}. Tu referido {{2}} ya está asegurado. Este es tu voucher: código {{3}}, válido hasta el {{4}}. Mostralo para canjearlo.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Referido",
      "3": "Código del voucher",
      "4": "Vencimiento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Ver voucher"
      },
      {
        "tipo": "respuesta",
        "label": "Gracias"
      }
    ],
    "auto": true,
    "reglaAuto": "Al concretarse el referido",
    "publicacion": {
      "titulo": "Tu recompensa está lista",
      "subtitulo": "Código: {{3}}",
      "cuerpo": "Gracias por recomendarnos: acá está tu voucher para canjear. Válido hasta el {{4}}.",
      "beneficio": "Recompensa lista",
      "cta": "Ver voucher"
    }
  },
  {
    "code": "promo-voucher-alianza",
    "segmento": "promos",
    "nombre": "Voucher de alianza comercial",
    "categoriaMeta": "Marketing",
    "cuando": "Acuerdos con comercios o talleres: se comparten vouchers cruzados entre clientes.",
    "encabezado": "Beneficio exclusivo para clientes 🤝",
    "cuerpo": "Hola {{1}}. Como cliente tenés {{2}} en {{3}} presentando este voucher: código {{4}}. Válido hasta el {{5}}.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Beneficio",
      "3": "Comercio aliado",
      "4": "Código",
      "5": "Vencimiento"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Ver voucher"
      },
      {
        "tipo": "respuesta",
        "label": "Cómo se usa"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Descuento en {{3}}",
      "subtitulo": "Exclusivo clientes",
      "cuerpo": "Presentá este voucher con código {{4}} y aprovechá {{2}} en el comercio aliado.",
      "beneficio": "Beneficio exclusivo",
      "cta": "Ver voucher"
    }
  },
  {
    "code": "promo-voucher-reactivacion",
    "segmento": "promos",
    "nombre": "Voucher de bonificación por reactivación",
    "categoriaMeta": "Marketing",
    "cuando": "Cliente que vuelve: se entrega un voucher con bonificación adicional por reactivar.",
    "encabezado": "Bienvenido de vuelta 🎟️",
    "cuerpo": "Hola {{1}}. ¡Qué bueno tenerte de vuelta! Como bonificación por reactivar tu póliza {{2}}, te dejamos {{3}} en tu próximo pago. Código: {{4}}.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Póliza",
      "3": "Beneficio",
      "4": "Código"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Ver voucher"
      },
      {
        "tipo": "respuesta",
        "label": "Gracias"
      }
    ],
    "auto": true,
    "reglaAuto": "Al reactivar la póliza",
    "publicacion": {
      "titulo": "De vuelta con beneficio",
      "subtitulo": "Voucher {{4}}",
      "cuerpo": "Reactivaste tu póliza y te llevás {{3}} para el próximo pago. Gracias por volver.",
      "beneficio": "Bonificación aplicada",
      "cta": "Ver voucher"
    }
  },
  {
    "code": "calidad-nps",
    "segmento": "calidad",
    "nombre": "Encuesta rápida NPS",
    "categoriaMeta": "Utilidad",
    "cuando": "Al cerrarse una gestión: se mide la satisfacción del cliente en escala 1 a 5.",
    "encabezado": "¿Cómo estuvo la atención? ⭐",
    "cuerpo": "Hola {{1}}. Tu gestión {{2}} quedó resuelta. ¿Cómo calificás la atención? (1 muy mala → 5 excelente)",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Gestión"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "⭐ 5"
      },
      {
        "tipo": "respuesta",
        "label": "4"
      },
      {
        "tipo": "respuesta",
        "label": "3"
      },
      {
        "tipo": "respuesta",
        "label": "1-2"
      }
    ],
    "auto": true,
    "reglaAuto": "Al cerrarse una gestión",
    "publicacion": {
      "titulo": "¿Cómo te atendimos?",
      "subtitulo": "Tu opinión nos mejora",
      "cuerpo": "Contanos en 10 segundos cómo fue tu experiencia. ¿Nos ayudás a mejorar?",
      "beneficio": "Mejora continua",
      "cta": "Calificar"
    }
  },
  {
    "code": "calidad-encuesta-salida",
    "segmento": "calidad",
    "nombre": "Encuesta de salida",
    "categoriaMeta": "Utilidad",
    "cuando": "El cliente se dio de baja: se consulta el motivo para aprender y mejorar.",
    "encabezado": "Queremos aprender de tu decisión 💬",
    "cuerpo": "Hola {{1}}. Lamentamos que te vayas. ¿Nos contás por qué diste de baja tu {{2}}? Tu opinión nos ayuda a mejorar.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Cobertura"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Precio"
      },
      {
        "tipo": "respuesta",
        "label": "Mala experiencia"
      },
      {
        "tipo": "respuesta",
        "label": "Otro motivo"
      }
    ],
    "auto": true,
    "reglaAuto": "Al procesarse una baja",
    "publicacion": {
      "titulo": "¿Por qué nos dejaste?",
      "subtitulo": "Tu opinión nos importa",
      "cuerpo": "Queremos entender qué pasó para poder mejorar. Contanos en una respuesta.",
      "beneficio": "Nos ayuda a mejorar",
      "cta": "Contar motivo"
    }
  },
  {
    "code": "calidad-encuesta-satisfaccion",
    "segmento": "calidad",
    "nombre": "Encuesta de satisfacción",
    "categoriaMeta": "Utilidad",
    "cuando": "Encuesta corta para clientes activos: mide la experiencia general y detecta riesgo de baja.",
    "encabezado": "Tu opinión vale 🌟",
    "cuerpo": "Hola {{1}}. ¿Qué tan conforme estás con Rafael Allende Seguros? Respondé 1 a 5 y si querés dejá un comentario.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "⭐ 5"
      },
      {
        "tipo": "respuesta",
        "label": "4"
      },
      {
        "tipo": "respuesta",
        "label": "3"
      },
      {
        "tipo": "respuesta",
        "label": "1-2"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "¿Estás conforme con tu seguro?",
      "subtitulo": "Encuesta de 10 segundos",
      "cuerpo": "Nos ayuda a detectar cómo podés estar mejor cubierto. Contanos, es anónimo.",
      "beneficio": "Beneficio para vos",
      "cta": "Responder"
    }
  },
  {
    "code": "emergencia-auxilio",
    "segmento": "emergencias",
    "nombre": "Asistencia en ruta / grúa",
    "categoriaMeta": "Utilidad",
    "cuando": "El cliente avisa que está varado o tiene un incidente en la calle: se activa la asistencia de inmediato.",
    "encabezado": "🚨 Asistencia en camino",
    "cuerpo": "Hola {{1}}. Ya activamos tu asistencia para el vehículo {{2}} en {{3}}. La grúa sale hacia tu ubicación: llega en aproximadamente {{4}} minutos.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Vehículo/patente",
      "3": "Ubicación",
      "4": "Tiempo estimado"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Estoy en un lugar seguro"
      },
      {
        "tipo": "respuesta",
        "label": "Ayuda urgente"
      }
    ],
    "auto": true,
    "reglaAuto": "Al pedirse asistencia en ruta",
    "publicacion": {
      "titulo": "Asistencia desbloqueada",
      "subtitulo": "Ayuda cuando la necesités",
      "cuerpo": "Con tu póliza tenés grúa y auxilio incluidos, las 24 horas. Guardá este canal.",
      "beneficio": "Auxilio 24/7",
      "cta": "Pedir asistencia"
    }
  },
  {
    "code": "emergencia-prevencion-clima",
    "segmento": "emergencias",
    "nombre": "Prevención por alertas climáticas",
    "categoriaMeta": "Utilidad",
    "cuando": "Frente a alertas de tormenta o granizo en la zona del cliente: consejos para proteger el vehículo o el hogar.",
    "encabezado": "⚠️ Alerta meteorológica",
    "cuerpo": "Hola {{1}}. Hay alerta de {{2}} para {{3}}. Te recomendamos resguardar tu auto y casa. Ante cualquier daño, escribinos por acá y te guiamos con el reclamo.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Fenómeno",
      "3": "Zona"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Enterado"
      },
      {
        "tipo": "respuesta",
        "label": "Tuve un daño"
      }
    ],
    "auto": true,
    "reglaAuto": "Al emitirse alerta por zona",
    "publicacion": {
      "titulo": "Cuidá tu auto de la tormenta",
      "subtitulo": "Alerta para tu zona",
      "cuerpo": "Consejos simples para evitar daños por {{2}} — y si ya pasó, te ayudamos con el reclamo.",
      "beneficio": "Prevención y respaldo",
      "cta": "Ver consejos"
    }
  },
  {
    "code": "terceros-reclamo",
    "segmento": "terceros",
    "nombre": "Terceros: reclamo de siniestro",
    "categoriaMeta": "Utilidad",
    "cuando": "Una persona externa reclama por un siniestro con un asegurado nuestro: se ordena la información de inmediato.",
    "encabezado": "Reclamo registrado 📁",
    "cuerpo": "Hola {{1}}. Registramos tu reclamo por el hecho del {{2}} con nuestro asegurado {{3}}. El área de terceros te contactará con los próximos pasos.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre del tercero",
      "2": "Fecha del hecho",
      "3": "Asegurado"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Entendido"
      },
      {
        "tipo": "respuesta",
        "label": "Consulta"
      }
    ],
    "auto": false,
    "reglaAuto": null,
    "publicacion": {
      "titulo": "Reclamo de terceros ordenado",
      "subtitulo": "Gestión en marcha",
      "cuerpo": "Centralizamos los reclamos de terceros por este canal para acelerar cada paso.",
      "beneficio": "Proceso claro",
      "cta": "Iniciar reclamo"
    }
  },
  {
    "code": "atencion-handoff",
    "segmento": "atencion",
    "nombre": "Transición a asesor humano",
    "categoriaMeta": "Utilidad",
    "cuando": "La IA detecta que el caso necesita una persona: se avisa al cliente y se pasa al asesor, sin dejarlo esperando.",
    "encabezado": "Te paso con una persona 🔄",
    "cuerpo": "Hola {{1}}. Para darte la mejor respuesta, te derivo con {{2}}, que te escribe en pocos minutos por acá mismo.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre",
      "2": "Asesor"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "Espero"
      },
      {
        "tipo": "respuesta",
        "label": "Mejor más tarde"
      }
    ],
    "auto": true,
    "reglaAuto": "Cuando el caso requiere intervención humana",
    "publicacion": {
      "titulo": "Siempre hay una persona detrás",
      "subtitulo": "Atención humana cuando hace falta",
      "cuerpo": "La IA resuelve lo simple y te deriva con un asesor cuando el caso lo necesita.",
      "beneficio": "Atención de verdad",
      "cta": "Hablar con alguien"
    }
  },
  {
    "code": "fidelizacion-cumpleanos",
    "segmento": "fidelizacion",
    "nombre": "Saludo de cumpleaños",
    "categoriaMeta": "Utilidad",
    "cuando": "El día del cumpleaños del cliente, usando la fecha de su ficha.",
    "encabezado": "¡Feliz cumpleaños! 🎂",
    "cuerpo": "¡Hola {{1}}! Todo el equipo de Rafael Allende Seguros te desea un muy feliz cumpleaños.",
    "pie": "Rafael Allende Seguros",
    "variables": {
      "1": "Nombre"
    },
    "botones": [
      {
        "tipo": "respuesta",
        "label": "¡Gracias!"
      }
    ],
    "auto": true,
    "reglaAuto": "El día del cumpleaños (fecha de ficha)",
    "publicacion": {
      "titulo": "¡Feliz cumpleaños!",
      "subtitulo": "Te lo desea todo el equipo",
      "cuerpo": "Que tengas un gran día de parte de Rafael Allende Seguros.",
      "beneficio": "Un detalle",
      "cta": "Responder"
    }
  }
];
