/*
 * 044b-B15 — Análisis del sistema (motor ALGORITMO).
 *
 * Genera el informe de un módulo del tablero SOLO con reglas: lee los mismos
 * datos que se le pasan a la IA (el contexto del módulo) y arma resumen ·
 * qué mirar · qué hacer con umbrales simples y frases claras.
 *
 * - Corre en la pantalla, con los datos que el tablero ya tiene: instantáneo,
 *   sin llamar a la IA, sin costo y auditable.
 * - Puro (sin red ni base): los unit tests lo cubren directo.
 * - Cada acción dice si implica crear una pieza (publicación / formulario /
 *   encuesta / cupón) para que la UI ofrezca el botón al Constructor.
 */

import type {
  AlgoModuleInsight,
  ModuleAccion,
  ModuleAiId,
} from "./types";

/* --------------------------------------------------------------------- *
 * Helpers de lectura tolerante
 * --------------------------------------------------------------------- */

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOf(ctx: Record<string, unknown>, key: string): number {
  return num(ctx[key]);
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function topList(value: unknown, count: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, count)
    : [];
}

/** Número en formato es-AR (14.689). */
function fmt(value: number): string {
  return value.toLocaleString("es-AR");
}

/**
 * Porcentaje: los datos pueden venir como fracción (0,984) o como número ya
 * expresado en % (98,4). Si es ≤ 1,5 se asume fracción.
 */
function pct(value: number): string {
  const asPct = value > 0 && value <= 1.5 ? value * 100 : value;
  const rounded = Math.round(asPct * 10) / 10;
  return `${rounded.toLocaleString("es-AR")}%`;
}

function accion(texto: string, pieza: ModuleAccion["pieza"] = null): ModuleAccion {
  return { texto, pieza };
}

const SIN_DATOS: AlgoModuleInsight = {
  resumen: "Todavía no hay datos suficientes en este módulo para armar el análisis del sistema.",
  focos: [],
  acciones: [],
};

/* --------------------------------------------------------------------- *
 * Reglas por módulo
 * --------------------------------------------------------------------- */

