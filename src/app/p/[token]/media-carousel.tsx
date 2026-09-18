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
import { ChevronLeft, ChevronRight, Play, RotateCcw } from "lucide-react";

export type CarouselMedia = { id: string; mime: string };

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

/**
 * 042d — Reproductor MINIMALISTA: sin la barra nativa del navegador. El video
 * se funde con el diseño claro de la página (fondo suave, botón glass al
 * centro, barra finita con degradé) y se maneja con un toque.
 */
function MinimalVideo({
  src,
  poster,
  alt,
  raiseForDots,
  onFirstPlay,
}: {
  src: string;
  poster?: string;
  alt: string;
  raiseForDots: boolean;
  onFirstPlay: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, []);

  return (
    <div
      data-video-player
      className="relative max-h-[430px] w-full overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200"
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={alt}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          setStarted(true);
          onFirstPlay();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        className="max-h-[430px] w-full cursor-pointer object-contain"
      />

      {/* Velo y botón glass: aparece solo cuando está en pausa */}
      {!playing && (
        <button
          type="button"
          aria-label={ended ? "Reproducir de nuevo" : "Reproducir el video"}
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-white/15 via-transparent to-white/15"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/70 bg-white/70 shadow-[0_12px_32px_-10px_rgba(2,132,199,0.55)] backdrop-blur-md transition-transform hover:scale-105">
            {ended ? (
              <RotateCcw size={24} className="text-sky-700" />
            ) : (
              <Play size={26} fill="currentColor" className="ml-0.5 text-sky-700" />
            )}
          </span>
        </button>
      )}

      {/* Barra finita, fundida: progreso con el degradé de la página */}
      {started && (
        <div className={`absolute inset-x-3 flex items-center gap-2 ${raiseForDots ? "bottom-9" : "bottom-3"}`}>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/60 ring-1 ring-black/5 backdrop-blur">
            <div
              data-video-progress
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-[width] duration-200"
              style={{ width: `${duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : 0}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-neutral-600 tabular-nums">
            {fmtTime(current)} / {fmtTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}

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
              <MinimalVideo
                src={`/api/public/propuesta/img/${m.id}`}
                poster={posterId ? `/api/public/propuesta/img/${posterId}` : undefined}
                alt={`${altBase} — video`}
                raiseForDots={count > 1}
                onFirstPlay={stopAuto}
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
