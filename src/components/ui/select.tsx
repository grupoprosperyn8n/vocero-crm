"use client";

/**
 * 049 — Select propio (sin popup nativo del navegador).
 *
 * Por qué: el popup del <select> nativo de Chrome en Linux/Wayland se abre
 * cortado, en cualquier lugar o parpadeando (bug de Chromium #358041219 y
 * variantes). Acá el menú se dibuja dentro de la página (portal a body,
 * posición fija con flip si no entra en viewport), así se ve y se comporta
 * igual en cualquier navegador, tema y tamaño de pantalla.
 *
 * Uso: reemplaza 1:1 a un <select> controlado:
 *   <Select value={v} onChange={setV} options={[{ value, label }]} ariaLabel="…" className="…" />
 * Las `className` del select original se pasan tal cual: el componente agrega
 * el layout (inline-flex + truncate + chevron).
 */
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Nombre del grupo (equivalente a <optgroup>); se dibuja como subtítulo. */
  group?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  /** Se aplica al botón (el "cuerpo" del select original). */
  className?: string;
  /** Extra para el menú desplegable. */
  menuClassName?: string;
  disabled?: boolean;
  title?: string;
  id?: string;
  /** Texto de respaldo si el value actual no está en las opciones. */
  fallbackLabel?: string;
  /** Atributos extra que van tal cual al <button> (los E2E usan data-*). */
  buttonProps?: Record<string, string | undefined>;
};

type Rect = { left: number; top: number; bottom: number; width: number };

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  menuClassName,
  disabled,
  title,
  id,
  fallbackLabel,
  buttonProps,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const currentIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const display =
    (currentIndex >= 0 ? options[currentIndex]?.label : undefined) ?? fallbackLabel ?? value;

  useEffect(() => setMounted(true), []);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  }, []);

  // Reposicionar (y mantener pegado) mientras la página scrollea.
  useEffect(() => {
    if (!open) return;
    updateRect();
    const onMove = () => updateRect();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updateRect]);

  // Ajuste fino una vez medido el menú: que entre completo en viewport o se dé vuelta.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    const menu = menuRef.current;
    if (!menu) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(rect.left, vw - mw - 8);
    if (left < 8) left = 8;
    let top = rect.bottom + 6;
    if (top + mh > vh - 8) {
      const above = rect.top - mh - 6;
      top = above >= 8 ? above : Math.max(8, vh - mh - 8);
    }
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [open, rect]);

  // Cerrar: clic afuera / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstEnabled = options.findIndex((o) => !o.disabled);
  const moveActive = useCallback(
    (from: number, dir: 1 | -1) => {
      const n = options.length;
      if (n === 0) return from;
      let i = from;
      for (let step = 0; step < n; step++) {
        i = (i + dir + n) % n;
        const opt = options[i];
        if (opt && !opt.disabled) return i;
      }
      return from;
    },
    [options],
  );

  const pick = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const openMenu = useCallback(() => {
    if (disabled || options.length === 0) return;
    setActive(currentIndex >= 0 ? currentIndex : Math.max(0, firstEnabled));
    updateRect();
    setOpen(true);
  }, [disabled, options.length, currentIndex, firstEnabled, updateRect]);

  // Typeahead simple (letras saltan a la opción que empieza igual).
  const bufferRef = useRef("");
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeahead = useCallback(
    (key: string) => {
      bufferRef.current += key.toLowerCase();
      if (bufferTimer.current) clearTimeout(bufferTimer.current);
      bufferTimer.current = setTimeout(() => (bufferRef.current = ""), 600);
      const buf = bufferRef.current;
      const idx = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(buf));
      if (idx >= 0) setActive(idx);
    },
    [options],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => moveActive(i, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => moveActive(i, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(Math.max(0, firstEnabled));
    } else if (e.key === "End") {
      e.preventDefault();
      const last = [...options].reverse().findIndex((o) => !o.disabled);
      if (last >= 0) setActive(options.length - 1 - last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[active];
      if (o && !o.disabled) pick(o.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      typeahead(e.key);
    }
  };

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  return (
    <>
      <button
        ref={triggerRef}
        {...buttonProps}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && options.length > 0 ? `${listId}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex min-w-0 items-center justify-between gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="min-w-0 truncate">{display}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {mounted && open && rect && (
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              left: pos ? pos.left : rect.left,
              top: pos ? pos.top : rect.bottom + 6,
              minWidth: rect.width,
              maxWidth: Math.min(360, vw - 16),
              maxHeight: Math.min(320, vh - 24),
              zIndex: 90,
            }}
            className={cn(
              "overscroll-contain overflow-auto rounded-xl border border-border-strong bg-card p-1 shadow-pop",
              menuClassName,
            )}
          >
            {options.map((o, i) => (
              <div key={`${i}-${o.value}`}>
                {o.group && (i === 0 || options[i - 1]?.group !== o.group) && (
                  <div className="px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {o.group}
                  </div>
                )}
                <div
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !o.disabled && pick(o.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]",
                    i === active && "bg-accent",
                    o.disabled && "cursor-not-allowed opacity-40",
                    o.value === value && "font-semibold",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={2.4} />}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )
      )}
    </>
  );
}
