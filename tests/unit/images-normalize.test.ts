import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import sharp from "sharp";
import {
  esRasterProcesable,
  normalizeAdImage,
  normalizeBrandIcon,
} from "@/server/images/normalize";

/** Imagen de prueba: lisa, del tamaño que le pidamos. */
const png = async (w: number, h: number) =>
  new Uint8Array(
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 220, g: 40, b: 90, alpha: 255 },
      },
    })
      .png()
      .toBuffer()
  );

/** Caja del CONTENIDO visible (ignora el fondo transparente del letterbox). */
async function bbox(buf: Uint8Array) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3] ?? 0;
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}

describe("normalizeBrandIcon (logo / favicon → 512×512)", () => {
  it("una foto cuadrada llena el recuadro (cover) y sale en 512×512 PNG", async () => {
    const out = await normalizeBrandIcon(await png(1200, 1200));
    expect(out.mime).toBe("image/png");
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it("un logo panorámico se ajusta entero, sin recortar letras (contain)", async () => {
    const out = await normalizeBrandIcon(await png(1040, 280));
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    // el contenido (sin el fondo transparente) quedó más ancho que alto:
    // se ajustó entero, no se recortó a un cuadrado.
    const contenido = await bbox(out.data);
    expect(contenido.w / contenido.h).toBeGreaterThan(2);
  });

  it("una foto vertical de celular también entra (sin deformar)", async () => {
    const out = await normalizeBrandIcon(await png(600, 1600));
    const contenido = await bbox(out.data);
    expect(contenido.h / contenido.w).toBeGreaterThan(2);
  });
});

describe("normalizeBrandIcon — fotos pesadas", () => {
  it("una FOTO de 512² (grano) se guarda en WebP: en PNG pesaría cientos de KB", async () => {
    const ruido = crypto.randomBytes(700 * 700 * 3);
    const jpeg = await sharp(ruido, { raw: { width: 700, height: 700, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();
    const out = await normalizeBrandIcon(new Uint8Array(jpeg));
    expect(out.mime).toBe("image/webp");
    expect(out.data.byteLength).toBeLessThan(400_000);
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });
});

describe("normalizeAdImage (publicación → hasta 1920 px, WebP)", () => {
  it("baja la foto de 4000 px al máximo y la deja en WebP", async () => {
    const out = await normalizeAdImage(await png(4000, 3000));
    expect(out.mime).toBe("image/webp");
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1440);
  });

  it("una imagen chica no se agranda", async () => {
    const out = await normalizeAdImage(await png(640, 480));
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });
});

describe("esRasterProcesable", () => {
  it("acepta los formatos de foto reales, HEIC de iPhone incluido", () => {
    for (const m of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/avif",
      "image/heic",
      "image/heif",
      "image/gif",
      "image/tiff",
    ]) {
      expect(esRasterProcesable(m)).toBe(true);
    }
  });

  it("deja afuera lo que no pasa por el rasterizador (SVG e ICO)", () => {
    expect(esRasterProcesable("image/svg+xml")).toBe(false);
    expect(esRasterProcesable("image/x-icon")).toBe(false);
  });
});
