"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { PipelineBoard, PipelineCardDto, StageDto } from "@/lib/types";
import { SOURCE_KIND_LABEL, taskDueState } from "@/lib/pipeline";
import { formatMoneyCents, sumable } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { PriorityBadge } from "./priority-picker";
import { TaskDueChip } from "./entity-tasks";

/**
 * 037d — el mismo tablero, en LISTA: todas las tarjetas del tablero actual
 * (ventas, gestiones o tareas) en una tabla — foto, título, etapa,
 * responsable, fuente, monto, vencimiento y prioridad. Un clic abre el MISMO
 * cajón del tablero. Los encabezados ordenan.
 */

type SortKey = "etapa" | "titulo" | "monto" | "vencimiento" | "prioridad";

const PRIO_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

function tituloDe(lead: PipelineCardDto, board: PipelineBoard): string {
  if (board === "tareas") return lead.label ?? lead.contact?.name ?? "Tarea";
  return lead.contact?.name ?? lead.label ?? "Tarjeta";
}

export function PipelineListView({
  board,
  cards,
  stages,
  currency,
  showsOwner,
  onOpen,
}: {
  board: PipelineBoard;
  cards: PipelineCardDto[];
  stages: StageDto[];
  currency: string;
  /** Con el equipo a la vista, cada fila confiesa de quién es. */
  showsOwner: boolean;
  onOpen: (lead: PipelineCardDto) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "etapa",
    dir: 1,
  });
  /** 037d — la letra estratégica: mirar el flujo por etapa o solo lo vencido. */
  const [etapaFiltro, setEtapaFiltro] = useState<string>("todas");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const ahora = useMemo(() => new Date(), []);
  const hayVencimiento = useMemo(() => cards.some((c) => c.dueAt), [cards]);

  const filtradas = useMemo(
    () =>
      cards.filter(
        (c) =>
          (etapaFiltro === "todas" || c.stageId === etapaFiltro) &&
          (!soloVencidas ||
            taskDueState(c.dueAt, c.completedAt, ahora) === "overdue")
      ),
    [cards, etapaFiltro, soloVencidas, ahora]
  );

  /** Cuánto hay, cuánto vale (solo sumable) y qué está vencido. */
  const resumen = useMemo(() => {
    let totalCents = 0;
    let hayMonto = false;
    let vencidas = 0;
    for (const c of filtradas) {
      if (sumable({ amountCents: c.amountCents, currency: c.currency }, currency)) {
        totalCents += c.amountCents ?? 0;
        hayMonto = true;
      }
      if (taskDueState(c.dueAt, c.completedAt, ahora) === "overdue") vencidas += 1;
    }
    return { totalCents, hayMonto, vencidas };
  }, [filtradas, currency, ahora]);

  const stageOf = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );

  const rows = useMemo(() => {
    const val = (c: PipelineCardDto): number | string => {
      switch (sort.key) {
        case "etapa": {
          const s = stageOf.get(c.stageId);
          return s ? s.position : 0;
        }
        case "titulo":
          return tituloDe(c, board).toLowerCase();
        case "monto":
          return c.amountCents ?? -1;
        case "vencimiento":
          // Sin fecha, al final (no es "lo más urgente").
          return c.dueAt ? Date.parse(c.dueAt) : Number.MAX_SAFE_INTEGER;
        case "prioridad":
          return c.priority ? PRIO_RANK[c.priority] ?? 9 : 9;
      }
    };
    return filtradas.slice().sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let d: number;
      if (typeof va === "string" || typeof vb === "string") {
        d = String(va).localeCompare(String(vb), "es");
      } else {
        d = (va as number) - (vb as number);
        if (sort.key === "etapa" && d === 0) d = a.position - b.position;
      }
      return d * sort.dir || tituloDe(a, board).localeCompare(tituloDe(b, board), "es");
    });
  }, [filtradas, sort, stageOf, board]);

  function ordenar(key: SortKey) {
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
  }

  function Th({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) {
    const active = sort.key === k;
    return (
      <th className={cn("px-2.5 py-2 text-left font-semibold", className)}>
        <button
          onClick={() => ordenar(k)}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
            active ? "text-foreground" : "text-text-3"
          )}
        >
          {children}
          <span className="text-[10px]">{active ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
        </button>
      </th>
    );
  }

  if (cards.length === 0) {
    return (
      <p className="py-10 text-center text-[12.5px] text-text-3">
        No hay tarjetas en este tablero todavía.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 037d — la cabecera estratégica: cuántas, cuánto valen y qué venció;
          y los filtros para leer el flujo por etapa. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[12.5px] font-semibold">
          {filtradas.length} tarjeta{filtradas.length === 1 ? "" : "s"}
          {filtradas.length !== cards.length ? ` de ${cards.length}` : ""}
        </span>
        {resumen.hayMonto && (
          <span className="text-[12.5px] text-text-2">
            Monto: <span className="font-semibold">{formatMoneyCents(resumen.totalCents, currency)}</span>
          </span>
        )}
        {resumen.vencidas > 0 && (
          <span className="text-[12.5px] font-semibold text-danger-text">
            {resumen.vencidas} vencida{resumen.vencidas === 1 ? "" : "s"}
          </span>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-text-2">
          Etapa:
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value)}
            className="h-8 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
          >
            <option value="todas">Todas</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {hayVencimiento && (
          <button
            onClick={() => setSoloVencidas((v) => !v)}
            aria-pressed={soloVencidas}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
              soloVencidas
                ? "border-danger-soft bg-danger-tint text-danger-text"
                : "text-text-2 hover:bg-accent"
            )}
          >
            Solo vencidas
          </button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-text-3">
          Ninguna tarjeta con ese filtro.
        </p>
      ) : (
      <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <thead className="border-b bg-subtle text-[11.5px]">
            <tr>
              <Th k="titulo">Tarjeta</Th>
              <Th k="etapa">Etapa</Th>
              {showsOwner && <th className="px-2.5 py-2 text-left font-semibold text-text-3">Responsable</th>}
              <th className="px-2.5 py-2 text-left font-semibold text-text-3">Fuente</th>
              <Th k="monto" className="text-right [&>button]:justify-end">Monto</Th>
              <Th k="vencimiento">Vencimiento</Th>
              <Th k="prioridad">Prioridad</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const stage = stageOf.get(lead.stageId);
              const esTarea = board === "tareas";
              const titulo = tituloDe(lead, board);
              return (
                <tr
                  key={lead.id}
                  onClick={() => onOpen(lead)}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-accent"
                >
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <ContactAvatar
                        name={esTarea ? lead.ownerName ?? titulo : titulo}
                        seed={esTarea ? lead.ownerUserId ?? lead.id : lead.contact?.id ?? lead.id}
                        size="sm"
                        src={esTarea ? lead.ownerAvatarUrl ?? null : lead.contact?.avatarUrl ?? null}
                      />
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate font-semibold",
                            lead.completedAt && "text-muted-foreground line-through"
                          )}
                        >
                          {titulo}
                        </p>
                        {esTarea && lead.contact && (
                          <p className="truncate text-[11px] text-text-3">
                            Contacto: {lead.contact.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-text-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          stage?.kind === "won"
                            ? "bg-success-text"
                            : stage?.kind === "lost"
                              ? "bg-text-3"
                              : "bg-brand"
                        )}
                      />
                      {stage?.name ?? "—"}
                    </span>
                  </td>
                  {showsOwner && (
                    <td className="px-2.5 py-2 text-text-2">
                      {lead.ownerName ?? "—"}
                    </td>
                  )}
                  <td className="px-2.5 py-2 text-text-3">
                    {SOURCE_KIND_LABEL[lead.sourceKind] ?? lead.sourceKind}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-text-2">
                    {lead.amountCents !== null && lead.amountCents !== undefined
                      ? formatMoneyCents(lead.amountCents, lead.currency ?? currency)
                      : "—"}
                  </td>
                  <td className="px-2.5 py-2">
                    {lead.dueAt ? (
                      <TaskDueChip dueAt={lead.dueAt} completedAt={lead.completedAt} />
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2">
                    {lead.priority ? <PriorityBadge value={lead.priority} /> : <span className="text-text-3">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </div>
  );
}
