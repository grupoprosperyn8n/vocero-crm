import { describe, expect, it } from "vitest";
import { CHANNEL_LABEL, CHANNEL_ORDER, isChannel } from "@/lib/channels";
import { parseChannels } from "@/server/channels/enabled";
import { capabilitiesFor, textFits } from "@/server/channels/capabilities";
import { channelMark } from "@/components/channel-badge";

describe("CHANNELS: qué bandejas enciende la instancia (ADR-001)", () => {
  it("sin la variable, la instancia es de un solo canal", () => {
    expect([...parseChannels(undefined)]).toEqual(["whatsapp"]);
    expect([...parseChannels("")]).toEqual(["whatsapp"]);
  });

  it("enciende lo que se le pida, con espacios y mayúsculas de por medio", () => {
    const on = parseChannels("  Instagram , WHATSAPP ");
    expect(on.has("instagram")).toBe(true);
    expect(on.has("whatsapp")).toBe(true);
  });

  it("WhatsApp no se puede apagar: es el canal por el que existe el producto", () => {
    expect(parseChannels("instagram").has("whatsapp")).toBe(true);
  });

  it("telegram ES un canal del catálogo: se enciende como cualquier otro", () => {
    // 021: el catálogo lo reconoce (misma lista que usa la bandeja).
    expect(parseChannels("telegram").has("telegram")).toBe(true);
  });

  it("un canal que no existe se ignora, no tumba el arranque", () => {
    const on = parseChannels("signal,instagram,,");
    expect([...on].sort()).toEqual(["instagram", "whatsapp"]);
  });

  it("isChannel es la única lista: no hay uniones sueltas por ahí", () => {
    expect(isChannel("whatsapp")).toBe(true);
    expect(isChannel("instagram")).toBe(true);
    expect(isChannel("telegram")).toBe(true);
    expect(isChannel("signal")).toBe(false);
    expect(isChannel("")).toBe(false);
  });
});

describe("capacidades por canal", () => {
  it("el nombre visible sale de un solo lugar", () => {
    for (const ch of CHANNEL_ORDER) {
      expect(capabilitiesFor(ch).label).toBe(CHANNEL_LABEL[ch]);
    }
  });

  it("un canal desconocido cae en WhatsApp en vez de reventar", () => {
    const caps = capabilitiesFor("signal" as never);
    expect(caps.label).toBe(CHANNEL_LABEL.whatsapp);
  });

  it("el límite de Instagram es en BYTES: los acentos cuentan doble", () => {
    // 600 acentos = 1200 bytes. Contando caracteres esto pasaría, y Meta
    // rechazaría el envío con un 400 que el operador no sabría leer.
    expect(textFits("instagram", "é".repeat(600))).toBe(false);
    expect(textFits("instagram", "a".repeat(600))).toBe(true);
    expect(textFits("instagram", "a".repeat(1001))).toBe(false);
  });

  it("WhatsApp no tiene límite práctico de texto", () => {
    expect(textFits("whatsapp", "a".repeat(5000))).toBe(true);
  });

  it("Telegram: 4096 bytes por mensaje (Bot API) y sin ventana de servicio", () => {
    const caps = capabilitiesFor("telegram");
    expect(caps.windowMs).toBeNull();
    expect(caps.outsideWindow).toBe("none");
    // El límite es en bytes, como Instagram: 2048 acentos ya son 4096.
    expect(textFits("telegram", "a".repeat(4096))).toBe(true);
    expect(textFits("telegram", "a".repeat(4097))).toBe(false);
    expect(textFits("telegram", "é".repeat(2049))).toBe(false);
  });

  it("Telegram ya acepta adjuntos salientes (021: adaptador de envío)", () => {
    expect(capabilitiesFor("telegram").outboundMedia).toBe(true);
  });
});

describe("distintivo de bandeja", () => {
  it("todo canal del catálogo tiene su marca dibujada", () => {
    // Sin esto, agregar un canal y olvidar su glifo no rompe nada: el
    // distintivo devuelve null y la bandeja se ve como si no tuviera canal.
    for (const ch of CHANNEL_ORDER) {
      expect(channelMark(ch)).not.toBeNull();
    }
  });

  it("un canal desconocido no pinta nada en vez de tumbar la lista", () => {
    expect(channelMark("signal" as never)).toBeNull();
  });
});
