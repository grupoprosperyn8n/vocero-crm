"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";

/**
 * 044b-B11 — los creadores nuevos del Constructor: qué se construye
 * (publicación, formulario, encuesta o cupón/voucher) y los builders de cada
 * pieza. Todo con el mismo look del panel (tarjetas, chips, inputs chicos).
 */

export type WidgetTipo = "publicacion" | "formulario" | "encuesta" | "cupon";

export type BuilderCampo = {
  id: string;
  label: string;
  tipo: string;
  requerido: boolean;
  opciones: string[];
};

export type BuilderCupon = {
  beneficio: string;
  condiciones: string;
  desde: string;
  hasta: string;
  prefijo: string;
  emitir: number;
};

const inputCls =
  "h-9 w-full rounded-md border border-border-strong bg-background px-2.5 text-[12.5px] text-text";

const TIPOS_FORM: Array<{ id: string; label: string }> = [
  { id: "texto", label: "Texto corto" },
  { id: "parrafo", label: "Texto largo" },
  { id: "email", label: "Email" },
  { id: "telefono", label: "Teléfono" },
  { id: "numero", label: "Número" },
  { id: "seleccion", label: "Elegir una opción" },
];

const TIPOS_ENCUESTA: Array<{ id: string; label: string }> = [
  { id: "seleccion", label: "Opción múltiple" },
  { id: "si_no", label: "Sí / No" },
  { id: "escala", label: "Escala 1 a 5" },
  { id: "texto", label: "Respuesta corta" },
  { id: "parrafo", label: "Respuesta larga" },
];

