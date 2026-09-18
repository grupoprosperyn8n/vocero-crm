"use client";

/**
 * 042 — Carrusel de la publicidad: fotos + video MP4/WebM.
 *
 * La pieza vive en el celular: swipe nativo (scroll-snap), puntitos, flechas
 * en pantallas grandes y avance automático suave entre fotos. El video entra
 * como una diapositiva más (con control propio) y frena el avance automático
 * para que nadie se pierda el resto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CarouselMedia = { id: string; mime: string };

export function MediaCarousel({
  media,
  altBase,
}: {
  media: CarouselMedia[];
  altBase: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const count = media.length;
  const videoIndex = media.findIndex((m) => m.mime.startsWith("video/"));
  const posterId = media.find((m) => m.mime.startsWith("image/"))?.id ?? null;

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(count - 1, i));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
      setIndex(clamped);
    },
    [count]
  );

  // Avance automático: solo entre fotos y hasta que alguien toque la pieza.
  useEffect(() => {
    if (!auto || count < 2) return;
    const t = setInterval(() => {
      setIndex((cur) => {
        const next = (cur + 1) % count;
        if (next === videoIndex) {
          setAuto(false);
          return cur;
        }
        const el = trackRef.current;
        if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [auto, count, videoIndex]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const stopAuto = () => setAuto(false);

  return (
    <div className="group relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={stopAuto}
        data-carousel
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((m, i) => (
          <figure key={m.id} className="relative w-full shrink-0 snap-center">
            {m.mime.startsWith("video/") ? (
              <video
                src={`/api/public/propuesta/img/${m.id}`}
                controls
                playsInline
                preload={i === 0 ? "metadata" : "none"}
                poster={posterId ? `/api/public/propuesta/img/${posterId}` : undefined}
                onPlay={stopAuto}
                className="max-h-[430px] w-full bg-neutral-900 object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/public/propuesta/img/${m.id}`}
                alt={`${altBase} ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="max-h-[430px] w-full object-cover"
              />
            )}
          </figure>
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Flechas (escritorio) */}
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => {
              stopAuto();
              goTo(index - 1);
            }}
            className={`absolute top-1/2 left-2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/60 text-neutral-800 shadow-lg backdrop-blur-md transition-opacity hover:bg-white/80 sm:flex ${index === 0 ? "pointer-events-none opacity-0" : "opacity-0 group-hover:opacity-100"}`}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => {
              stopAuto();
              goTo(index + 1);
            }}
            className={`absolute top-1/2 right-2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/60 text-neutral-800 shadow-lg backdrop-blur-md transition-opacity hover:bg-white/80 sm:flex ${index === count - 1 ? "pointer-events-none opacity-0" : "opacity-0 group-hover:opacity-100"}`}
          >
            <ChevronRight size={18} />
          </button>

          {/* Puntitos (celular) */}
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {media.map((m, i) => (
              <button
                key={m.id}
                type="button"
                aria-label={`Ir a la ${i + 1}`}
                data-dot={i === index ? "on" : "off"}
                onClick={() => {
                  stopAuto();
                  goTo(i);
                }}
                className={
                  i === index
                    ? "h-2 w-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-all"
                    : "h-2 w-2 rounded-full bg-white/70 shadow ring-1 ring-black/10 transition-all hover:bg-white"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
