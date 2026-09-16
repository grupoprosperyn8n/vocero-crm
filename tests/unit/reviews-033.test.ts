import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_BODY_MAX,
  sanitizeReviewShare,
} from "@/server/internal/chat";
import {
  REVIEW_ENVIO_ALERT_TYPE,
  isReviewEstado,
  reviewEstadoLabel,
  reviewEstadoTone,
} from "@/lib/reviews";
import { reviewsKeyOk } from "@/server/reviews/service";
import { getReviewAnalisis, getReviewAudio } from "@/server/reviews/assets";

/**
 * 033 — Revisión de envío SGSA hacia el chat interno (dual con Telegram).
 *
 * Fija el contrato de la tarjeta: el snapshot que viaja desde n8n se sanea
 * igual que los otros adjuntos del chat (topes, forma del record id) pero el
 * mensaje al cliente —el demo EXACTO que sale a Telegram— conserva saltos de
 * línea y emojis. Además: autenticación server-to-server y la lectura de los
 * adjuntos (análisis IA y audio) desde Airtable.
 *
 * El texto de referencia es el mensaje real que el bot manda al grupo
 * (rec2QT4xAmAPJoRXP, 10/4/26), recortado para el test.
 */

const MENSAJE_REAL = [
  "Hola TEST IA 👋",
  "Queremos compartirte la resolución de tu denuncia de siniestro automotor de forma clara y ordenada.",
  "",
  "📌 Resumen principal",
  "• Culpabilidad determinada: No culpable",
  "• Porcentaje estimado: Parte A (ASEGURADO): 13% | Parte B (TERCERO): 87%",
  "",
  "🎧 Al final te dejamos el audio explicativo.",
  "",
  "Saludos, Rafael Allende & Asociados Seguros.",
].join("\n");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sanitizeReviewShare — el snapshot de la tarjeta de revisión", () => {
  it("acepta el mensaje real y conserva saltos de línea y emojis", () => {
    const snap = sanitizeReviewShare({
      recordId: "recE2E033Test0001",
      cliente: "TEST IA",
      canales: "WhatsApp + Email",
      asuntoEmail: "Resolución de su Siniestro - Vehículo",
      emailTo: "grupoprospery@gmail.com",
      whatsappTo: "+5493413394300",
      reintento: true,
      mensaje: MENSAJE_REAL,
    });
    expect(snap).not.toBeNull();
    expect(snap!.mensaje).toBe(MENSAJE_REAL);
    expect(snap!.mensaje).toContain("13% | Parte B (TERCERO): 87%");
    expect(snap!.mensaje.includes("\n")).toBe(true);
    expect(snap!.mensaje).toContain("👋");
    expect(snap!.recordId).toBe("recE2E033Test0001");
    expect(snap!.cliente).toBe("TEST IA");
    expect(snap!.titulo).toBe("SGSA | Pendiente de aprobación");
    expect(snap!.reintento).toBe(true);
    // Siempre arranca pendiente y sin decisión: la decisión la escribe el CRM.
    expect(snap!.estado).toBe("pendiente");
    expect(snap!.decididoPor).toBeNull();
    expect(snap!.decididoEl).toBeNull();
    expect(snap!.via).toBeNull();
    expect(snap!.detalle).toBeNull();
  });

  it("rechaza lo que no tiene forma de revisión (sin mensaje, record inválido)", () => {
    expect(sanitizeReviewShare(null)).toBeNull();
    expect(sanitizeReviewShare("texto")).toBeNull();
    expect(
      sanitizeReviewShare({ recordId: "recE2E033Test0001", mensaje: "" })
    ).toBeNull();
    expect(
      sanitizeReviewShare({ recordId: "no-es-record", mensaje: "Hola" })
    ).toBeNull();
    // El record id tiene que ser `rec` + EXACTAMENTE 14 alfanuméricos.
    expect(
      sanitizeReviewShare({ recordId: "recCorto", mensaje: "Hola" })
    ).toBeNull();
  });

  it("topa el mensaje largo y los campos cortos, y normaliza el estado inválido", () => {
    const largo = "x".repeat(CHAT_BODY_MAX + 500);
    const snap = sanitizeReviewShare({
      recordId: "recE2E033Test0001",
      mensaje: largo,
      estado: "estado-que-no-existe",
      whatsappTo: "+" + "9".repeat(80),
    });
    expect(snap!.mensaje).toHaveLength(CHAT_BODY_MAX);
    expect(snap!.estado).toBe("pendiente");
    expect(snap!.whatsappTo!.length).toBeLessThanOrEqual(40);

    const enviado = sanitizeReviewShare({
      recordId: "recE2E033Test0001",
      mensaje: "Hola",
      estado: "enviado",
      detalle:
        "Se enviaron resumen, dictamen IA, audio por WhatsApp y el email completo al cliente.",
    });
    expect(enviado!.estado).toBe("enviado");
    expect(enviado!.detalle).toContain("dictamen IA");
  });

  it("no colapsa los espacios internos del mensaje al cliente", () => {
    const conFormato = "Parte A (ASEGURADO): 13%   |   Parte B (TERCERO): 87%";
    const snap = sanitizeReviewShare({
      recordId: "recE2E033Test0001",
      mensaje: conFormato,
    });
    expect(snap!.mensaje).toBe(conFormato);
  });
});

