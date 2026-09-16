"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Circle,
  ExternalLink,
  MessageSquareText,
  Plus,
  Send,
  Settings2,
  Trophy,
  XCircle,
} from "lucide-react";
import type {
  LossReason,
  PipelineBoard,
  PipelineCardDto,
  PriorityValue,
  StageDto,
} from "@/lib/types";
import { formatMoneyCents, sumable } from "@/lib/money";
import { PIPELINE_BOARDS, taskDueState } from "@/lib/pipeline";
import { ALERT_ESTADO_LABEL, estadoForStage } from "@/lib/alerts";
import { alertRecordInterfaceUrl, sgsaClientInterfaceUrl } from "@/lib/sgsa-links";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/components/inbox/helpers";
import { StageManager } from "./stage-manager";
import { LossReasonDialog } from "./loss-reason-dialog";
import { AmountDialog } from "./amount-dialog";
import { PriorityBadge } from "./priority-picker";
import { GestionSearchDialog } from "./gestion-search-dialog";
import { LeadDrawer } from "./lead-drawer";
import { TaskDialog, type TaskOrigin } from "./task-dialog";
import { TaskDueChip } from "./entity-tasks";
import { TaskRequestDialog } from "./task-request-dialog";
import { TaskStatsPanel } from "./task-stats-panel";

/** Compat: antes el DTO del tablero se llamaba BoardLead. */
export type BoardLead = PipelineCardDto;

type StaffOption = { userId: string; name: string; role: string };

/**
 * 029 — Pipeline PERSONAL, de dos maneras: la pestaña de VENTAS (prospectos
 * del CRM y clientes del sistema) y la de GESTIONES (tarjetas de alertas y
 * cualquier cosa a seguir). El tablero se llena a MANO — se dejó de
 * autocargar — y cada uno ve lo suyo; propietario, administrador y gerente
 * ven el de todo el equipo con filtro por persona.
 */
