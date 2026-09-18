import { describe, expect, it } from "vitest";

import {
  ANGLE_IDS,
  ANGLES,
  COPY_MARKER,
  TONE_IDS,
  TONES,
  isAngleId,
  isToneId,
} from "@/lib/proposals/copy";
import {
  buildCopyPrompt,
  normalizeCopy,
  sanitizeCopyContext,
} from "@/server/proposals/copy-prompt";

describe("catálogo de tonos y conceptos (041c)", () => {
  it("cada tono tiene etiqueta, ayuda y regla para el modelo", () => {
    expect(TONE_IDS.length).toBeGreaterThanOrEqual(3);

    for (const id of TONE_IDS) {
      expect(TONES[id].label.trim().length).toBeGreaterThan(0);
      expect(TONES[id].hint.trim().length).toBeGreaterThan(0);
      expect(TONES[id].rule.trim().length).toBeGreaterThan(0);
    }

    // Los dos que pidió Diego explícitamente.
    expect(isToneId("cercana")).toBe(true);
    expect(isToneId("formal")).toBe(true);
    expect(isToneId("otro")).toBe(false);
  });

  it("cada concepto de venta tiene su regla", () => {
    for (const id of ANGLE_IDS) {
      expect(ANGLES[id].label.trim().length).toBeGreaterThan(0);
      expect(ANGLES[id].rule.trim().length).toBeGreaterThan(0);
    }

    expect(isAngleId("beneficio")).toBe(true);
    expect(isAngleId("nada")).toBe(false);
  });
});

describe("sanitizeCopyContext", () => {
  it("rechaza lo que no trae cliente o tipo", () => {
    expect(sanitizeCopyContext(null)).toBeNull();
    expect(sanitizeCopyContext({})).toBeNull();
    expect(sanitizeCopyContext({ clientName: "Ana" })).toBeNull();
    expect(sanitizeCopyContext({ kind: "renovacion" })).toBeNull();
  });

  it("aplica valores por defecto y acota campos largos", () => {
    const ctx = sanitizeCopyContext({
      clientName: "  Test IA  ",
      kind: "renovacion",
      tone: "inexistente",
      angle: "tambien-inexistente",
      instructions: "x".repeat(900),
      body: "b".repeat(5000),
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.clientName).toBe("Test IA");
    expect(ctx!.target).toBe("pieza");
    expect(ctx!.tone).toBe("cercana");
    expect(ctx!.angle).toBeNull();
    expect(ctx!.instructions.length).toBe(400);
    expect(ctx!.body.length).toBe(2000);
  });

  it("respeta target mensaje, tono formal y concepto válidos", () => {
    const ctx = sanitizeCopyContext({
      clientName: "Test IA",
      kind: "renovacion",
      target: "mensaje",
      tone: "formal",
      angle: "ahorro",
    });

    expect(ctx!.target).toBe("mensaje");
    expect(ctx!.tone).toBe("formal");
    expect(ctx!.angle).toBe("ahorro");
  });
});

describe("buildCopyPrompt", () => {
  const ctx = sanitizeCopyContext({
    clientName: "Test IA",
    kind: "renovacion",
    tone: "formal",
    angle: "ahorro",
    productName: "Auto",
    title: "Tu auto protegido",
  })!;

  it("lleva la marca del mock y las reglas del tono y del concepto", () => {
    const { system } = buildCopyPrompt(ctx);

    expect(system).toContain(COPY_MARKER);
    expect(system).toContain(TONES.formal.rule);
    expect(system).toContain(ANGLES.ahorro.rule);
    expect(system).toContain("rioplatense");
    expect(system).toContain("JAMÁS inventes");
  });

  it("manda los datos como JSON parseable en el mensaje de usuario", () => {
    const { user } = buildCopyPrompt(ctx);
    const [, jsonLine] = user.split("DATOS:");

    expect(jsonLine).toBeDefined();

    const payload = JSON.parse(jsonLine!.trim().split("\n")[0]!);

    expect(payload.clientName).toBe("Test IA");
    expect(payload.tone).toBe("formal");
    expect(payload.angle).toBe("ahorro");
    expect(payload.target).toBe("pieza");
  });

  it("para el mensaje pide solo el texto de WhatsApp", () => {
    const msgCtx = sanitizeCopyContext({
      clientName: "Test IA",
      kind: "renovacion",
      target: "mensaje",
      tone: "cercana",
    })!;
    const { system } = buildCopyPrompt(msgCtx);

    expect(system).toContain("MENSAJE de WhatsApp");
    expect(system).toContain("60 palabras");
    // Sin concepto elegido: regla neutra.
    expect(system).toContain("Sin concepto forzado");
  });
});

describe("normalizeCopy", () => {
  it("la pieza exige título y cuerpo; recorta lo demás", () => {
    expect(normalizeCopy(null, "pieza")).toBeNull();
    expect(normalizeCopy({ title: "Solo título" }, "pieza")).toBeNull();

    const copy = normalizeCopy(
      {
        title: "  Título  ",
        body: "Párrafo uno.\n\n\n\nPárrafo dos.",
        subtitle: "s".repeat(200),
        message: "no debería quedar",
        notes: "enfoque",
      },
      "pieza"
    );

    expect(copy).not.toBeNull();
    expect(copy!.title).toBe("Título");
    expect(copy!.body).toBe("Párrafo uno.\n\nPárrafo dos.");
    expect(copy!.subtitle!.length).toBe(140);
    expect(copy!.message).toBeUndefined();
    expect(copy!.notes).toBe("enfoque");
  });

  it("el mensaje exige texto y limpia los campos de pieza", () => {
    expect(normalizeCopy({ message: "   " }, "mensaje")).toBeNull();

    const copy = normalizeCopy(
      { title: "Título", body: "Cuerpo", message: "Hola Test IA 👋" },
      "mensaje"
    );

    expect(copy!.message).toBe("Hola Test IA 👋");
    expect(copy!.title).toBeUndefined();
    expect(copy!.body).toBeUndefined();
  });
});