export function nuevoIdCampo(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const OPCIONES_TIPO: Array<{ id: WidgetTipo; icono: string; label: string; hint: string }> = [
  { id: "publicacion", icono: "📣", label: "Publicación", hint: "La publicidad de siempre, con fotos y CTA" },
  { id: "formulario", icono: "📝", label: "Formulario", hint: "Pide datos en la página y recibí las respuestas acá" },
  { id: "encuesta", icono: "📊", label: "Encuesta", hint: "Preguntá y medí opiniones desde la página pública" },
  { id: "cupon", icono: "🎟️", label: "Cupón · Voucher", hint: "Un beneficio con códigos únicos para canjear" },
];

export function TipoSelector({
  value,
  onChange,
}: {
  value: WidgetTipo;
  onChange: (t: WidgetTipo) => void;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[10.5px] font-semibold tracking-wide text-text-3 uppercase">
        ¿Qué querés crear?
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {OPCIONES_TIPO.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            title={o.hint}
            aria-pressed={value === o.id}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
              value === o.id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border-strong bg-card text-text-2 hover:bg-accent"
            }`}
          >
            <span aria-hidden>{o.icono}</span>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-text-3">
        {OPCIONES_TIPO.find((o) => o.id === value)?.hint}
      </p>
    </div>
  );
}

export function CamposBuilder({
  tipo,
  campos,
  onChange,
}: {
  tipo: "formulario" | "encuesta";
  campos: BuilderCampo[];
  onChange: (campos: BuilderCampo[]) => void;
}) {
  const esForm = tipo === "formulario";
  const opcionesTipo = esForm ? TIPOS_FORM : TIPOS_ENCUESTA;
  const update = (i: number, patch: Partial<BuilderCampo>) =>
    onChange(campos.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const agregar = () =>
    onChange([
      ...campos,
      {
        id: nuevoIdCampo(),
        label: "",
        tipo: esForm ? "texto" : "seleccion",
        requerido: false,
        opciones: [],
      },
    ]);
  const quitar = (i: number) => onChange(campos.filter((_, j) => j !== i));
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= campos.length) return;
    const copia = [...campos];
    const c = copia.splice(i, 1)[0];
    if (!c) return;
    copia.splice(j, 0, c);
    onChange(copia);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border-strong bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-semibold">
            {esForm ? "📝 Campos del formulario" : "📊 Preguntas de la encuesta"}
          </p>
          <p className="text-[11px] text-text-3">
            {esForm
              ? "Lo que la persona completa en la página pública"
              : "Se responden desde la página pública; las respuestas llegan acá"}
          </p>
        </div>
        <button
          type="button"
          onClick={agregar}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border-strong bg-card px-2 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
        >
          <Plus size={11} /> {esForm ? "Agregar campo" : "Agregar pregunta"}
        </button>
      </div>

      {campos.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong px-3 py-2 text-[11.5px] text-text-3">
          {esForm
            ? "Todavía sin campos — agregá el primero (ej. «Nombre y apellido»)."
            : "Todavía sin preguntas — agregá la primera (ej. «¿Cómo nos calificás?»)."}
        </p>
      )}

      <ul className="space-y-1.5">
        {campos.map((c, i) => (
          <li key={c.id} className="rounded-md border bg-card px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-4 shrink-0 text-center text-[10.5px] font-bold text-text-3">
                {i + 1}
              </span>
              <input
                value={c.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder={
                  esForm
                    ? "Etiqueta del campo (ej. Nombre y apellido)"
                    : "Pregunta (ej. ¿Cómo nos calificás?)"
                }
                className="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-2 text-[12px] text-text"
              />
              <Select
                value={c.tipo}
                onChange={(v) => update(i, { tipo: v })}
                ariaLabel="Tipo de valor"
                className="h-7 shrink-0 rounded-md border border-border-strong bg-background px-1.5 text-[11.5px] text-text"
                options={opcionesTipo.map((t) => ({ value: t.id, label: t.label }))}
              />
              <label
                className="flex shrink-0 items-center gap-1 text-[10.5px] text-text-2"
                title="¿Es obligatorio responderlo?"
              >
                <input
                  type="checkbox"
                  checked={c.requerido}
                  onChange={(e) => update(i, { requerido: e.target.checked })}
                />
                Obligatorio
              </label>
              <button
                type="button"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                className="shrink-0 rounded p-1 text-text-3 transition-colors hover:bg-accent disabled:opacity-30"
                title="Subir"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === campos.length - 1}
                className="shrink-0 rounded p-1 text-text-3 transition-colors hover:bg-accent disabled:opacity-30"
                title="Bajar"
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => quitar(i)}
                className="shrink-0 rounded p-1 text-danger-text transition-colors hover:bg-accent"
                title="Quitar"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {c.tipo === "seleccion" && (
              <input
                value={c.opciones.join(", ")}
                onChange={(e) =>
                  update(i, {
                    opciones: e.target.value
                      .split(",")
                      .map((o) => o.trim())
                      .slice(0, 12),
                  })
                }
                placeholder="Opciones separadas por coma: Sí, No, Tal vez"
                className="mt-1.5 h-7 w-full rounded-md border border-border-strong bg-background px-2 text-[11.5px] text-text"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CuponBuilder({
  cupon,
  onChange,
}: {
  cupon: BuilderCupon;
  onChange: (c: BuilderCupon) => void;
}) {
  const set = (patch: Partial<BuilderCupon>) => onChange({ ...cupon, ...patch });
  const preview = `${cupon.prefijo.trim().toUpperCase() || "VCH"}-AB12-CD34`;
  return (
    <div className="space-y-2 rounded-lg border border-border-strong bg-background p-3">
      <div>
        <p className="text-[12.5px] font-semibold">🎟️ Cupón con códigos para canjear</p>
        <p className="text-[11px] text-text-3">
          Se genera un código único por voucher; el negocio marca «canjeado» desde Propuestas.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-text-2">Beneficio *</label>
        <input
          value={cupon.beneficio}
          onChange={(e) => set({ beneficio: e.target.value })}
          placeholder="Ej.: 20% de descuento en tu próxima póliza"
          className={inputCls}
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-text-2">Condiciones (opcional)</label>
        <input
          value={cupon.condiciones}
          onChange={(e) => set({ condiciones: e.target.value })}
          placeholder="Ej.: válido para clientes con póliza vigente"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-text-2">Válido desde</label>
          <input
            type="date"
            value={cupon.desde}
            onChange={(e) => set({ desde: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-text-2">Hasta</label>
          <input
            type="date"
            value={cupon.hasta}
            onChange={(e) => set({ hasta: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-text-2">Prefijo del código</label>
          <input
            value={cupon.prefijo}
            onChange={(e) =>
              set({
                prefijo: e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 8),
              })
            }
            placeholder="VCH"
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-text-2">Tokens a emitir ahora</label>
          <input
            type="number"
            min={0}
            max={200}
            value={cupon.emitir}
            onChange={(e) =>
              set({ emitir: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })
            }
            className={inputCls}
          />
        </div>
      </div>
      <p className="rounded-md border border-dashed border-border-strong bg-card px-2.5 py-1.5 text-[11px] text-text-3">
        Cada token es un código único{" "}
        <span className="font-mono font-semibold text-text">{preview}</span> con su link{" "}
        <span className="font-mono">/p/…?t=…</span> para repartir. Podés emitir más después desde
        Propuestas.
      </p>
    </div>
  );
}
