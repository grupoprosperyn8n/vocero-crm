"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import {
  countVariables,
  renderBody,
  validateBodyVariables,
} from "@/lib/templates";
import { CATALOGO_NOMBRE, CATALOGO_SEGMENTOS } from "@/lib/templates-catalog";

/**
 * 044b-B13 — «Plantillas de Meta»: el catálogo de mensajes de WhatsApp
 * segmentado por uso. Cada plantilla trae su explicación, sus componentes,
 * uso Automático (con regla) y pausa (Offline). Se pueden crear (locales o a
 * Meta), editar y eliminar — lo usan todos los roles. El mismo componente se
 * ve en Ajustes → Plantillas y en el tablero → Crear → Plantillas de Meta.
 */

const CATEGORIA_LABEL: Record<string, string> = {
  UTILITY: "Utilidad",
  MARKETING: "Marketing",
};

const ESTADO_OPCIONES = [
  { id: "todas", label: "Todas" },
  { id: "activas", label: "Activas" },
  { id: "offline", label: "Offline" },
  { id: "automaticas", label: "Automáticas" },
] as const;

type EstadoFiltro = (typeof ESTADO_OPCIONES)[number]["id"];

export function TemplatesClient() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sembrando, setSembrando] = useState(false);

  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<string>("todos");
  const [cat, setCat] = useState<string>("todas");
  const [estado, setEstado] = useState<EstadoFiltro>("todas");

  const [editando, setEditando] = useState<TemplateDto | null>(null);
  const [creando, setCreando] = useState(false);
  const [usando, setUsando] = useState<TemplateDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/templates").catch(() => null);
    if (!res?.ok) {
      setCargando(false);
      return;
    }
    const data = (await res.json()) as { templates: TemplateDto[] };
    setTemplates(data.templates);
    setCargando(false);
  }, []);

  /** Sincronización con Meta (solo tiene sentido con número conectado). */
  const sync = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setSyncing(true);
        setMsg(null);
      }
      const res = await fetch("/api/templates/sync", { method: "POST" }).catch(
        () => null
      );
      if (!silent) setSyncing(false);
      if (res?.ok) {
        const data = (await res.json()) as { updated: number };
        if (!silent) {
          setMsg(
            data.updated > 0
              ? `${data.updated} plantilla(s) actualizada(s)`
              : "Todo al día"
          );
        }
        if (!silent || data.updated > 0) void refetch();
      } else if (!silent) {
        const data = (await res?.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setMsg(data?.error?.message ?? "No se pudo sincronizar");
      }
    },
    [refetch]
  );

  useEffect(() => {
    void refetch().then(() => {
      // El sync silencioso solo si alguna plantilla está pendiente/vinculada a Meta.
      void sync({ silent: true });
    });
  }, [refetch, sync]);

  async function cargarCatalogo() {
    setSembrando(true);
    setMsg(null);
    const res = await fetch("/api/templates/seed", { method: "POST" }).catch(
      () => null
    );
    setSembrando(false);
    if (!res?.ok) {
      setMsg("No se pudo cargar el catálogo");
      return;
    }
    const data = (await res.json()) as {
      templates: number;
      pieces: number;
    };
    const total = data.templates + data.pieces;
    setMsg(
      total > 0
        ? `Catálogo cargado: ${data.templates} plantilla(s) nuevas y ${data.pieces} lista(s) para el Constructor.`
        : "El catálogo ya estaba completo ✓"
    );
    void refetch();
  }

  const segmentosUsados = useMemo(() => {
    const usados = new Set(templates.map((t) => t.segment).filter(Boolean));
    return Object.entries(CATALOGO_SEGMENTOS).filter(([id]) =>
      usados.has(id)
    );
  }, [templates]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (seg !== "todos" && t.segment !== seg) return false;
      if (cat !== "todas" && t.category !== cat) return false;
      if (estado === "activas" && t.paused) return false;
      if (estado === "offline" && !t.paused) return false;
      if (estado === "automaticas" && !t.auto) return false;
      if (
        term &&
        !`${t.name} ${CATALOGO_NOMBRE[t.seedCode ?? ""]?.nombre ?? ""} ${t.body} ${t.explanation ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [templates, q, seg, cat, estado]);

  const stats = useMemo(
    () => ({
      total: templates.length,
      segmentos: new Set(templates.map((t) => t.segment).filter(Boolean)).size,
      automaticas: templates.filter((t) => t.auto && !t.paused).length,
      offline: templates.filter((t) => t.paused).length,
    }),
    [templates]
  );

  async function toggle(t: TemplateDto, patch: Partial<TemplateDto>) {
    const res = await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) void refetch();
    else {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMsg(data?.error?.message ?? "No se pudo actualizar");
    }
  }

  async function eliminar(id: string) {
    const res = await fetch(`/api/templates/${id}`, {
      method: "DELETE",
    }).catch(() => null);
    setConfirmDelete(null);
    if (res?.ok) void refetch();
    else setMsg("No se pudo eliminar la plantilla");
  }

  return (
    <div className="w-full space-y-4">
      {/* Lead + acciones */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[12.5px] text-text-2">
          El catálogo de mensajes para WhatsApp, <b>segmentado por uso</b>: cada
          plantilla explica cuándo se usa, se puede marcar{" "}
          <b>Automática</b> (la dispara el sistema con su regla) o dejar{" "}
          <b>Offline</b>. De cada una nace también su pieza lista para el{" "}
          <b>Constructor de publicaciones</b>. Lo usan todos los roles.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void cargarCatalogo()}
            disabled={sembrando}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
            title="Carga las 43 plantillas del catálogo + sus piezas para el Constructor (idempotente)"
          >
            <Sparkles size={12} />
            {sembrando ? "Cargando…" : "Cargar catálogo (43)"}
          </button>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            Sincronizar
          </button>
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
          >
            <Plus size={12} /> Nueva plantilla
          </button>
        </div>
      </div>
      {msg && (
        <p className="rounded-md border border-brand-soft bg-brand-tint px-3 py-1.5 text-[11.5px] font-medium text-brand-text">
          {msg}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Plantillas", value: stats.total },
          { label: "Segmentos", value: stats.segmentos },
          { label: "Automáticas", value: stats.automaticas },
          { label: "Offline", value: stats.offline },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card px-3 py-2">
            <p className="text-[10.5px] font-semibold tracking-wide text-text-3 uppercase">
              {k.label}
            </p>
            <p className="text-lg font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, mensaje o uso…"
            className="h-8 w-64 rounded-md border border-border-strong bg-card pr-2.5 pl-7 text-[12px]"
          />
        </div>
        <select
          value={seg}
          onChange={(e) => setSeg(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-card px-2 text-[12px]"
        >
          <option value="todos">Todos los segmentos</option>
          {segmentosUsados.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {[
            { id: "todas", label: "Todas" },
            { id: "UTILITY", label: "Utilidad" },
            { id: "MARKETING", label: "Marketing" },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={`h-8 rounded-full border px-3 text-[11.5px] font-semibold transition-colors ${
                cat === c.id
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border-strong bg-card text-text-2 hover:bg-accent"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoFiltro)}
          className="h-8 rounded-md border border-border-strong bg-card px-2 text-[12px]"
        >
          {ESTADO_OPCIONES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-[12.5px] text-text-3">
          Cargando plantillas…
        </p>
      ) : filtradas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-[12.5px] text-text-3">
          {templates.length === 0 ? (
            <>
              Sin plantillas todavía. Apretá <b>«Cargar catálogo (43)»</b> para
              traer el catálogo completo segmentado, o creá la primera con{" "}
              <b>«Nueva plantilla»</b>.
            </>
          ) : (
            "Ningún resultado con esos filtros."
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((t) => (
            <div
              key={t.id}
              className={`rounded-lg border bg-card p-3 transition-opacity ${
                t.paused ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12.5px] font-semibold break-words">
                  {t.seedCode ? (CATALOGO_NOMBRE[t.seedCode]?.nombre ?? t.name) : t.name}
                </p>
                {t.seedCode && (
                  <p className="font-mono text-[10px] text-text-3 break-all">{t.name}</p>
                )}
                {t.segment && (
                  <span className="rounded-full border border-border-strong bg-background px-2 py-0.5 text-[10.5px] font-semibold text-text-2">
                    {CATALOGO_SEGMENTOS[t.segment] ?? t.segment}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                    t.category === "MARKETING"
                      ? "bg-warning-tint text-warning-text"
                      : "bg-brand-tint text-brand-text"
                  }`}
                >
                  {CATEGORIA_LABEL[t.category] ?? t.category}
                </span>
                {t.seedCode ? (
                  <span className="text-[10.5px] text-text-3">· del catálogo</span>
                ) : null}
                {t.status === "pending" && (
                  <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[10.5px] font-semibold text-warning-text">
                    Pendiente de Meta
                  </span>
                )}
                {t.status === "approved" && (
                  <span className="rounded-full bg-success-tint px-2 py-0.5 text-[10.5px] font-semibold text-success-text">
                    Aprobada
                  </span>
                )}
                {t.status === "rejected" && (
                  <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10.5px] font-semibold text-danger-text">
                    Rechazada
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void toggle(t, { auto: !t.auto })}
                    title={
                      t.auto
                        ? `Automática: ${t.autoRule || "regla a definir"}`
                        : "Marcar como Automática (la dispara el sistema con su regla)"
                    }
                    className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold transition-colors ${
                      t.auto
                        ? "border-success-soft bg-success-tint text-success-text"
                        : "border-border-strong bg-card text-text-3 hover:bg-accent"
                    }`}
                  >
                    <Bot size={11} /> {t.auto ? "Automática" : "Auto"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(t, { paused: !t.paused })}
                    title={t.paused ? "Reactivar (volver a usarla)" : "Poner Offline (pausarla, no se usa)"}
                    className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold transition-colors ${
                      t.paused
                        ? "border-border-strong bg-muted text-text-3"
                        : "border-border-strong bg-card text-text-3 hover:bg-accent"
                    }`}
                  >
                    {t.paused ? "Offline" : "Online"}
                  </button>
                </div>
              </div>
              {t.explanation && (
                <p className="mt-1.5 text-[11.5px] text-text-2">
                  <b>Cuándo se usa:</b> {t.explanation}
                </p>
              )}
              {t.auto && t.autoRule && (
                <p className="mt-1 text-[10.5px] text-success-text">
                  🤖 Automática: {t.autoRule}
                </p>
              )}
              <p className="mt-1.5 line-clamp-3 text-[12px] whitespace-pre-wrap text-text-2">
                {t.body}
              </p>
              {(t.buttons?.length ?? 0) > 0 && (
                <p className="mt-1 text-[10.5px] text-text-3">
                  Botones: {t.buttons.map((b) => b.label).join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setUsando(t)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-brand px-2.5 text-[11px] font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
                >
                  Usar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(t)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                >
                  <Pencil size={11} /> Editar
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
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11px] font-semibold text-danger-text transition-colors hover:bg-accent"
                  >
                    <Trash2 size={11} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {usando && <UsarModal t={usando} onClose={() => setUsando(null)} />}
      {(creando || editando) && (
        <EditorModal
          t={editando}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
          onSaved={() => {
            setCreando(false);
            setEditando(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Modal «Usar» — rellena las variables y copia el mensaje listo.
 * ============================================================ */

function UsarModal({ t, onClose }: { t: TemplateDto; onClose: () => void }) {
  const n = countVariables(t.body);
  const [vals, setVals] = useState<string[]>(Array.from({ length: n }, () => ""));
  const [copiado, setCopiado] = useState(false);
  const final = renderBody(t.body, vals);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(final);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard bloqueado: el texto queda visible para copiar a mano */
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold">
            Usar «{t.seedCode ? (CATALOGO_NOMBRE[t.seedCode]?.nombre ?? t.name) : t.name}»
          </h3>
          <p className="text-[11.5px] text-text-3">
            Completá lo que va en cada variable y copiá el mensaje listo.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-3 hover:bg-accent"
        >
          <X size={15} />
        </button>
      </div>
      {n > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: n }, (_, i) => (
            <label key={i} className="space-y-1">
              <span className="text-[11px] font-semibold text-text-2">
                {"{{" + (i + 1) + "}}"}
              </span>
              <input
                value={vals[i] ?? ""}
                onChange={(e) =>
                  setVals((prev) => {
                    const copia = [...prev];
                    copia[i] = e.target.value;
                    return copia;
                  })
                }
                placeholder={`Valor ${i + 1}`}
                className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]"
              />
            </label>
          ))}
        </div>
      )}
      <pre className="mt-3 max-h-56 overflow-y-auto rounded-md border border-border-strong bg-background px-3 py-2 text-[12px] whitespace-pre-wrap text-text">
        {final}
      </pre>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void copiar()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover"
        >
          {copiado ? <Check size={12} /> : <Copy size={12} />}
          {copiado ? "Copiado" : "Copiar mensaje"}
        </button>
      </div>
    </Overlay>
  );
}

/* ============================================================
 * Modal crear/editar — el form del catálogo.
 * ============================================================ */

function EditorModal({
  t,
  onClose,
  onSaved,
}: {
  t: TemplateDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = Boolean(t);
  const [name, setName] = useState(t?.name ?? "");
  const [segment, setSegment] = useState(t?.segment ?? "");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">(
    (t?.category as "UTILITY" | "MARKETING") ?? "UTILITY"
  );
  const [explanation, setExplanation] = useState(t?.explanation ?? "");
  const [header, setHeader] = useState(t?.header ?? "");
  const [body, setBody] = useState(t?.body ?? "");
  const [footer, setFooter] = useState(t?.footer ?? "");
  const [b1, setB1] = useState(t?.buttons?.[0]?.label ?? "");
  const [b2, setB2] = useState(t?.buttons?.[1]?.label ?? "");
  const [auto, setAuto] = useState(t?.auto ?? false);
  const [autoRule, setAutoRule] = useState(t?.autoRule ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyError = body.trim() ? validateBodyVariables(body) : null;
  const variableCount = countVariables(body);

  async function guardar({ aMeta = false } = {}) {
    setSaving(true);
    setError(null);
    const buttons = [b1, b2]
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => ({ tipo: "respuesta", label }));
    const payload = {
      name,
      category,
      body,
      segment: segment || null,
      explanation: explanation || null,
      header: header || null,
      footer: footer || null,
      buttons,
      auto,
      autoRule: auto ? autoRule || null : null,
    };
    const res = await fetch(editando ? `/api/templates/${t!.id}` : "/api/templates", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editando ? payload : { ...payload, local: !aMeta }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar la plantilla");
      return;
    }
    onSaved();
  }

  const inputCls =
    "h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12px]";
  const labelCls = "text-[11px] font-semibold text-text-2";

  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold">
            {editando ? `Editar «${t!.name}»` : "Nueva plantilla"}
          </h3>
          <p className="text-[11.5px] text-text-3">
            {editando
              ? "Cambiá lo que necesites: comunicá el uso con la explicación."
              : "Queda guardada en tu catálogo (local). Si tenés número conectado, podés mandarla a aprobación de Meta."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-3 hover:bg-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelCls}>Nombre (interno, sin espacios) *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="seguimiento_cotizacion"
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Segmento (uso)</span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className={inputCls}
          >
            <option value="">Sin segmento</option>
            {Object.entries(CATALOGO_SEGMENTOS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Categoría Meta</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as "UTILITY" | "MARKETING")
            }
            className={inputCls}
          >
            <option value="UTILITY">Utilidad (seguimiento)</option>
            <option value="MARKETING">Marketing</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Encabezado (opcional)</span>
          <input
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Pie (opcional)</span>
          <input
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Ej.: Rafael Allende Seguros · Buenos Aires"
            className={inputCls}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={labelCls}>Cuándo se usa (explicación)</span>
          <input
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Ej.: al registrarse un faltante de documentación del siniestro"
            className={inputCls}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={labelCls}>Cuerpo * (variables {"{{1}}"}, {"{{2}}"}… en orden)</span>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hola {{1}}, te confirmo tu sesión el {{2}} a las {{3}}."
            className="w-full rounded-md border border-border-strong bg-background px-2 py-1.5 text-[12px]"
          />
          {bodyError ? (
            <span className="text-[11px] text-danger-text">{bodyError}</span>
          ) : (
            variableCount > 0 && (
              <span className="text-[11px] text-text-3">
                {variableCount} variable(s): al usar pedirá los valores.
              </span>
            )
          )}
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Botón 1 (opcional)</span>
          <input
            value={b1}
            onChange={(e) => setB1(e.target.value)}
            placeholder="Ej.: Confirmar"
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Botón 2 (opcional)</span>
          <input
            value={b2}
            onChange={(e) => setB2(e.target.value)}
            placeholder="Ej.: Consultar"
            className={inputCls}
          />
        </label>
        <label className="space-y-1 sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span className={labelCls}>
            🤖 Automática — la dispara el sistema cuando pasa esto:
          </span>
        </label>
        {auto && (
          <label className="space-y-1 sm:col-span-2">
            <span className={labelCls}>Regla del disparo automático</span>
            <input
              value={autoRule}
              onChange={(e) => setAutoRule(e.target.value)}
              placeholder="Ej.: 15 días antes del vencimiento de la póliza"
              className={inputCls}
            />
          </label>
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-danger-text">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border-strong bg-card px-3 text-[11.5px] font-semibold text-text-2 hover:bg-accent"
        >
          Cancelar
        </button>
        {!editando && (
          <button
            type="button"
            disabled={saving || !name.trim() || !body.trim() || bodyError !== null}
            onClick={() => void guardar({ aMeta: true })}
            title="Requiere número de WhatsApp conectado"
            className="h-8 rounded-md border border-border-strong bg-card px-3 text-[11.5px] font-semibold text-text-2 hover:bg-accent disabled:opacity-50"
          >
            Guardar y enviar a Meta
          </button>
        )}
        <button
          type="button"
          disabled={saving || !name.trim() || !body.trim() || bodyError !== null}
          onClick={() => void guardar()}
          className="h-8 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Guardando…" : editando ? "Guardar cambios" : "Guardar plantilla"}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-xl"} rounded-xl border bg-card p-4 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
