"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 037b — «Pedir tarea»: el cajón de escritura del gerente/dueño/propietario
 * para pedirle una tarea a un empleado. El pedido viaja como tarjeta al chat
 * interno (mismo circuito que las alertas y los contactos compartidos) y
 * recién cuando el empleado la ACEPTA se suma sola a su tablero de Tareas.
 */

type StaffOption = {
  userId: string;
  name: string;
  role?: string;
  avatarUrl?: string | null;
};

export function TaskRequestDialog({
  lockedAssignee,
  onClose,
  onSent,
}: {
  /** Cuando el pedido nace de un DM: el destinatario viene fijo. */
  lockedAssignee?: { userId: string; name: string } | null;
  onClose: () => void;
  onSent: (roomId: string) => void;
}) {
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [toUserId, setToUserId] = useState(lockedAssignee?.userId ?? "");
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [prioridad, setPrioridad] = useState<"" | "alta" | "media" | "baja">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lockedAssignee) return;
    let vivo = true;
    void (async () => {
      const res = await fetch("/api/internal/staff").catch(() => null);
      const data = res?.ok
        ? ((await res.json()) as { staff?: StaffOption[] })
        : null;
      if (vivo) setStaff(data?.staff ?? []);
    })();
    return () => {
      vivo = false;
    };
  }, [lockedAssignee]);

  async function enviar() {
    const title = titulo.trim();
    if (!title || !toUserId || enviando) {
      if (!title) setError("Poné un título para la tarea.");
      else if (!toUserId) setError("Elegí al empleado.");
      return;
    }
    setEnviando(true);
    setError(null);
    const dueAt = fecha
      ? new Date(`${fecha}T${hora || "09:00"}:00`).toISOString()
      : null;
    const res = await fetch("/api/task-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toUserId,
        title,
        notes: nota.trim() || undefined,
        dueAt,
        priority: prioridad || undefined,
      }),
    }).catch(() => null);
    setEnviando(false);
    if (!res || !res.ok) {
      const data = res
        ? ((await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null)
        : null;
      setError(data?.error?.message ?? "No se pudo enviar el pedido.");
      return;
    }
    const data = (await res.json()) as { roomId?: string };
    onSent(data.roomId ?? "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[460px] rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-[14px] font-bold">Pedir una tarea</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-text-3 hover:bg-subtle"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          {!lockedAssignee && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">
                Empleado
              </span>
              <select
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
              >
                <option value="">Elegí a quién…</option>
                {(staff ?? []).map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                  </option>
                ))}
              </select>
              {staff === null && (
                <span className="mt-1 block text-[11px] text-text-3">
                  Cargando equipo…
                </span>
              )}
            </label>
          )}
          {lockedAssignee && (
            <p className="text-[12.5px] text-text-2">
              Para <b>{lockedAssignee.name}</b> — le llega como tarjeta a este chat.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-text-2">
              Tarea
            </span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej.: Llamar al cliente y confirmar la póliza"
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-text-3 focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-text-2">
              Nota (opcional)
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Detalles, teléfono, links…"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-text-3 focus:border-brand"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">
                Vence (fecha)
              </span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">
                Hora
              </span>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-text-2">
              Prioridad
            </span>
            <select
              value={prioridad}
              onChange={(e) =>
                setPrioridad(e.target.value as "" | "alta" | "media" | "baja")
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              <option value="">Normal</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </label>
          <p className="rounded-md border bg-subtle px-3 py-2 text-[11.5px] text-text-2">
            Le llega como tarjeta a su chat interno. Cuando la <b>acepta</b>, se suma
            sola a su tablero de Tareas; si la rechaza, te queda el motivo.
          </p>
          {error && (
            <p className="text-[12px] font-semibold text-red-600">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-subtle"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-fg hover:opacity-90",
              enviando && "opacity-60"
            )}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
