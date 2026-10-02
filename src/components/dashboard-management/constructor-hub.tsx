"use client";

/**
 * 044b-B13 — el HUB de creación y el BAÚL de plantillas.
 *
 * Al entrar a Crear se elige QUÉ construir: cada tipo tiene su propio
 * constructor (su paso 2, sus campos). El baúl guarda cualquier pieza armada
 * como plantilla (usar · editar · eliminar) y el catálogo de Plantillas de
 * Meta vive acá al lado (la sección potenciada del canal). Lo usan todos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { PieceTemplateDto } from "@/lib/types";
import { CATALOGO_SEGMENTOS } from "@/lib/templates-catalog";
import { TemplatesClient } from "@/components/settings/templates-client";
import type { BuilderCampo, WidgetTipo } from "./constructor-widgets";
import { Select } from "@/components/ui/select";

export const TIPOS_CREAR: Array<{
  id: WidgetTipo;
  emoji: string;
  titulo: string;
  desc: string;
}> = [
  {
    id: "publicacion",
    emoji: "📣",
    titulo: "Publicación",
    desc: "Una pieza con fotos, oferta y botón — para captar y fidelizar.",
  },
  {
    id: "formulario",
    emoji: "📝",
    titulo: "Formulario",
    desc: "Pedile datos al cliente o al prospecto con campos a medida.",
  },
  {
    id: "encuesta",
    emoji: "📊",
    titulo: "Encuesta",
    desc: "Preguntas para medir satisfacción y detectar oportunidades.",
  },
  {
    id: "cupon",
    emoji: "🎟️",
    titulo: "Cupón / Voucher",
    desc: "Un beneficio con código único para canjear, con PDF descargable.",
  },
];

export const TIPO_LABEL: Record<string, string> = {
  publicacion: "📣 Publicación",
  formulario: "📝 Formulario",
  encuesta: "📊 Encuesta",
  cupon: "🎟️ Cupón",
};

/** Los datos de una plantilla del baúl (lo que se aplica al Constructor). */
export type PiezaPlantillaData = {
  title?: string;
  subtitle?: string;
  body?: string;
  offer?: string;
  benefit?: string;
  ctaLabel?: string;
  ctaKind?: string;
  campos?: BuilderCampo[];
  cupon?: {
    beneficio?: string;
    condiciones?: string;
    desde?: string;
    hasta?: string;
    prefijo?: string;
  };
};