describe("estados de la revisión", () => {
  it("valida, etiqueta y colorea los cinco estados", () => {
    expect(isReviewEstado("pendiente")).toBe(true);
    expect(isReviewEstado("enviado")).toBe(true);
    expect(isReviewEstado("cualquiera")).toBe(false);
    expect(reviewEstadoLabel("enviado")).toBe("Envío despachado");
    expect(reviewEstadoLabel("trabado")).toBe("Envío trabado");
    expect(reviewEstadoLabel("pendiente")).toBe("Pendiente de aprobación");
    expect(reviewEstadoTone("enviado")).toBe("success");
    expect(reviewEstadoTone("trabado")).toBe("danger");
    expect(reviewEstadoTone("aprobado")).toBe("info");
    expect(reviewEstadoTone(undefined)).toBe("warning");
    expect(REVIEW_ENVIO_ALERT_TYPE).toBe("REVISION_ENVIO_SINIESTRO");
  });
});

describe("reviewsKeyOk — auth server-to-server", () => {
  beforeEach(() => {
    vi.stubEnv("REVIEWS_INBOUND_KEY", "clave-secreta-033");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("acepta el Bearer correcto y rechaza todo lo demás", () => {
    expect(reviewsKeyOk("Bearer clave-secreta-033")).toBe(true);
    expect(reviewsKeyOk("Bearer clave-secreta-034")).toBe(false);
    expect(reviewsKeyOk("Bearer clave-secreta-03")).toBe(false);
    expect(reviewsKeyOk("clave-secreta-033")).toBe(false);
    expect(reviewsKeyOk(null)).toBe(false);
    expect(reviewsKeyOk("")).toBe(false);
  });
});

describe("assets — audio y análisis IA desde Airtable (igual que Telegram)", () => {
  beforeEach(() => {
    vi.stubEnv("SGSA_AIRTABLE_PAT", "pat-test");
    vi.stubEnv("SGSA_BASE_ID", "appTestBase");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("getReviewAnalisis lee «CULPABILIDAD IA» (lookup object incluido)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ fields: { "CULPABILIDAD IA": { value: "Análisis completo…" } } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const text = await getReviewAnalisis("recE2E033Test0001");
    expect(text).toBe("Análisis completo…");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "DENUNCIA%20DE%20ACCIDENTE/recE2E033Test0001"
    );
  });

  it("getReviewAudio: EXTRACTOR_CODIGO_AUDIO → BIBLIOTECA_AUDIOS → ARCHIVO_AUDIO", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ fields: { EXTRACTOR_CODIGO_AUDIO: "[AUD-01]" } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          records: [
            {
              fields: {
                CODIGO_ID: "AUD-01",
                ARCHIVO_AUDIO: [
                  {
                    url: "https://v5.airtableusercontent.com/audio.mp3",
                    filename: "Audio1Acoberturastodoriesgo.mp3",
                  },
                ],
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const audio = await getReviewAudio("recE2E033Test0001");
    expect(audio).toEqual({
      url: "https://v5.airtableusercontent.com/audio.mp3",
      filename: "Audio1Acoberturastodoriesgo.mp3",
    });
    const second = String(fetchMock.mock.calls[1]![0]);
    expect(second).toContain("BIBLIOTECA_AUDIOS");
    // URLSearchParams codifica los espacios como "+": se decodifica antes.
    expect(decodeURIComponent(second.replace(/\+/g, " "))).toContain(
      "{CODIGO_ID} = 'AUD-01'"
    );
  });

  it("sin código de audio o sin adjunto → null (la tarjeta no rompe)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ fields: {} }))
    );
    expect(await getReviewAudio("recE2E033Test0001")).toBeNull();
  });
});
