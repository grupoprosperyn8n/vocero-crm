import sharp from "sharp";

/**
 * Adaptación de imágenes del CRM (041).
 *
 * El dueño sube lo que tiene a mano — la foto del celular, un logo exportado
 * de Canva, un render de 4000 px — y acá se adapta al tamaño que el destino
 * necesita. Antes cada campo exigía el archivo ya recortado y por debajo de
 * 256 KB, que es justo lo que nadie tiene cuando maneja fotos reales.
 *
 * HEIC entra: sharp trae libheif y las fotos de iPhone (HEIC/HEIF) se leen
 * tal cual gracias a eso. AVIF, GIF y WebP también. La salida SIEMPRE es un
 * formato que el navegador muestra sin dudar (PNG para el icono, WebP para
 * las imágenes de propuestas).
 */

export type NormalizedImage = {
  data: Uint8Array;
  mime: "image/png" | "image/webp";
};

/**
 * Icono de la barra/pestaña: 512×512.
 *
 * Regla de encuadre: si la foto es aproximadamente cuadrada (0,75–1,34) se
 * recorta al centro para LLENAR el recuadro —como un avatar—; si es claramente
 * panorámica o vertical (un logo con la marca al costado, un banner) se AJUSTA
 * entera sobre fondo transparente, sin recortar nada. Un logo con texto no
 * puede perder letras por un recorte.
 */
export async function normalizeBrandIcon(
  bytes: Uint8Array
): Promise<NormalizedImage> {
  const img = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  // `metadata()` describe el archivo tal cual vino; si el EXIF dice que hay
  // que girar 90/270, el alto y el ancho de verdad están intercambiados.
  const girado = (meta.orientation ?? 1) >= 5;
  const w = (girado ? meta.height : meta.width) ?? 0;
  const h = (girado ? meta.width : meta.height) ?? 0;
  const proporcion = w > 0 && h > 0 ? w / h : 1;
  const fit = proporcion >= 0.75 && proporcion <= 1.34 ? "cover" : "contain";

  const normalizado = img.resize(512, 512, {
    fit,
    position: "centre",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  // PNG es lo ideal para un logo (nítido, sin pérdida). Pero una FOTO como
  // icono —512×512 de grano— en PNG pesa cientos de KB: si pasa de 400 KB se
  // guarda en WebP, que el navegador muestra igual y la deja liviana.
  const png = await normalizado.png({ compressionLevel: 9 }).toBuffer();
  if (png.byteLength <= 400_000) {
    return { data: new Uint8Array(png), mime: "image/png" };
  }
  const webp = await normalizado.webp({ quality: 90 }).toBuffer();
  if (webp.byteLength < png.byteLength) {
    return { data: new Uint8Array(webp), mime: "image/webp" };
  }
  return { data: new Uint8Array(png), mime: "image/png" };
}

/** Imagen de una propuesta: hasta 1920 px de lado, WebP calidad 85. */
export async function normalizeAdImage(
  bytes: Uint8Array
): Promise<NormalizedImage> {
  const data = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  return { data: new Uint8Array(data), mime: "image/webp" };
}

/** ¿sharp puede decodificar esto? Para no pasar SVG/ICO por el rasterizador. */
export function esRasterProcesable(mime: string): boolean {
  return /^image\/(png|jpe?g|webp|avif|heic|heif|tiff|gif)$/i.test(mime);
}
