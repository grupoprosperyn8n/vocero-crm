"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskContactRef } from "@/lib/types";

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
  /* 044b-B10 — contactos del pedido (CRM o del sistema), uno o varios. */
  const [contactos, setContactos] = useState<TaskContactRef[]>([]);
  const [buscaC, setBuscaC] = useState("");
  const [fuenteC, setFuenteC] = useState<"crm" | "sgsa">("crm");
  const [resC, setResC] = useState<TaskContactRef[]>([]);
  const [buscandoC, setBuscandoC] = useState(false);

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

  /* 044b-B10 — buscar contactos (CRM) o clientes (sistema) para el pedido. */
  useEffect(() => {
    const term = buscaC.trim();
    if (term.length < 2) {
      setResC([]);
      setBuscandoC(false);
      return;
    }
    const t = setTimeout(async () => {
      setBuscandoC(true);
      const url =
        fuenteC === "crm"
          ? `/api/contacts?q=${encodeURIComponent(term)}`
          : `/api/clients/search?q=${encodeURIComponent(term)}`;
      const res = await fetch(url).catch(() => null);
      const data = res?.ok
        ? await res.json().catch(() => null)
        : null;
      setBuscandoC(false);
      if (fuenteC === "crm") {
        const rows =
          (
            data as {
              contacts?: Array<{
                id: string;
                name: string;
                phone?: string | null;
              }>;
            } | null
          )?.contacts ?? [];
        setResC(
          rows
            .slice(0, 6)
            .map((r) => ({
              kind: "contact" as const,
              id: r.id,
              label: r.phone ? `${r.name} · ${r.phone}` : r.name,
            }))
        );
      } else {
        const rows =
          (
            data as {
              results?: Array<{
                client?: {
                  recordId?: string;
                  nombre?: string;
                  apellido?: string;
                  dni?: string | null;
                };
              }>;
            } | null
          )?.results ?? [];
        setResC(
          rows
            .map((r) => {
              const c = r.client;
              if (!c?.recordId) return null;
              const base =
                [c.nombre, c.apellido].filter(Boolean).join(" ").trim() ||
                c.recordId;
              return {
                kind: "sgsa_client" as const,
                id: c.recordId,
                label: c.dni ? `${base} · DNI ${c.dni}` : base,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .slice(0, 6)
        );
      }
    }, 400);
    return () => clearTimeout(t);
  }, [buscaC, fuenteC]);

  function agregarContacto(c: TaskContactRef) {
    setContactos((prev) =>
      prev.some((x) => x.kind === c.kind && x.id === c.id)
        ? prev
        : [...prev, c].slice(0, 12)
    );
    setBuscaC("");
    setResC([]);
  }

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
        contacts: contactos.length > 0 ? contactos : undefined,
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
          {/* 044b-B10 — contactos del pedido: uno o varios, del CRM o del sistema. */}
          <div className="rounded-md border bg-subtle/40 p-2.5">
            <span className="mb-1 block text-[12px] font-semibold text-text-2">
              Contactos del pedido (opcional)
            </span>
            {contactos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {contactos.map((c) => (
                  <span
                    key={`${c.kind}:${c.id}`}
                    className="flex items-center gap-1 rounded-full border bg-card px-2 py-[3px] text-[11.5px] font-medium text-text-2"
                  >
                    {c.kind === "sgsa_client" ? "👤" : "📇"} {c.label}
                    <button
                      type="button"
                      onClick={() =>
                        setContactos((prev) =>
                          prev.filter(
                            (x) => !(x.kind === c.kind && x.id === c.id)
                          )
                        )
                      }
                      className="rounded-full p-[2px] hover:bg-subtle"
                      aria-label={`Quitar ${c.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFuenteC("crm")}
                className={cn(
                  "rounded-full border px-2 py-[3px] text-[11px] font-semibold",
                  fuenteC === "crm"
                    ? "border-brand bg-brand text-white"
                    : "bg-card text-text-2 hover:bg-subtle"
                )}
              >
                📇 Del CRM
              </button>
              <button
                type="button"
                onClick={() => setFuenteC("sgsa")}
                className={cn(
                  "rounded-full border px-2 py-[3px] text-[11px] font-semibold",
                  fuenteC === "sgsa"
                    ? "border-brand bg-brand text-white"
                    : "bg-card text-text-2 hover:bg-subtle"
                )}
              >
                👤 Del sistema
              </button>
              <input
                value={buscaC}
                onChange={(e) => setBuscaC(e.target.value)}
                placeholder={
                  fuenteC === "crm"
                    ? "Buscar contacto del CRM…"
                    : "Buscar cliente del sistema…"
                }
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-[12.5px] outline-none placeholder:text-text-3 focus:border-brand"
              />
            </div>
            {buscandoC && (
              <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-text-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
              </p>
            )}
            {!buscandoC && resC.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {resC.map((r) => (
                  <button
                    key={`${r.kind}:${r.id}`}
                    type="button"
                    onClick={() => agregarContacto(r)}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-[12px] font-medium text-text-1 hover:bg-subtle"
                  >
                    <span className="min-w-0 truncate">{r.label}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-brand">
                      + Agregar
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-text-3">
              El empleado los ve en la tarjeta del pedido y quedan en la tarea
              al aceptarla.
            </p>
          </div>
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
