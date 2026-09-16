"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import type { PriorityValue } from "@/lib/types";
import { taskDueLabel, taskDueState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TaskDialog, type TaskOrigin } from "./task-dialog";

/** La forma liviana de una tarea en el checklist de una entidad. */
export type EntidadTarea = {
  id: string;
  label: string | null;
  notes: string | null;
  dueAt: string | null;
  completedAt: string | null;
  priority: PriorityValue | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

/**
 * 037 — el checklist de UNA entidad (contacto, alerta, siniestro): sus tareas
 * con vencimiento y estado, y el botón para sumar una nueva ahí mismo.
 */
export function EntityTasks({ origin, title }: { origin: TaskOrigin; title: string }) {
  const [tareas, setTareas] = useState<EntidadTarea[] | null>(null);
  const [dialogo, setDialogo] = useState<{ task?: EntidadTarea } | null>(null);

  const refetch = useCallback(async () => {
    const qs = new URLSearchParams({ originKind: origin.kind, ref: origin.ref });
    const res = await fetch(`/api/pipeline/tasks?${qs}`).catch(() => null);
    if (!res?.ok) {
      setTareas([]);
      return;
    }
    const data = (await res.json()) as { tasks?: EntidadTarea[] };
    setTareas(data.tasks ?? []);
  }, [origin.kind, origin.ref]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <p className="kicker">{title}</p>
        <Button variant="outline" size="sm" onClick={() => setDialogo({})}>
          <Plus className="h-3.5 w-3.5" /> Nueva tarea
        </Button>
      </div>

      {tareas === null && <p className="mt-2 text-xs text-text-3">Cargando…</p>}
      {tareas !== null && tareas.length === 0 && (
        <p className="mt-2 text-xs text-text-3">
          Sin tareas todavía — creá la primera con «Nueva tarea».
        </p>
      )}
      <ul className="mt-2 space-y-1.5">
        {(tareas ?? []).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setDialogo({ task: t })}
              className="flex w-full items-center gap-2 rounded-md border border-border-strong bg-background px-2 py-1.5 text-left hover:bg-accent"
            >
              {t.completedAt ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-text" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-text-3" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[12.5px]",
                  t.completedAt && "text-text-3 line-through"
                )}
              >
                {t.label ?? "Tarea"}
              </span>
              {t.dueAt && (
                <TaskDueChip dueAt={t.dueAt} completedAt={t.completedAt} />
              )}
            </button>
          </li>
        ))}
      </ul>

      {dialogo && (
        <TaskDialog
          task={dialogo.task ?? null}
          origin={dialogo.task ? undefined : origin}
          onClose={() => setDialogo(null)}
          onSaved={() => {
            setDialogo(null);
            void refetch();
          }}
        />
      )}
    </section>
  );
}

/** 037 — el chip de vencimiento compartido (tarjeta, cajón y checklist). */
export function TaskDueChip({
  dueAt,
  completedAt,
  className,
}: {
  dueAt: string | null;
  completedAt: string | null;
  className?: string;
}) {
  const estado = taskDueState(dueAt, completedAt, new Date());
  if (estado === "none" || !dueAt) return null;
  return (
    <span
      title={estado === "overdue" ? "Vencida" : "Vencimiento"}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums",
        chipEstado(estado),
        className
      )}
    >
      {taskDueLabel(dueAt)}
    </span>
  );
}

function chipEstado(estado: ReturnType<typeof taskDueState>): string {
  switch (estado) {
    case "overdue":
      return "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
    case "today":
    case "soon":
      return "border-warning-soft bg-warning-tint text-warning-text";
    case "done":
      return "border-success-soft bg-success-tint text-success-text";
    default:
      return "border-border-strong bg-subtle text-text-3";
  }
}
