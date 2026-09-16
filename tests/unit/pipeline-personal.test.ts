import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PIPELINE_BOARDS,
  SOURCE_KIND_LABEL,
  cardAcceptsAmount,
  cardTitle,
  isOwnCard,
  isTaskCard,
  seesWholeTeam,
  taskDueLabel,
  taskDueState,
} from "@/lib/pipeline";

/**
 * 029 — el pipeline de dos maneras (pedido Diego 2026-09-15).
 *
 * Cambios de comportamiento que estas pruebas fijan:
 *  · la sección tiene DOS tableros: ventas y gestiones;
 *  · el pipeline es PERSONAL por usuario (misma regla de alcance que la
 *    bandeja 026: el miembro solo ve lo suyo; owner/admin/manager ven todo);
 *  · la tarjeta se crea SOLO por server/pipeline/cards.ts — el autocargado
 *    (mensaje entrante o alta de contacto) ya no existe;
 *  · las alertas entran solo al tablero de gestiones.
 */

const SRC = path.resolve(import.meta.dirname, "..", "..", "src");

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...archivosTs(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("029 — pipeline personal de dos tableros", () => {
  it("los tableros son ventas, gestiones y tareas, en ese orden", () => {
    expect(PIPELINE_BOARDS.map((b) => b.value)).toEqual([
      "ventas",
      "gestiones",
      "tareas",
    ]);
  });

  it("alcance: propietario, administrador y gerente ven todo; el miembro queda en lo suyo", () => {
    expect(seesWholeTeam("owner")).toBe(true);
    expect(seesWholeTeam("admin")).toBe(true);
    expect(seesWholeTeam("manager")).toBe(true);
    expect(seesWholeTeam("member")).toBe(false);
  });

  it("solo el dueño puede editar su tarjeta (ni el gerente la toca)", () => {
    expect(isOwnCard({ ownerUserId: "u1" }, "u1")).toBe(true);
    expect(isOwnCard({ ownerUserId: "u1" }, "u2")).toBe(false);
    // Tarjetas viejas sin dueño (pre-029): no las edita nadie.
    expect(isOwnCard({ ownerUserId: null }, "u1")).toBe(false);
  });

  it("título: el contacto manda; si no hay, el rótulo del sistema/alerta", () => {
    expect(cardTitle({ contact: { name: "Caballero Roberto" }, label: "Otra" })).toBe(
      "Caballero Roberto"
    );
    expect(cardTitle({ contact: null, label: "Cliente del sistema" })).toBe(
      "Cliente del sistema"
    );
    expect(cardTitle({})).toBe("Tarjeta");
  });

  it("plata: solo el embudo de ventas la admite", () => {
    expect(cardAcceptsAmount("ventas")).toBe(true);
    expect(cardAcceptsAmount("gestiones")).toBe(false);
  });

  it("los orígenes tienen su etiqueta", () => {
    expect(SOURCE_KIND_LABEL.contact).toBe("Contacto del CRM");
    expect(SOURCE_KIND_LABEL.sgsa_client).toBe("Cliente del sistema");
    expect(SOURCE_KIND_LABEL.alert).toBe("Alerta");
  });
});

/**
 * 037 — las TAREAS (pedido Diego 2026-09-16): tablero propio, vencimiento con
 * hora y tilde de cierre. Las cuentas son puras: las pruebas las fijan.
 */
describe("037 — tareas: vencimiento y cierre", () => {
  const AHORA = new Date("2026-09-16T15:00:00-03:00");

  it("sin fecha no hay vencimiento que mirar", () => {
    expect(taskDueState(null, null, AHORA)).toBe("none");
  });

  it("terminada manda: aunque la fecha haya pasado, no está vencida", () => {
    expect(
      taskDueState("2026-09-10T10:00:00-03:00", "2026-09-11T10:00:00-03:00", AHORA)
    ).toBe("done");
  });

  it("vencida: la fecha pasó y sigue abierta", () => {
    expect(taskDueState("2026-09-15T10:00:00-03:00", null, AHORA)).toBe("overdue");
  });

  it("vence hoy / pronto / más lejos", () => {
    expect(taskDueState("2026-09-16T20:00:00-03:00", null, AHORA)).toBe("today");
    expect(taskDueState("2026-09-17T12:00:00-03:00", null, AHORA)).toBe("soon");
    expect(taskDueState("2026-09-25T12:00:00-03:00", null, AHORA)).toBe("normal");
  });

  it("la etiqueta va en hora argentina, siempre igual (14:30Z = 11:30)", () => {
    expect(taskDueLabel("2026-09-18T14:30:00.000Z")).toBe("18/09 11:30");
  });

  it("la tarea vive en su tablero y tiene etiqueta propia", () => {
    expect(isTaskCard({ board: "tareas" })).toBe(true);
    expect(isTaskCard({ board: "ventas" })).toBe(false);
    expect(SOURCE_KIND_LABEL.task).toBe("Tarea");
  });
});

describe("029 — guardarraíl: la tarjeta nace SOLO por la puerta de cards.ts", () => {
  const PERMITIDOS = [
    path.join("server", "pipeline", "cards.ts"),
    // El seed del sandbox también siembra tarjetas de demo; es el otro único
    // lugar donde puede aparecer un insert de lead.
    path.join("server", "seed", "demo.ts"),
  ];

  it("ningún archivo fuera de cards.ts (+ demo) inserta tarjetas (schema.lead)", () => {
    const infractores: string[] = [];
    for (const file of archivosTs(SRC)) {
      const rel = path.relative(SRC, file);
      if (PERMITIDOS.includes(rel)) continue;
      const code = readFileSync(file, "utf8");
      if (code.includes(".insert(schema.lead)")) infractores.push(rel);
    }
    expect(
      infractores,
      `Estos archivos crean tarjetas sin pasar por createPipelineCard(). ` +
        `Usa server/pipeline/cards.ts:\n` +
        infractores.map((f) => `  · ${f}`).join("\n")
    ).toEqual([]);
  });

  it("la bandeja ya no autocarga: la ingesta olvidó a lead-activity", () => {
    const ingest = readFileSync(
      path.join(SRC, "server", "inbox", "ingest.ts"),
      "utf8"
    );
    expect(ingest).not.toContain("lead-activity");
    expect(ingest).not.toContain("onLeadActivity");
  });

  it("el alta de contactos ya no crea tarjetas", () => {
    const contacts = readFileSync(
      path.join(SRC, "app", "api", "contacts", "route.ts"),
      "utf8"
    );
    expect(contacts).not.toContain("createLeadForContact");
    expect(contacts).not.toContain("recordLeadCreated");
  });
});