export function ConstructorHub({
  onElegirTipo,
  onUsarPlantilla,
  hayBorrador,
  tipoBorrador,
  onContinuar,
}: {
  onElegirTipo: (tipo: WidgetTipo) => void;
  onUsarPlantilla: (t: PieceTemplateDto) => void;
  hayBorrador: boolean;
  tipoBorrador: WidgetTipo;
  onContinuar: () => void;
}) {
  const [tab, setTab] = useState<"crear" | "baul" | "meta">("crear");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold">Crear</h3>
          <p className="text-[11.5px] text-text-3">
            Elegí qué construir: cada opción tiene su constructor con sus pasos, su
            vista demo en vivo y su PDF cuando corresponde.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: "crear", label: "✨ Crear" },
              { id: "baul", label: "🗄️ Plantillas (baúl)" },
              { id: "meta", label: "🗂️ Plantillas de Meta" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[11.5px] font-semibold transition-colors ${
                tab === t.id
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border-strong bg-card text-text-2 hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "crear" && (
        <div className="space-y-3">
          {hayBorrador && (
            <button
              type="button"
              onClick={onContinuar}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-brand-soft bg-brand-tint px-4 py-3 text-left transition-opacity hover:opacity-90"
            >
              <span>
                <span className="block text-[12.5px] font-bold text-brand-text">
                  ▶ Continuar con lo que estabas armando
                </span>
                <span className="text-[11px] text-brand-text/80">
                  Tenés una pieza de {TIPO_LABEL[tipoBorrador] ?? tipoBorrador} a medio
                  armar — seguí donde la dejaste.
                </span>
              </span>
              <ArrowLeft size={14} className="rotate-180 text-brand-text" />
            </button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {TIPOS_CREAR.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onElegirTipo(t.id)}
                className="group rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-soft hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-tint text-[20px]">
                  {t.emoji}
                </span>
                <span className="mt-2.5 block text-[13.5px] font-bold">{t.titulo}</span>
                <span className="mt-0.5 block text-[11.5px] text-text-2">{t.desc}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand">
                  Empezar <ArrowLeft size={11} className="rotate-180" />
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-3">
            💡 Tip: lo que armes se puede guardar como plantilla en el baúl con
            «🪄 Guardar como plantilla», y las piezas del catálogo de Meta ya vienen
            pre-cargadas ahí listas para usar.
          </p>
        </div>
      )}

      {tab === "baul" && <BaulPanel onUsar={onUsarPlantilla} onNueva={(tipo) => onElegirTipo(tipo)} />}
      {tab === "meta" && <TemplatesClient />}
    </div>
  );
}

/* ============================================================
 * El BAÚL — todas las plantillas de piezas, para todos los roles.
 * ============================================================ */

function BaulPanel({
  onUsar,
  onNueva,
}: {
  onUsar: (t: PieceTemplateDto) => void;
  onNueva: (tipo: WidgetTipo) => void;
}) {
  const [items, setItems] = useState<PieceTemplateDto[] | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todas" | WidgetTipo>("todas");
  const [editando, setEditando] = useState<PieceTemplateDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/piece-templates", { cache: "no-store" }).catch(
      () => null
    );
    if (!res?.ok) {
      setItems([]);
      return;
    }
    const data = (await res.json()) as { templates: PieceTemplateDto[] };
    setItems(data.templates);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter((t) => {
      if (filtro !== "todas" && t.kind !== filtro) return false;
      if (
        term &&
        !`${t.name} ${t.segment ?? ""} ${String((t.data as PiezaPlantillaData).title ?? "")}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [items, q, filtro]);

  async function eliminar(id: string) {
    const res = await fetch(`/api/piece-templates/${id}`, { method: "DELETE" }).catch(
      () => null
    );
    setConfirmDelete(null);
    if (res?.ok) void cargar();
    else setMsg("No se pudo eliminar la plantilla");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto max-w-xl text-[11.5px] text-text-2">
          El baúl de plantillas de piezas: lo que guardás desde el Constructor queda acá.
          Cualquiera del equipo puede <b>usar</b>, <b>editar</b> y <b>eliminar</b>.
        </p>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar plantilla…"
            className="h-8 w-56 rounded-md border border-border-strong bg-card pr-2.5 pl-7 text-[12px]"
          />
        </div>
        <button
          type="button"
          onClick={() => onNueva("publicacion")}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover"
        >
          <Plus size={12} /> Nueva desde cero
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            { id: "todas", label: "Todas" },
            { id: "publicacion", label: TIPO_LABEL.publicacion },
            { id: "formulario", label: TIPO_LABEL.formulario },
            { id: "encuesta", label: TIPO_LABEL.encuesta },
            { id: "cupon", label: TIPO_LABEL.cupon },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`h-7 rounded-full border px-2.5 text-[10.5px] font-semibold transition-colors ${
              filtro === f.id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border-strong bg-card text-text-2 hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="rounded-md border border-danger-soft bg-card px-3 py-1.5 text-[11.5px] text-danger-text">
          {msg}
        </p>
      )}

      {items === null ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-[12.5px] text-text-3">
          Cargando el baúl…
        </p>
      ) : filtradas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-[12.5px] text-text-3">
          {items.length === 0 ? (
            <>
              El baúl está vacío. Armá una pieza y guardala con{" "}
              <b>«🪄 Guardar como plantilla»</b>, o cargá el catálogo de 43 en{" "}
              <b>«🗂️ Plantillas de Meta»</b> — cada una trae su versión lista para el
              Constructor.
            </>
          ) : (
            "Ningún resultado con esos filtros."
          )}
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {filtradas.map((t) => {
            const d = t.data as PiezaPlantillaData;
            return (
              <div key={t.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold">
                    {TIPO_LABEL[t.kind] ?? t.kind}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                    {t.name}
                  </p>
                  {t.sourceCode && (
                    <span className="rounded-full border border-border-strong bg-background px-2 py-0.5 text-[10px] text-text-3">
                      📚 del catálogo
                    </span>
                  )}
                </div>
                {t.segment && (
                  <p className="mt-0.5 text-[10.5px] text-text-3">
                    {CATALOGO_SEGMENTOS[t.segment] ?? t.segment}
                  </p>
                )}
                {(d.title || d.body || d.cupon?.beneficio) && (
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-text-2">
                    {d.title || d.body || d.cupon?.beneficio}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUsar(t)}
                    className="inline-flex h-7 items-center rounded-md bg-brand px-2.5 text-[11px] font-semibold text-brand-fg hover:bg-brand-hover"
                  >
                    Usar en el Constructor
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(t)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11px] font-semibold text-text-2 hover:bg-accent"
                  >
                    <Pencil size={11} /> Renombrar
                  </button>
                  {confirmDelete === t.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[11px] text-danger-text">¿Eliminar?</span>
                      <button
                        type="button"
                        onClick={() => void eliminar(t.id)}
                        className="inline-flex h-7 items-center rounded-md bg-danger px-2.5 text-[11px] font-semibold text-white"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="inline-flex h-7 items-center rounded-md border border-border-strong bg-card px-2.5 text-[11px] font-semibold text-text-2"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(t.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11px] font-semibold text-danger-text hover:bg-accent"
                    >
                      <Trash2 size={11} /> Eliminar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <RenombrarModal
          t={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function RenombrarModal({
  t,
  onClose,
  onSaved,
}: {
  t: PieceTemplateDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(t.name);
  const [segment, setSegment] = useState(t.segment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/piece-templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, segment: segment || null }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    onSaved();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="text-[14px] font-bold">Renombrar «{t.name}»</h3>
      <p className="text-[11.5px] text-text-3">
        El contenido no cambia: para editarlo, usala en el Constructor y volvé a
        guardarla.
      </p>
      <div className="mt-3 space-y-2.5">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-text-2">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-text-2">Segmento</span>
          <Select
            value={segment}
            onChange={setSegment}
            ariaLabel="Segmento"
            className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]"
            options={[
              { value: "", label: "Sin segmento" },
              ...Object.entries(CATALOGO_SEGMENTOS).map(([id, label]) => ({ value: id, label })),
            ]}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-[11.5px] text-danger-text">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border-strong bg-card px-3 text-[11.5px] font-semibold text-text-2 hover:bg-accent"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={saving || !name.trim()}
          className="h-8 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </ModalOverlay>
  );
}

/* ============================================================
 * «Guardar como plantilla» — el modal que usa el Constructor.
 * ============================================================ */

export function GuardarPlantillaModal({
  tipo,
  data,
  onClose,
  onSaved,
}: {
  tipo: WidgetTipo;
  data: PiezaPlantillaData;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(
    data.title?.trim() ? data.title.trim().slice(0, 60) : ""
  );
  const [segment, setSegment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puedeActualizar, setPuedeActualizar] = useState(false);

  async function guardar({ actualizar = false } = {}) {
    setSaving(true);
    setError(null);
    setPuedeActualizar(false);
    const payload = { kind: tipo, name, segment: segment || null, data };
    let res: Response | null = null;
    if (actualizar) {
      const lista = await fetch("/api/piece-templates", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const existente = (lista?.templates as PieceTemplateDto[] | undefined)?.find(
        (t) => t.kind === tipo && t.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existente) {
        res = await fetch(`/api/piece-templates/${existente.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), segment: segment || null, data }),
        }).catch(() => null);
      }
    } else {
      res = await fetch("/api/piece-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      const esDup = body?.error?.code === "invalid" && /existe/i.test(body?.error?.message ?? "");
      setError(body?.error?.message ?? "No se pudo guardar la plantilla");
      setPuedeActualizar(esDup);
      return;
    }
    onSaved(
      actualizar
        ? "Plantilla actualizada en el baúl ✓"
        : "Guardada en el baúl de plantillas ✓"
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold">🪄 Guardar como plantilla</h3>
          <p className="text-[11.5px] text-text-3">
            Queda en el baúl ({TIPO_LABEL[tipo] ?? tipo}) para usarla cuando quieras —
            todos los roles pueden.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-text-3 hover:bg-accent">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-text-2">Nombre *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Promo otoño clientes"
            className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-text-2">Segmento</span>
          <Select
            value={segment}
            onChange={setSegment}
            ariaLabel="Segmento"
            className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]"
            options={[
              { value: "", label: "Sin segmento" },
              ...Object.entries(CATALOGO_SEGMENTOS).map(([id, label]) => ({ value: id, label })),
            ]}
          />
        </label>
      </div>
      {error && (
        <p className="mt-2 text-[11.5px] text-danger-text">
          {error}
          {puedeActualizar && " — podés actualizar la existente."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border-strong bg-card px-3 text-[11.5px] font-semibold text-text-2 hover:bg-accent"
        >
          Cancelar
        </button>
        {puedeActualizar && (
          <button
            type="button"
            onClick={() => void guardar({ actualizar: true })}
            disabled={saving}
            className="h-8 rounded-md border border-brand-soft bg-brand-tint px-3 text-[11.5px] font-semibold text-brand-text hover:opacity-90 disabled:opacity-50"
          >
            Actualizar la existente
          </button>
        )}
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={saving || !name.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {saving ? "Guardando…" : "Guardar en el baúl"}
        </button>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