export function PipelineClient({ role, meId }: { role: string; meId: string }) {
  const [board, setBoard] = useState<PipelineBoard>("ventas");
  const [assignee, setAssignee] = useState<string>("all");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currency, setCurrency] = useState("MXN");
  const [cards, setCards] = useState<PipelineCardDto[]>([]);
  const [activeLead, setActiveLead] = useState<PipelineCardDto | null>(null);
  const [managing, setManaging] = useState(false);
  const [cargado, setCargado] = useState(false);
  /** 030 — buscador de gestiones del sistema (traer una puntual al tablero). */
  const [gestionSearch, setGestionSearch] = useState(false);
  /** 037 — alta/edición de una tarea desde el tablero. */
  const [taskDialog, setTaskDialog] = useState<{
    task?: PipelineCardDto;
    origin?: TaskOrigin;
  } | null>(null);
  /** 037b — «pedir tarea» a un empleado (la tarjeta va a su chat). */
  const [pedirTarea, setPedirTarea] = useState(false);
  /** 037c — el tablero de tareas visto como tablero de gestión (gerente+). */
  const [verMetricas, setVerMetricas] = useState(false);
  /** 030 — aviso del tablero (p. ej. el sistema no aceptó sincronizar). */
  const [aviso, setAviso] = useState<string | null>(null);
  /** 030 — mover una tarjeta-alerta puede cambiar el estado EN EL SISTEMA. */
  const [pendingAlert, setPendingAlert] = useState<{
    leadId: string;
    stageId: string;
    mensaje: string;
  } | null>(null);
  /** El aviso se va solo: un cartel pegado deja de leerse a los segundos. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);
  /** Arrastre hacia una etapa perdida, esperando el motivo. */
  const [pendingLoss, setPendingLoss] = useState<{
    leadId: string;
    stageId: string;
    name: string;
  } | null>(null);
  /** Tarjeta cuyo monto se está capturando. */
  const [editandoMonto, setEditandoMonto] = useState<PipelineCardDto | null>(null);
  /**
   * Tarjeta abierta en el cajón. Se guarda el ID y no el objeto: así el cajón
   * lee siempre del tablero y refleja al instante lo que se cambie desde
   * dentro, en vez de enseñar una copia que envejece.
   */
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = cards.find((l) => l.id === abiertoId) ?? null;

  const seesWholeTeam = role !== "member";
  /** Con el equipo a la vista, cada tarjeta confiesa de quién es. */
  const showsOwner = seesWholeTeam && assignee !== "me";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const refetch = useCallback(async () => {
    const qs = new URLSearchParams({ board });
    if (seesWholeTeam) qs.set("assignee", assignee);
    const res = await fetch(`/api/pipeline/board?${qs}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      stages: StageDto[];
      cards: PipelineCardDto[];
      currency?: string;
    };
    if (data.currency) setCurrency(data.currency);
    setStages(data.stages);
    setCards(data.cards);
    setCargado(true);
  }, [board, assignee, seesWholeTeam]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Selector de persona: solo para quien ve el equipo completo.
  useEffect(() => {
    if (!seesWholeTeam) return;
    void fetch("/api/internal/staff")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { staff?: StaffOption[] } | null) => {
        if (d?.staff) setStaff(d.staff);
      })
      .catch(() => null);
  }, [seesWholeTeam]);

  /** Nadie mueve la tarjeta de otro: con el equipo a la vista, solo las
   *  propias se arrastran (las ajenas se consultan, no se tocan). */
  const esMia = useCallback(
    (l: PipelineCardDto) => l.ownerUserId === meId,
    [meId]
  );

  function onDragStart(event: DragStartEvent) {
    const lead = cards.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  async function moverLead(
    leadId: string,
    overStage: string,
    loss?: { reason: LossReason; note: string }
  ) {
    const lead = cards.find((l) => l.id === leadId);
    const destino = stages.find((s) => s.id === overStage);

    // 030 — la tarjeta de una ALERTA va «macheada» con la tabla ALERTA:
    // soltarla en la última etapa (o sacarla de ella) cambia el estado EN EL
    // SISTEMA. Se avisa antes de tocar nada.
    const mensajeSync = alertSyncMessage(lead, destino);
    if (!loss && mensajeSync) {
      setPendingAlert({ leadId, stageId: overStage, mensaje: mensajeSync });
      return;
    }

    const position = cards.filter((l) => l.stageId === overStage).length;
    // Optimista + persistencia
    setCards((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: overStage, position } : l))
    );
    const res = await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: overStage,
        position,
        ...(loss
          ? { lossReason: loss.reason, ...(loss.note ? { lossNote: loss.note } : {}) }
          : {}),
      }),
    }).catch(() => null);
    // El sistema es la fuente de verdad: si no aceptó el cambio de estado,
    // el refresco devuelve la tarjeta a su lugar y se avisa por qué.
    if (res && !res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setAviso(data?.error?.message ?? "No se pudo mover la tarjeta.");
    } else {
      setAviso(null);
    }
    void refetch();
  }

  async function guardarMonto(leadId: string, cents: number | null) {
    setCards((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, amountCents: cents } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // Sin `stageId`: esto NO mueve la tarjeta, solo escribe el importe.
      body: JSON.stringify({ amountCents: cents }),
    }).catch(() => null);
    void refetch();
  }

  async function guardarPrioridad(leadId: string, priority: PriorityValue | null) {
    setCards((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, priority } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority }),
    }).catch(() => null);
    void refetch();
  }

  /** 037 — tilde rápido: cierra (a «Terminadas») o reabre la tarea. */
  function alternarTerminada(lead: PipelineCardDto) {
    const destino = lead.completedAt
      ? stages.find((s) => s.kind === "open")
      : stages.find((s) => s.kind === "won");
    if (!destino || destino.id === lead.stageId) return;
    void moverLead(lead.id, destino.id);
  }

  /** Sacar MI tarjeta del tablero (029): se va con su bitácora. */
  async function sacarTarjeta(leadId: string) {
    setCards((prev) => prev.filter((l) => l.id !== leadId));
    setAbiertoId(null);
    await fetch(`/api/pipeline/leads/${leadId}`, { method: "DELETE" }).catch(
      () => null
    );
    void refetch();
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const leadId = String(event.active.id);
    const overStage = event.over ? String(event.over.id) : null;
    if (!overStage) return;
    const lead = cards.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overStage) return;
    if (!esMia(lead)) return; // tarjeta ajena: ni siquiera debió arrastrarse

    // Perder un trato exige motivo. Se pregunta ANTES de mover: si el dueño
    // cancela, la tarjeta ni siquiera parpadea fuera de su columna. Las
    // tarjetas del SISTEMA (alerta/gestión) no son tratos: van directo —
    // 031, el aviso de «Alerta del sistema» ya confirma el efecto real.
    const destino = stages.find((s) => s.id === overStage);
    if (destino?.kind === "lost" && !esTarjetaSistema(lead)) {
      setPendingLoss({ leadId, stageId: overStage, name: lead.contact?.name ?? lead.label ?? "la tarjeta" });
      return;
    }

    await moverLead(leadId, overStage);
  }

  /**
   * Cambiar de etapa desde el cajón. Entra por la MISMA puerta que el
   * arrastre: perder un trato exige motivo venga de donde venga, y duplicar
   * esa regla aquí sería tener dos sitios donde olvidarla.
   */
  function moverDesdeCajon(leadId: string, stageId: string) {
    const lead = cards.find((l) => l.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const destino = stages.find((s) => s.id === stageId);
    if (destino?.kind === "lost" && !esTarjetaSistema(lead)) {
      setPendingLoss({ leadId, stageId, name: lead.contact?.name ?? lead.label ?? "la tarjeta" });
      return;
    }
    void moverLead(leadId, stageId);
  }

  const vacio = cargado && cards.length === 0;

  /** 037 — vencidas del tablero de tareas: el número rojo de la pestaña. */
  const vencidas =
    board === "tareas"
      ? cards.filter(
          (c) => taskDueState(c.dueAt, c.completedAt, new Date()) === "overdue"
        ).length
      : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">Pipeline</h2>
          {/* Las dos maneras (029): ventas y gestiones, en el mismo lugar. */}
          <div className="flex rounded-md border border-border-strong bg-subtle p-0.5">
            {PIPELINE_BOARDS.map((b) => (
              <button
                key={b.value}
                onClick={() => {
                  setBoard(b.value);
                  setAbiertoId(null);
                  setVerMetricas(false);
                }}
                aria-pressed={board === b.value}
                className={cn(
                  "rounded px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                  board === b.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {b.label}
                {b.value === "tareas" && vencidas > 0 && (
                  <span
                    title={`${vencidas} tarea${vencidas === 1 ? "" : "s"} vencida${vencidas === 1 ? "" : "s"}`}
                    className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground"
                  >
                    {vencidas}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {seesWholeTeam && (
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Ver el pipeline de"
              className="h-8 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
            >
              <option value="all">Todo el equipo</option>
              <option value="me">Solo míos</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {board === "gestiones" && (
            <Button variant="outline" size="sm" onClick={() => setGestionSearch(true)}>
              <Plus className="h-4 w-4" /> Sumar gestión
            </Button>
          )}
          {board === "tareas" && (
            <Button variant="outline" size="sm" onClick={() => setTaskDialog({})}>
              <Plus className="h-4 w-4" /> Nueva tarea
            </Button>
          )}
          {board === "tareas" && seesWholeTeam && (
            <Button variant="outline" size="sm" onClick={() => setPedirTarea(true)}>
              <Send className="h-4 w-4" /> Pedir tarea
            </Button>
          )}
          {board === "tareas" && seesWholeTeam && (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={verMetricas}
              className={cn(verMetricas && "bg-accent")}
              onClick={() => setVerMetricas((v) => !v)}
            >
              <BarChart3 className="h-4 w-4" /> Métricas
            </Button>
          )}
          {role !== "member" && (
            <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
              <Settings2 className="h-4 w-4" /> Gestionar etapas
            </Button>
          )}
        </div>
      </header>

      {/* 030 — si el sistema no aceptó sincronizar, la tarjeta no se movió y
          acá se explica por qué. */}
      {aviso && (
        <div className="border-b border-warning-soft bg-warning-tint px-4 py-2 text-[12.5px] text-warning-text sm:px-6">
          {aviso}
        </div>
      )}

      {vacio && (
        <div className="border-b bg-subtle px-4 py-2 text-[12.5px] text-muted-foreground sm:px-6">
          {board === "ventas"
            ? "Este tablero se llena a mano: sumá prospectos desde el chat con el cliente, la ficha de un contacto del CRM o la de un cliente del sistema."
            : board === "gestiones"
              ? "Sumá gestiones desde la tarjeta de una alerta (acá o en Alertas), desde el chat con el cliente o su ficha — o buscá una del sistema con «Sumar gestión»."
              : "Creá tareas con «Nueva tarea» — o desde la ficha de un contacto, una alerta o un siniestro. Al llegar a «Terminadas» se cierran solas."}
        </div>
      )}

      {/* El tablero se arrastra en horizontal; en el teléfono cada columna
          se detiene en su sitio (snap) para no quedar a medio camino.
          037c — con «Métricas» activas, esta área muestra el dashboard. */}
      {board === "tareas" && verMetricas ? (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <TaskStatsPanel />
        </div>
      ) : (
        <div className="flex-1 snap-x snap-mandatory overflow-x-auto p-3 sm:snap-none sm:p-4">
          <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="flex h-full gap-3">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                board={board}
                currency={currency}
                showsOwner={showsOwner}
                canDrag={esMia}
                onEditAmount={setEditandoMonto}
                onToggleDone={alternarTerminada}
                onOpen={(l) => setAbiertoId(l.id)}
                leads={cards
                  .filter((l) => l.stageId === stage.id)
                  .sort((a, b) => a.position - b.position)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <LeadCard
                lead={activeLead}
                board={board}
                currency={currency}
                overlay
              />
            ) : null}
          </DragOverlay>
          </DndContext>
        </div>
      )}

      {managing && (
        <StageManager
          stages={stages}
          board={board}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}

      {/* Va ANTES que los diálogos: con el mismo z-index, el que se pinta
          después queda encima, y el motivo de pérdida debe tapar al cajón. */}
      {abierto && (
        <LeadDrawer
          lead={abierto}
          board={board}
          stages={stages}
          currency={currency}
          readOnly={!esMia(abierto)}
          onClose={() => setAbiertoId(null)}
          onMoveStage={(stageId) => moverDesdeCajon(abierto.id, stageId)}
          onAmount={(cents) => void guardarMonto(abierto.id, cents)}
          onPriority={(p) => void guardarPrioridad(abierto.id, p)}
          onRemove={() => void sacarTarjeta(abierto.id)}
          onRefresh={() => void refetch()}
        />
      )}

      {editandoMonto && (
        <AmountDialog
          leadName={editandoMonto.contact?.name ?? editandoMonto.label ?? "la tarjeta"}
          currency={editandoMonto.currency ?? currency}
          amountCents={editandoMonto.amountCents}
          priority={editandoMonto.priority}
          onPriorityChange={(p) => {
            setEditandoMonto({ ...editandoMonto, priority: p });
            void guardarPrioridad(editandoMonto.id, p);
          }}
          onCancel={() => setEditandoMonto(null)}
          onSave={(cents) => {
            const leadId = editandoMonto.id;
            setEditandoMonto(null);
            void guardarMonto(leadId, cents);
          }}
        />
      )}

      {pendingLoss && (
        <LossReasonDialog
          leadName={pendingLoss.name}
          onCancel={() => setPendingLoss(null)}
          onConfirm={(reason, note) => {
            const { leadId, stageId } = pendingLoss;
            setPendingLoss(null);
            void moverLead(leadId, stageId, { reason, note });
          }}
        />
      )}

      {/* 030 — mover una tarjeta-alerta toca la tabla ALERTA: se confirma qué
          va a pasar afuera antes de que pase. */}
      {pendingAlert && (
        <AlertSyncDialog
          mensaje={pendingAlert.mensaje}
          onCancel={() => setPendingAlert(null)}
          onConfirm={() => {
            const { leadId, stageId } = pendingAlert;
            setPendingAlert(null);
            void moverLead(leadId, stageId);
          }}
        />
      )}

      {gestionSearch && (
        <GestionSearchDialog
          onClose={() => setGestionSearch(false)}
          onAdded={() => void refetch()}
        />
      )}

      {/* 037 — el cajón de escritura de una tarea. */}
      {taskDialog && (
        <TaskDialog
          task={taskDialog.task ?? null}
          origin={taskDialog.origin ?? null}
          onClose={() => setTaskDialog(null)}
          onSaved={() => {
            setTaskDialog(null);
            void refetch();
          }}
        />
      )}

      {/* 037b — el pedido de tarea: viaja como tarjeta al chat del empleado. */}
      {pedirTarea && (
        <TaskRequestDialog
          onClose={() => setPedirTarea(false)}
          onSent={() => setPedirTarea(false)}
        />
      )}
    </div>
  );
}

/**
 * 030 → 031 — ¿este movimiento cambia el estado de la ALERTA en el sistema?
 * Si sí, devuelve el aviso a confirmar; si no, null y se mueve directo. El
 * estado destino es el de la etapa (mismo nombre que el sistema); las etapas
 * viejas sin `estado` caen al ancla.
 */
function alertSyncMessage(
  lead: PipelineCardDto | undefined,
  destino: StageDto | undefined
): string | null {
  if (!lead || lead.sourceKind !== "alert" || !destino) return null;
  const estado = typeof lead.meta?.estado === "string" ? lead.meta.estado : null;
  const target = estadoForStage({ estado: destino.estado ?? null, kind: destino.kind });
  if (!estado || estado === target) return null;
  const etiqueta = ALERT_ESTADO_LABEL[target] ?? target;
  if (target === "CONCLUIDA") {
    return "Esta tarjeta es una alerta del sistema: al soltarla acá, la alerta queda CONCLUIDA en la tabla de alertas.";
  }
  if (target === "ANULADA") {
    return "Esta tarjeta es una alerta del sistema: al soltarla acá, la alerta queda ANULADA en la tabla de alertas.";
  }
  return `Esta tarjeta es una alerta del sistema: al moverla, la alerta pasa a «${etiqueta}» en la tabla de alertas.`;
}

/** 031 — tarjetas que vienen del SISTEMA (alerta/gestión): no son tratos de venta. */
function esTarjetaSistema(lead: PipelineCardDto | undefined): boolean {
  return lead?.sourceKind === "alert" || lead?.sourceKind === "sgsa_gestion";
}

/** 030 — confirmación de los movimientos que tocan la tabla de alertas. */
function AlertSyncDialog({
  mensaje,
  onCancel,
  onConfirm,
}: {
  mensaje: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-warning-text"
            strokeWidth={1.8}
          />
          <div>
            <h3 className="font-semibold">Alerta del sistema</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">{mensaje}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Mover y sincronizar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Totales de una columna. Se calculan al pintar: un total guardado se
 * desincroniza en cuanto alguien mueve una tarjeta, y sumar unas decenas es
 * gratis. Todo en CENTAVOS enteros — el dinero jamás pasa por coma flotante.
 */
function totalesDeEtapa(leads: PipelineCardDto[], businessCurrency: string) {
  let totalCents = 0;
  let sinMonto = 0;
  let otraMoneda = 0;

  for (const l of leads) {
    if (l.amountCents === null) {
      sinMonto++;
      continue;
    }
    if (!sumable({ amountCents: l.amountCents, currency: l.currency }, businessCurrency)) {
      otraMoneda++;
      continue;
    }
    totalCents += l.amountCents;
  }
  return { totalCents, sinMonto, otraMoneda };
}

function StageColumn({
  stage,
  leads,
  board,
  currency,
  showsOwner,
  canDrag,
  onEditAmount,
  onOpen,
  onToggleDone,
}: {
  stage: StageDto;
  leads: PipelineCardDto[];
  board: PipelineBoard;
  currency: string;
  showsOwner: boolean;
  canDrag: (lead: PipelineCardDto) => boolean;
  onEditAmount: (lead: PipelineCardDto) => void;
  onOpen: (lead: PipelineCardDto) => void;
  /** 037 — tilde rápido de una tarea desde su tarjeta. */
  onToggleDone?: (lead: PipelineCardDto) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-64 shrink-0 snap-start flex-col rounded-lg border border-border-strong bg-subtle transition-[box-shadow,border-color]",
        isOver && "border-brand ring-[3px] ring-brand-soft"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight">
          {stage.kind === "won" && <Trophy className="h-3.5 w-3.5 text-primary" />}
          {stage.kind === "lost" && (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {stage.name}
        </span>
        <span className="rounded-full border border-border-strong bg-background px-2 py-0.5 font-mono text-[11px] text-text-3">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLead
            key={lead.id}
            lead={lead}
            board={board}
            currency={currency}
            showsOwner={showsOwner}
            draggable={canDrag(lead)}
            onEditAmount={onEditAmount}
            onToggleDone={onToggleDone}
            onOpen={onOpen}
          />
        ))}
      </div>
      {/* En gestiones no hay plata que sumar: el pie de montos no pinta nada
          y un "Sin montos capturados" sería ruido permanente. */}
      {board === "ventas" && <StageFooter leads={leads} currency={currency} />}
    </div>
  );
}

/** Cuánto dinero hay en esta etapa, y qué quedó fuera de la cuenta. */
function StageFooter({ leads, currency }: { leads: PipelineCardDto[]; currency: string }) {
  const { totalCents, sinMonto, otraMoneda } = totalesDeEtapa(leads, currency);
  const conMonto = leads.length - sinMonto - otraMoneda;

  return (
    <div className="border-t px-3 py-2 text-[11px]">
      {conMonto === 0 ? (
        // Un "$0.00" aquí se lee como un error del sistema, no como un dato.
        <p className="text-muted-foreground">Sin montos capturados</p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">
            Total{sinMonto > 0 ? ` · ${sinMonto} sin monto` : ""}
          </span>
          <span className="font-semibold tabular-nums">
            {formatMoneyCents(totalCents, currency)}
          </span>
        </div>
      )}
      {otraMoneda > 0 && (
        // Descartarlos en silencio haría que el total mintiera sin que nadie
        // pudiera notarlo.
        <p className="mt-0.5 text-warning-text">
          {otraMoneda} en otra moneda, fuera del total
        </p>
      )}
    </div>
  );
}

function DraggableLead({
  lead,
  board,
  currency,
  showsOwner,
  draggable,
  onEditAmount,
  onOpen,
  onToggleDone,
}: {
  lead: PipelineCardDto;
  board: PipelineBoard;
  currency: string;
  showsOwner: boolean;
  draggable: boolean;
  onEditAmount: (lead: PipelineCardDto) => void;
  onOpen: (lead: PipelineCardDto) => void;
  onToggleDone?: (lead: PipelineCardDto) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Abrir y arrastrar conviven porque el sensor solo activa el arrastre a
      // los 6 px de movimiento: un clic quieto nunca llega a ser un arrastre.
      // Los controles de dentro de la tarjeta cortan la propagación, para que
      // tocar "+ monto" no abra además el cajón.
      onClick={() => onOpen(lead)}
      // dnd-kit ya deja el nodo con `role="button"` y `tabIndex`, pero un div
      // no dispara `click` con el teclado: sin esto, el cajón sería alcanzable
      // solo con el ratón.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={`Abrir la tarjeta de ${tituloDeTarjeta(lead)}`}
      className={cn(isDragging && "opacity-40", !draggable && "cursor-default")}
    >
      <LeadCard
        lead={lead}
        board={board}
        currency={currency}
        showsOwner={showsOwner}
        onEditAmount={draggable ? onEditAmount : undefined}
        onToggleDone={draggable ? onToggleDone : undefined}
      />
    </div>
  );
}

/** Título visible de una tarjeta: contacto > rótulo > genérico. */
function tituloDeTarjeta(lead: PipelineCardDto): string {
  return lead.contact?.name ?? lead.label ?? "Tarjeta";
}

/** URL externa para abrir la fuente de la tarjeta (registro/cliente/gestión). */
function urlExterna(lead: PipelineCardDto): string | null {
  if (lead.sourceKind === "alert") {
    const link = typeof lead.meta?.linkRegistro === "string" ? lead.meta.linkRegistro : "";
    const cliente =
      typeof lead.meta?.clienteRecordId === "string" ? lead.meta.clienteRecordId : "";
    if (!link && !cliente) return null;
    return alertRecordInterfaceUrl(link || null, cliente || null);
  }
  if (lead.sourceKind === "sgsa_client" && lead.sgsaRef) {
    return sgsaClientInterfaceUrl(lead.sgsaRef);
  }
  // 030 — la gestión del sistema trae su URL de interface ya armada.
  if (lead.sourceKind === "sgsa_gestion") {
    return typeof lead.meta?.registroUrl === "string" && lead.meta.registroUrl
      ? lead.meta.registroUrl
      : null;
  }
  return null;
}

/** Segunda línea de la tarjeta, según de dónde venga. */
function subtituloDeTarjeta(lead: PipelineCardDto): string {
  if (lead.sourceKind === "sgsa_client") return "Cliente del sistema";
  if (lead.sourceKind === "sgsa_gestion") {
    const cliente =
      typeof lead.meta?.clienteNombre === "string" ? lead.meta.clienteNombre : "";
    const motivo = typeof lead.meta?.motivo === "string" ? lead.meta.motivo : "";
    const cola = [cliente, motivo].filter(Boolean).join(" · ");
    return cola ? `Gestión · ${cola}` : "Gestión del sistema";
  }
  if (lead.sourceKind === "alert") {
    const tipo = typeof lead.meta?.tipo === "string" ? lead.meta.tipo : "";
    // 031 — el chip muestra la prioridad TAL CUAL la del sistema («🔴 Alta»…).
    const prioridad =
      typeof lead.meta?.prioridad === "string" && lead.meta.prioridad
        ? lead.meta.prioridad
        : typeof lead.meta?.urgencia === "string"
          ? lead.meta.urgencia
          : "";
    const cola = [tipo, prioridad].filter(Boolean).join(" · ");
    return cola ? `Alerta · ${cola}` : "Alerta";
  }
  return lead.lastActivityAt
    ? `Actividad: ${formatTime(lead.lastActivityAt)}`
    : "Sin actividad";
}

function LeadCard({
  lead,
  board,
  currency,
  overlay = false,
  showsOwner = false,
  onEditAmount,
  onToggleDone,
}: {
  lead: PipelineCardDto;
  board: PipelineBoard;
  currency: string;
  overlay?: boolean;
  showsOwner?: boolean;
  onEditAmount?: (lead: PipelineCardDto) => void;
  onToggleDone?: (lead: PipelineCardDto) => void;
}) {
  const externa = urlExterna(lead);
  const sinContacto = !lead.contact;
  /** 037 — la tarjeta de una TAREA: título propio, vencimiento y tilde. */
  const esTarea = board === "tareas";
  const titulo = esTarea ? lead.label ?? tituloDeTarjeta(lead) : tituloDeTarjeta(lead);
  /** 030 — estado de la alerta en el sistema (la tarjeta va macheada). */
  const estadoAlerta =
    lead.sourceKind === "alert" && typeof lead.meta?.estado === "string"
      ? lead.meta.estado
      : null;
  return (
    <div
      className={cn(
        "cursor-grab rounded-md border border-border-strong bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        overlay && "rotate-2 shadow-pop"
      )}
    >
      <div className="flex items-center gap-2.5">
        <ContactAvatar
          name={esTarea ? lead.ownerName ?? titulo : tituloDeTarjeta(lead)}
          seed={esTarea ? lead.ownerUserId ?? lead.id : lead.contact?.id ?? lead.id}
          size="sm"
          src={esTarea ? lead.ownerAvatarUrl ?? null : lead.contact?.avatarUrl ?? null}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                lead.completedAt && "text-muted-foreground line-through"
              )}
            >
              {titulo}
            </p>
            {lead.priority && <PriorityBadge value={lead.priority} />}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {esTarea
              ? lead.contact
                ? `Contacto: ${lead.contact.name}`
                : "Tarea"
              : subtituloDeTarjeta(lead)}
          </p>
          {esTarea && lead.dueAt && (
            <TaskDueChip dueAt={lead.dueAt} completedAt={lead.completedAt} className="mt-0.5" />
          )}
          {estadoAlerta && (
            <span
              title="Estado de la alerta en el sistema"
              className={cn(
                "mt-0.5 inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold",
                estadoAlerta === "CONCLUIDA"
                  ? "border-success-soft bg-success-tint text-success-text"
                  : estadoAlerta === "ANULADA"
                    ? "border-border-strong bg-subtle text-text-3"
                    : estadoAlerta === "TURNO_CONFIRMADO"
                      ? "border-warning-soft bg-warning-tint text-warning-text"
                      : "border-border-strong bg-subtle text-text-2"
              )}
            >
              {ALERT_ESTADO_LABEL[estadoAlerta] ?? estadoAlerta}
            </span>
          )}
        </div>
        {esTarea && onToggleDone && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone(lead);
            }}
            aria-label={lead.completedAt ? "Reabrir la tarea" : "Marcar la tarea como terminada"}
            title={lead.completedAt ? "Reabrir" : "Marcar terminada"}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {lead.completedAt ? (
              <CheckCircle2 className="h-4 w-4 text-success-text" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </button>
        )}
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact?.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Abrir conversación"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
        {externa && (
          <a
            href={externa}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label={lead.sourceKind === "alert" || lead.sourceKind === "sgsa_gestion" ? "Abrir registro" : "Abrir cliente"}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      {showsOwner && lead.ownerName && (
        <p className="mt-1 truncate text-[10.5px] text-text-3" title={lead.ownerName}>
          {lead.ownerName}
        </p>
      )}
      {!overlay && board === "ventas" && onEditAmount && (
        <button
          // `stopPropagation` en pointerdown: sin esto, tocar el monto empieza
          // un arrastre y el diálogo nunca abre.
          onPointerDown={(e) => e.stopPropagation()}
          // También en `click`: sin esto, tocar el monto abriría además el
          // cajón, porque el evento sigue subiendo hasta la tarjeta.
          onClick={(e) => {
            e.stopPropagation();
            onEditAmount(lead);
          }}
          className={cn(
            "mt-1.5 w-full rounded px-1 py-0.5 text-right text-xs tabular-nums hover:bg-accent",
            lead.amountCents === null
              ? "text-text-3"
              : "font-semibold text-foreground"
          )}
        >
          {lead.amountCents === null
            ? "+ monto"
            : formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
        </button>
      )}
      {overlay && board === "ventas" && lead.amountCents !== null && (
        <p className="mt-1.5 text-right text-xs font-semibold tabular-nums">
          {formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
        </p>
      )}
      {sinContacto && !externa && null}
    </div>
  );
}
