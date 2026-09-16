"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import type { PriorityValue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 037 — de dónde cuelga una tarea: el checklist de una entidad. */
export type TaskOrigin = {
  kind: "contact" | "alert" | "review" | "client" | "gestion";
  ref: string;
  label?: string;
};

/**
 * 037 — lo mínimo que el diálogo necesita para editar una tarea existente.
 * `PipelineCardDto` lo cumple de sobra; el checklist de una entidad manda su
 * propia forma liviana.
 */
export type TaskEditable = {
  id: string;
  label: string | null;
  notes?: string | null;
  priority: PriorityValue | null;
  dueAt: string | null;
};

/**
 * 037 — el cajón de escritura de una tarea: título, nota, vencimiento con
 * fecha y HORA, y prioridad. La fecha de creación la pone el sistema; el
 * cierre llega solo al entrar a «Terminadas».
 */
export function TaskDialog({
  task,
  origin,
  onClose,
  onSaved,
}: {
  /** Presente = edición de esa tarea. */
  task?: TaskEditable | null;
  /** Presente = la tarea nace vinculada a esta entidad (contacto/alerta/…). */
  origin?: TaskOrigin | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = Boolean(task);
  const [titulo, setTitulo] = useState(task?.label ?? "");
  const [nota, setNota] = useState(task?.notes ?? "");
  const inicial = partirFecha(task?.dueAt ?? null);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [prioridad, setPrioridad] = useState<PriorityValue | "">(
    task?.priority ?? ""
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tituloLimpio = titulo.trim();
  const puedeGuardar = tituloLimpio.length > 0 && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const dueAt = juntarFecha(fecha, hora);
    const res =
      editando && task
        ? await fetch(`/api/pipeline/leads/${task.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              label: tituloLimpio,
              notes: nota.trim() ? nota.trim() : null,
              dueAt,
              priority: prioridad === "" ? null : prioridad,
            }),
          }).catch(() => null)
        : await fetch("/api/pipeline/cards", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              board: "tareas",
              kind: "task",
              label: tituloLimpio,
              notes: nota.trim() ? nota.trim() : undefined,
              dueAt,
              priority: prioridad === "" ? undefined : prioridad,
              contactId: origin?.kind === "contact" ? origin.ref : undefined,
              meta:
                origin && origin.kind !== "contact"
                  ? {
                      originKind: origin.kind,
                      originRef: origin.ref,
                      originLabel: origin.label ?? null,
                    }
                  : undefined,
            }),
          }).catch(() => null);
    setGuardando(false);
    if (!res || !res.ok) {
      const data = res
        ? ((await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null)
        : null;
      setError(data?.error?.message ?? "No se pudo guardar la tarea.");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{editando ? "Editar tarea" : "Nueva tarea"}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
        {origin && !editando && origin.label && (
          <p className="mt-1 text-xs text-text-3">Vinculada a: {origin.label}</p>
        )}

        <label className="mt-4 block text-[12px] font-medium" htmlFor="tarea-titulo">
          Título
        </label>
        <Input
          id="tarea-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={200}
          placeholder="Ej.: Llamar para confirmar turno"
          className="mt-1 h-9 text-sm"
          autoFocus
        />

        <label className="mt-3 block text-[12px] font-medium" htmlFor="tarea-nota">
          Nota
        </label>
        <textarea
          id="tarea-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Detalle, teléfono, lo que haga falta…"
          className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] font-medium" htmlFor="tarea-fecha">
              Vence (fecha)
            </label>
            <Input
              id="tarea-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium" htmlFor="tarea-hora">
              Horario
            </label>
            <Input
              id="tarea-hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-text-3">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {fecha
            ? "La tarjeta avisa cuando vence (rojo si pasó sin terminar)."
            : "Sin fecha queda como tarea abierta, sin aviso de vencimiento."}
        </p>

        <label className="mt-3 block text-[12px] font-medium" htmlFor="tarea-prioridad">
          Prioridad
        </label>
        <select
          id="tarea-prioridad"
          value={prioridad}
          onChange={(e) => setPrioridad(e.target.value as PriorityValue | "")}
          className="mt-1 h-9 w-full rounded-md border border-border-strong bg-background px-2 text-[13px]"
        >
          <option value="">Sin prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!puedeGuardar} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear tarea"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** ISO → {fecha: "YYYY-MM-DD", hora: "HH:MM"} en la hora local del navegador. */
function partirFecha(iso: string | null): { fecha: string; hora: string } {
  if (!iso) return { fecha: "", hora: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: "", hora: "" };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/** fecha + hora locales → ISO (o null si no hay fecha). */
function juntarFecha(fecha: string, hora: string): string | null {
  if (!fecha) return null;
  const d = new Date(`${fecha}T${hora || "09:00"}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
