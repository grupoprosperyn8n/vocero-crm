"use client";

/**
 * 041b — Pestaña «Seguimiento» del tablero: el ARCHIVO comercial del
 * Cliente 360.
 *
 * Acá queda todo lo que el sistema fue haciendo, para volver a revisarlo
 * cuando se arma estrategia: cada propuesta con sus hitos (creada → derivada
 * → enviada → vista → respondió) y cada acción ya ejecutada desde la Cola de
 * hoy o desde la ficha. Un cliente puede tener VARIAS acciones y propuestas:
 * por eso hay dos lecturas —por acción (la línea de tiempo) y por cliente
 * (agrupado, para ver a quién ya se tocó y con qué resultado).
 *
 * Alcance por rol: gerente, propietario y administrador ven todo el equipo;
 * un miembro ve lo suyo. Mobile-first: una columna en el celular, lista en
 * tablet y computadora.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Sparkles,
  Archive,
  PauseCircle,
  Target,
} from "lucide-react";
import type {
  FollowUpItemDto,
  TeamGroupLiteDto,
  TeamMemberLiteDto,
} from "@/lib/types";
import type { PanelCustomer } from "./client-panel";

type Vista = "accion" | "cliente";

const WHAT_META: Record<
  string,
  { Icon: typeof Sparkles; chip: string; label: string }
> = {
  creada: { Icon: Sparkles, chip: "border-border-strong bg-subtle text-text-2", label: "creada" },
  derivada: { Icon: Target, chip: "border-amber-500/30 bg-amber-500/10 text-amber-700", label: "derivada" },
  enviada: { Icon: Send, chip: "border-brand-soft bg-brand-tint text-brand-text", label: "enviada" },
  vista: { Icon: Eye, chip: "border bg-card text-text-2", label: "vista" },
  respondio: { Icon: MessageCircle, chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", label: "respondió" },
  archivada: { Icon: Archive, chip: "border-border-strong bg-subtle text-text-3", label: "archivada" },
  pausada: { Icon: PauseCircle, chip: "border-amber-500/30 bg-amber-500/10 text-amber-700", label: "publicidad pausada" },
  accion: { Icon: Activity, chip: "border bg-card text-text-3", label: "acción ejecutada" },
};

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FollowUpPanel({
  onOpenPanel,
}: {
  onOpenPanel: (c: PanelCustomer) => void;
}) {
  const [items, setItems] = useState<FollowUpItemDto[] | null>(null);
  const [directory, setDirectory] = useState<TeamMemberLiteDto[]>([]);
  const [groups, setGroups] = useState<TeamGroupLiteDto[]>([]);
  const [vista, setVista] = useState<Vista>("accion");
  const [gestiona, setGestiona] = useState(""); // "u:<id>" | "g:<id>" | ""
  const [origen, setOrigen] = useState(""); // "" | cola | ficha | propuesta
  const [busca, setBusca] = useState(""); // filtro local por cliente
  const [abierto, setAbierto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (dirLoaded: boolean) => {
      setLoading(true);
      setError("");
      const qs = new URLSearchParams();
      if (gestiona.startsWith("u:")) qs.set("assignee", gestiona.slice(2));
      // g: (grupo) se filtra local: el listado trae el encargado del hito.
      try {
        const [fRes, dRes] = await Promise.all([
          fetch(`/api/proposals/followup?${qs.toString()}`, { cache: "no-store" }),
          dirLoaded
            ? Promise.resolve(null)
            : fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null),
        ]);
        const fData = (await fRes.json().catch(() => ({}))) as {
          items?: FollowUpItemDto[];
          message?: string;
        };
        if (!fRes.ok || !fData.items) {
          throw new Error(fData.message ?? "No se pudo cargar el seguimiento");
        }
        setItems(fData.items);
        if (dRes) {
          const dData = (await dRes.json().catch(() => ({}))) as {
            members?: TeamMemberLiteDto[];
            groups?: TeamGroupLiteDto[];
          };
          setDirectory(dData.members ?? []);
          setGroups(dData.groups ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el seguimiento");
      } finally {
        setLoading(false);
      }
    },
    [gestiona]
  );

  useEffect(() => {
    void load(directory.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestiona]);

  const filtrados = useMemo(() => {
    let out = items ?? [];
    if (origen) out = out.filter((i) => i.source === origen);
    if (gestiona.startsWith("g:")) {
      const gid = gestiona.slice(2);
      const nombre = groups.find((g) => g.id === gid)?.name ?? "";
      out = out.filter((i) => (i.detail ?? "").includes(nombre));
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      out = out.filter(
        (i) =>
          (i.clientName ?? "").toLowerCase().includes(q) ||
          (i.userName ?? "").toLowerCase().includes(q) ||
          (i.detail ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [items, origen, gestiona, groups, busca]);

  const porCliente = useMemo(() => {
    const mapa = new Map<
      string,
      {
        ref: string | null;
        nombre: string;
        items: FollowUpItemDto[];
        acciones: number;
        propuestas: Set<string>;
        ultima: string;
      }
    >();
    for (const i of filtrados) {
      const key = i.clientRef ?? `~${i.clientName ?? "?"}`;
      const g = mapa.get(key) ?? {
        ref: i.clientRef,
        nombre: i.clientName ?? "Cliente",
        items: [],
        acciones: 0,
        propuestas: new Set<string>(),
        ultima: i.at,
      };
      g.items.push(i);
      if (i.type === "propuesta") g.propuestas.add(i.token ?? i.id.split(":")[0]!);
      else g.acciones += 1;
      if (i.at > g.ultima) g.ultima = i.at;
      mapa.set(key, g);
    }
    return [...mapa.values()].sort((a, b) => (a.ultima < b.ultima ? 1 : -1));
  }, [filtrados]);

  return (
    <div className="space-y-4">
      {/* Vistas + filtros (mobile-first: todo apila) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
          <Activity size={14} /> Ver:
        </div>
        <div className="flex gap-1.5">
          {(
            [
              { k: "accion" as const, l: "Por acción" },
              { k: "cliente" as const, l: "Por cliente" },
            ]
          ).map(({ k, l }) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              className={
                vista === k
                  ? "rounded-full border border-brand bg-brand-veil px-3 py-1.5 text-[12px] font-bold text-brand"
                  : "rounded-full border border-border-strong px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-accent"
              }
            >
              {l}
            </button>
          ))}
        </div>
        <select
          value={gestiona}
          onChange={(e) => setGestiona(e.target.value)}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
          aria-label="Quién gestiona"
        >
          <option value="">Todo el equipo</option>
          <optgroup label="Empleados">
            {directory.map((m) => (
              <option key={m.userId} value={`u:${m.userId}`}>
                {m.name}
              </option>
            ))}
          </optgroup>
          {groups.length > 0 && (
            <optgroup label="Grupos del chat">
              {groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
          aria-label="Origen"
        >
          <option value="">Todo el origen</option>
          <option value="cola">Cola de hoy</option>
          <option value="ficha">Ficha / Cliente 360°</option>
          <option value="propuesta">Propuestas</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, empleado o detalle…"
          className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-1.5 text-[12.5px]"
        />
        <button
          type="button"
          onClick={() => void load(false)}
          className="flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <p className="text-[11.5px] text-text-3">
        El archivo comercial del Cliente 360: lo más nuevo arriba. Cada cliente
        puede tener varias acciones y propuestas — usá «Por cliente» para ver
        a quién ya se tocó y cómo le fue.
      </p>

      {error && <p className="text-[12.5px] font-semibold text-danger-text">{error}</p>}

      {items === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-card px-4 py-10 text-[13px] text-text-3">
          <Loader2 size={15} className="animate-spin" /> Cargando el seguimiento…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-[12.5px] text-text-3">
          Todavía no hay acciones registradas con estos filtros.
        </div>
      ) : vista === "accion" ? (
        <div className="space-y-1.5">
          {filtrados.map((i) => {
            const meta = WHAT_META[i.what] ?? WHAT_META.accion!;
            const Icon = meta.Icon;
            const clickeable = i.clientRef?.startsWith("sgsa:");
            return (
              <div
                key={i.id}
                className="flex flex-col gap-1 rounded-xl border bg-card px-3 py-2 sm:flex-row sm:items-center sm:gap-2.5"
              >
                <span className={`flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${meta.chip}`}>
                  <Icon size={11} /> {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-text-1">
                    {clickeable ? (
                      <button
                        type="button"
                        className="font-semibold text-brand-text hover:underline"
                        onClick={() =>
                          onOpenPanel({ id: i.clientRef!, name: i.clientName ?? "Cliente" })
                        }
                        title="Abrir el panel de control de este cliente"
                      >
                        {i.clientName ?? "Cliente"}
                      </button>
                    ) : (
                      i.clientName ?? "Cliente"
                    )}
                    {i.detail ? <span className="font-normal text-text-3"> · {i.detail}</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-text-3">
                    {i.userName ? `${i.userName} · ` : ""}
                    {i.source === "cola" ? "Cola de hoy" : i.source === "ficha" ? "Ficha" : "Propuesta"}
                    {i.status ? ` · ${i.status}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-text-3">
                  {fmtFecha(i.at)}
                </span>
                {i.token && (
                  <a
                    href={`/p/${i.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit rounded-lg border bg-card px-2 py-1 text-[11px] font-semibold text-text-2 hover:bg-subtle"
                  >
                    Abrir pieza
                  </a>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {porCliente.map((g) => {
            const abiertoEste = abierto === (g.ref ?? g.nombre);
            return (
              <div key={g.ref ?? g.nombre} className="rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => setAbierto(abiertoEste ? null : g.ref ?? g.nombre)}
                  className="flex w-full flex-col gap-1 px-3 py-2.5 text-left sm:flex-row sm:items-center sm:gap-2.5"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-text-1">
                    {abiertoEste ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {g.nombre}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full border bg-subtle px-2 py-0.5 font-bold text-text-2">
                      {g.propuestas.size} propuesta{g.propuestas.size === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border bg-subtle px-2 py-0.5 font-bold text-text-2">
                      {g.acciones} acción{g.acciones === 1 ? "" : "es"}
                    </span>
                  </span>
                  <span className="flex-1" />
                  <span className="text-[11px] tabular-nums text-text-3">
                    última: {fmtFecha(g.ultima)}
                  </span>
                </button>
                {abiertoEste && (
                  <div className="space-y-1 border-t px-3 py-2">
                    {g.items.map((i) => {
                      const meta = WHAT_META[i.what] ?? WHAT_META.accion!;
                      const Icon = meta.Icon;
                      return (
                        <div key={i.id} className="flex items-center gap-2 text-[11.5px]">
                          <span className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>
                            <Icon size={10} /> {meta.label}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-text-2">
                            {i.detail ?? ""}
                            {i.userName ? ` · ${i.userName}` : ""}
                          </span>
                          <span className="shrink-0 tabular-nums text-text-3">{fmtFecha(i.at)}</span>
                          {i.token && (
                            <a
                              href={`/p/${i.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 font-semibold text-brand-text hover:underline"
                            >
                              pieza
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