function pulso(ctx: Record<string, unknown>): AlgoModuleInsight {
  const activas = numOf(ctx, "Pólizas activas");
  const prima = numOf(ctx, "Prima activa ARS");
  const activos = numOf(ctx, "Clientes con póliza activa");
  const venc7 = numOf(ctx, "Vencen ≤7 días");
  const venc30 = numOf(ctx, "Vencen ≤30 días");
  const altas = numOf(ctx, "Altas históricas");
  const anul = numOf(ctx, "Anulaciones históricas");
  const neto = numOf(ctx, "Crecimiento neto");
  const sin = numOf(ctx, "Siniestros históricos");
  const cot = numOf(ctx, "Cotizaciones");

  if (!activas && !altas && !anul && !neto) return SIN_DATOS;

  const resumen = [
    `Hoy hay ${fmt(activas)} pólizas activas de ${fmt(activos)} clientes, con una prima activa de $${fmt(prima)}.`,
    `Histórico: ${fmt(altas)} altas, ${fmt(anul)} anulaciones y ${fmt(sin)} siniestros.`,
    neto < 0
      ? `El crecimiento neto viene en rojo: ${fmt(neto)}.`
      : `El crecimiento neto es de ${fmt(neto)}.`,
    venc30 > 0 ? `Hay ${fmt(venc7)} pólizas que vencen en ≤7 días y ${fmt(venc30)} en ≤30.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (neto < 0) {
    focos.push(
      `El saldo del período es negativo (${fmt(neto)}): las anulaciones superan a las altas.`
    );
    acciones.push(accion("Revisar las anulaciones recientes y las causas por oficina y producto."));
  }
  if (venc7 > 0) {
    focos.push(`${fmt(venc7)} renovaciones vencen esta semana: es la prioridad comercial inmediata.`);
    acciones.push(
      accion(
        `Armar la publicación de recordatorio de renovación para las ${fmt(venc7)} pólizas que vencen esta semana.`,
        "publicacion"
      )
    );
  }
  if (venc30 > venc7) {
    focos.push(`${fmt(venc30 - venc7)} vencimientos más caen dentro de los próximos 30 días.`);
  }
  if (sin > 0) {
    focos.push(`Hay ${fmt(sin)} siniestros históricos: revisar tiempos de respuesta y reincidencias.`);
  }
  if (cot > 0) {
    focos.push(`${fmt(cot)} cotizaciones históricas: recuperar las que quedaron sin respuesta.`);
    acciones.push(
      accion(`Recontactar las cotizaciones viejas sin respuesta con una oferta clara.`, "publicacion")
    );
  }
  if (acciones.length < 3) {
    acciones.push(accion("Comparar altas y anulaciones de los últimos 6 meses para detectar la tendencia."));
  }

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function cartera(ctx: Record<string, unknown>): AlgoModuleInsight {
  const cargadas = numOf(ctx, "Pólizas cargadas");
  const activas = numOf(ctx, "Pólizas activas");
  const prima = numOf(ctx, "Prima activa ARS");
  const una = numOf(ctx, "Clientes con 1 póliza");
  const varias = numOf(ctx, "Clientes con 2 o más");
  const productos = topList(ctx["Productos con más pólizas activas"], 3);
  const companias = topList(ctx["Compañías (pólizas y prima activa)"], 2);

  if (!cargadas && !activas) return SIN_DATOS;

  const resumen =
    `La cartera tiene ${fmt(cargadas)} pólizas cargadas, ${fmt(activas)} activas, con $${fmt(prima)} de prima activa. ` +
    `Clientes: ${fmt(una)} con una sola póliza y ${fmt(varias)} con dos o más.` +
    (productos.length > 0 ? ` Producto líder: ${productos[0]}.` : "");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (cargadas > activas) {
    const dif = cargadas - activas;
    focos.push(`${fmt(dif)} pólizas cargadas no están activas: revisar si les falta algún dato (vencimiento, estado).`);
    acciones.push(accion(`Revisar las ${fmt(dif)} pólizas cargadas que no figuran activas y completar sus datos.`));
  }
  if (productos.length > 0) {
    focos.push(`Los productos con más pólizas activas: ${productos.join(" · ")}.`);
  }
  if (companias.length > 0) {
    focos.push(`Compañías que concentran la cartera: ${companias.join(" · ")}.`);
  }
  if (una > varias) {
    focos.push(`Hay más clientes con una sola póliza (${fmt(una)}) que con varias: la venta cruzada es la palanca natural.`);
    acciones.push(
      accion("Preparar una publicación de venta cruzada para los clientes de una sola póliza.", "publicacion")
    );
  }
  acciones.push(accion("Controlar la calidad de los datos de las pólizas activas (producto, compañía, vencimiento)."));

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function retencion(ctx: Record<string, unknown>): AlgoModuleInsight {
  const venc7 = numOf(ctx, "Vencen ≤7 días");
  const venc30 = numOf(ctx, "Vencen ≤30 días");
  const activas = numOf(ctx, "Pólizas activas");
  const watch = numOf(ctx, "Clientes a observar (activos con anulaciones históricas)");
  const sin = numOf(ctx, "Siniestros históricos");
  const anul = numOf(ctx, "Anulaciones históricas");

  if (!venc7 && !venc30 && !activas) return SIN_DATOS;

  const resumen =
    `Renovaciones a la vista: ${fmt(venc7)} pólizas vencen en ≤7 días y ${fmt(venc30)} en ≤30 días, sobre ${fmt(activas)} pólizas activas. ` +
    (watch > 0 ? `Hay ${fmt(watch)} clientes a observar por anulaciones históricas. ` : "") +
    (anul > 0 ? `Anulaciones históricas: ${fmt(anul)}. ` : "") +
    (sin > 0 ? `Siniestros históricos: ${fmt(sin)}.` : "");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (venc7 > 0) {
    focos.push(`${fmt(venc7)} renovaciones caen esta semana: contactarlas primero.`);
    acciones.push(
      accion(
        `Lanzar el recordatorio de renovación para las ${fmt(venc7)} pólizas que vencen en ≤7 días.`,
        "publicacion"
      )
    );
  }
  if (venc30 > venc7) {
    focos.push(`${fmt(venc30)} vencimientos en 30 días: anticiparse evita fugas.`);
    acciones.push(accion(`Preparar el contacto anticipado de las ${fmt(venc30)} renovaciones del mes.`));
  }
  if (watch > 0) {
    focos.push(`${fmt(watch)} clientes activos ya mostraron riesgo (anulaciones históricas).`);
    acciones.push(accion(`Revisar uno por uno los ${fmt(watch)} clientes a observar y definir a quién llamar.`));
  }
  if (sin > 0) {
    focos.push(`Los siniestros (${fmt(sin)}) son momentos clave de retención: medir cómo se atendieron.`);
    acciones.push(accion("Enviar la encuesta de satisfacción a los clientes con siniestros recientes.", "encuesta"));
  }
  acciones.push(accion("Dejar cargada la gestión de cada renovación contactada para medir la retención real."));

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function reactivacion(ctx: Record<string, unknown>): AlgoModuleInsight {
  const candidatos = numOf(ctx, "Candidatos (histórico sin póliza activa)");
  const universo = numOf(ctx, "Universo potencial (histórico sin póliza cargada)");
  const altas = numOf(ctx, "Altas históricas");
  const anul = numOf(ctx, "Anulaciones históricas");
  const sin = numOf(ctx, "Siniestros históricos");

  if (!candidatos && !universo && !altas) return SIN_DATOS;

  const resumen =
    `Hay ${fmt(candidatos)} candidatos a reactivar (histórico sin póliza activa) y un universo potencial de ${fmt(universo)}, ` +
    `sobre ${fmt(altas)} altas históricas (${fmt(anul)} anulaciones, ${fmt(sin)} siniestros).`;

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (candidatos > 0) {
    focos.push(`${fmt(candidatos)} clientes que ya confiaron y hoy no tienen póliza activa: el mayor volumen accionable.`);
    acciones.push(
      accion(
        `Armar la campaña de reactivación para los ${fmt(candidatos)} clientes sin póliza activa.`,
        "publicacion"
      )
    );
  }
  if (universo > candidatos) {
    focos.push(`${fmt(universo)} contactos históricos en total: sirven para ampliar la campaña si hace falta volumen.`);
  }
  if (anul > 0) {
    focos.push(`${fmt(anul)} anulaciones históricas: detectar el motivo más repetido antes de recontactar.`);
    acciones.push(accion("Agrupar los motivos de anulación para ajustar el mensaje de vuelta."));
  }
  acciones.push(accion(`Ofrecer un beneficio concreto de regreso (cupón o bonificación).`, "cupon"));
  acciones.push(accion("Asignar los casos por oficina y medir respuestas de la campaña en 2 semanas."));

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function cross(ctx: Record<string, unknown>): AlgoModuleInsight {
  const una = numOf(ctx, "Clientes con 1 sola póliza activa");
  const activas = numOf(ctx, "Pólizas activas");
  const oportunidades = topList(ctx["Oportunidades detectadas (clientes por combinación)"], 3);

  if (!una && !activas) return SIN_DATOS;

  const resumen =
    `Hay ${fmt(una)} clientes con una sola póliza activa, sobre ${fmt(activas)} pólizas activas en total. ` +
    (oportunidades.length > 0 ? `Oportunidades detectadas: ${oportunidades.join(" · ")}.` : "");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (una > 0) {
    focos.push(`${fmt(una)} clientes con una sola póliza: el universo natural de venta cruzada.`);
    acciones.push(
      accion(
        `Armar la publicación de producto complementario para los ${fmt(una)} clientes de una sola póliza.`,
        "publicacion"
      )
    );
  }
  if (oportunidades.length > 0) {
    focos.push(`Combinaciones con más clientes: ${oportunidades.join(" · ")}.`);
  }
  if (una > activas / 2 && activas > 0) {
    focos.push("Más de la mitad de la cartera tiene una sola póliza: cuidar que la oferta no sature.");
  }
  acciones.push(accion("Priorizar las combinaciones con más clientes antes de disparar la campaña."));
  acciones.push(accion("Definir una encuesta corta para medir qué producto les interesa antes de ofrecer.", "encuesta"));

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function migracion(ctx: Record<string, unknown>): AlgoModuleInsight {
  const clientes = numOf(ctx, "Clientes en el sistema");
  const gestiones = numOf(ctx, "Gestiones históricas");
  const cliVinc = numOf(ctx, "Clientes vinculados");
  const gesVinc = numOf(ctx, "Gestiones vinculadas");
  const tasaCli = numOf(ctx, "Tasa de vínculo de clientes %");
  const tasaGes = numOf(ctx, "Tasa de vínculo de gestiones %");
  const gesSueltas = numOf(ctx, "Gestiones sin vincular");
  const polizas = numOf(ctx, "Pólizas cargadas");
  const sinCliente = numOf(ctx, "Pólizas sin cliente");
  const sinProducto = numOf(ctx, "Pólizas sin producto");
  const sinCompania = numOf(ctx, "Pólizas sin compañía");
  const sinVencimiento = numOf(ctx, "Pólizas sin vencimiento");

  if (!clientes && !gestiones && !polizas) return SIN_DATOS;

  const cliFaltan = Math.max(0, clientes - cliVinc);
  const polizasFaltantes = sinCliente + sinProducto + sinCompania + sinVencimiento;

  const resumen =
    `Vinculados ${fmt(cliVinc)} de ${fmt(clientes)} clientes (${pct(tasaCli)}) y ${fmt(gesVinc)} de ${fmt(gestiones)} gestiones (${pct(tasaGes)}). ` +
    (gesSueltas > 0 || cliFaltan > 0
      ? `Pendientes: ${fmt(gesSueltas)} gestiones y ${fmt(cliFaltan)} clientes sin vincular. `
      : "No quedan pendientes de vínculo. ") +
    (polizas > 0
      ? `En pólizas cargadas (${fmt(polizas)}), faltan datos en ${fmt(polizasFaltantes)}: ${fmt(sinVencimiento)} sin vencimiento, ${fmt(sinProducto)} sin producto, ${fmt(sinCompania)} sin compañía y ${fmt(sinCliente)} sin cliente.`
      : "");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (gesSueltas > 0) {
    focos.push(`Las ${fmt(gesSueltas)} gestiones sin vincular son el mayor pendiente de volumen: dejan historial incompleto por cliente.`);
    acciones.push(
      accion(`Listar y depurar las ${fmt(gesSueltas)} gestiones sin vincular, priorizando las asociables a un cliente o póliza existente.`)
    );
  }
  if (sinVencimiento > 0) {
    focos.push(`Las ${fmt(sinVencimiento)} pólizas sin vencimiento complican renovaciones y alertas.`);
    acciones.push(accion(`Completar el vencimiento de las ${fmt(sinVencimiento)} pólizas que no lo tienen.`));
  }
  if (sinProducto + sinCompania + sinCliente > 0) {
    focos.push(`Faltan datos de producto/compañía/cliente en ${fmt(sinProducto + sinCompania + sinCliente)} pólizas: pocos, pero ensucian reportes.`);
    acciones.push(
      accion(`Completar los datos faltantes de las pólizas (${fmt(sinProducto)} sin producto, ${fmt(sinCompania)} sin compañía, ${fmt(sinCliente)} sin cliente).`)
    );
  }
  if (cliFaltan > 0) {
    focos.push(`${fmt(cliFaltan)} clientes sin vincular: riesgo de gestiones huérfanas.`);
    acciones.push(accion(`Cerrar los ${fmt(cliFaltan)} clientes sin vincular.`));
  }
  acciones.push(accion("Definir un control semanal de tasas de vínculo y campos obligatorios para que no se repita el backlog."));

  if (focos.length === 0) {
    focos.push("Sin pendientes detectados: la migración quedó completa según los datos cargados.");
  }

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

function crm(ctx: Record<string, unknown>): AlgoModuleInsight {
  const contactos = numOf(ctx, "Contactos");
  const conversaciones = numOf(ctx, "Conversaciones");
  const abiertas = numOf(ctx, "Conversaciones abiertas");
  const mensajes = numOf(ctx, "Mensajes");
  const ia = numOf(ctx, "Mensajes de la IA");
  const leads = numOf(ctx, "Leads");
  const convertidos = numOf(ctx, "Convertidos");
  const tasa = numOf(ctx, "Tasa de conversión %");
  const pipeline = numOf(ctx, "Monto de pipeline ARS");
  const vinculados = numOf(ctx, "Contactos vinculados a cartera");
  const tasaLin = numOf(ctx, "Tasa de vínculo %");

  if (!contactos && !conversaciones && !mensajes) return SIN_DATOS;

  const resumen =
    `El CRM tiene ${fmt(contactos)} contactos y ${fmt(conversaciones)} conversaciones (${fmt(abiertas)} abiertas), con ${fmt(mensajes)} mensajes (${fmt(ia)} de la IA). ` +
    `Leads: ${fmt(leads)}, convertidos ${fmt(convertidos)} (${pct(tasa)}). ` +
    (vinculados > 0 ? `${fmt(vinculados)} contactos vinculados a la cartera (${pct(tasaLin)}).` : "");

  const focos: string[] = [];
  const acciones: ModuleAccion[] = [];

  if (abiertas > 0) {
    focos.push(`${fmt(abiertas)} conversaciones siguen abiertas: son la prioridad de respuesta.`);
    acciones.push(accion(`Repasar las ${fmt(abiertas)} conversaciones abiertas y responder las vencidas.`));
  }
  if (leads > convertidos) {
    focos.push(`${fmt(leads - convertidos)} leads quedaron sin convertir (de ${fmt(leads)}).`);
    acciones.push(accion(`Revisar los ${fmt(leads - convertidos)} leads sin convertir y definir el próximo paso de cada uno.`));
  }
  if (pipeline > 0) {
    focos.push(`El pipeline en juego es de $${fmt(pipeline)}.`);
  }
  if (contactos > vinculados && vinculados > 0) {
    focos.push(`${fmt(contactos - vinculados)} contactos del CRM no están vinculados a la cartera.`);
    acciones.push(accion("Completar el vínculo de contactos con la cartera para medir bien las campañas."));
  }
  acciones.push(accion("Enviar una encuesta corta de satisfacción a los clientes atendidos este mes.", "encuesta"));

  return { resumen, focos: focos.slice(0, 4), acciones: acciones.slice(0, 5) };
}

/* --------------------------------------------------------------------- *
 * API
 * --------------------------------------------------------------------- */

const RULES: Record<ModuleAiId, (ctx: Record<string, unknown>) => AlgoModuleInsight> = {
  pulso,
  cartera,
  retencion,
  reactivacion,
  cross,
  migracion,
  crm,
};

/**
 * Informe del sistema (por reglas) para un módulo del tablero.
 * `context` es el mismo que se le pasa a la IA: { "Etiqueta": valor, … }.
 */
export function buildAlgoModuleInsight(
  module: ModuleAiId,
  context: Record<string, unknown> | null | undefined
): AlgoModuleInsight {
  const clean = context && typeof context === "object" ? context : {};

  if (Object.keys(clean).filter((k) => hasValue(clean[k])).length === 0) {
    return SIN_DATOS;
  }

  return RULES[module](clean);
}
