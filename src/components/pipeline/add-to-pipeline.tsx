"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { PipelineBoard } from "@/lib/types";
import { PIPELINE_BOARDS } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

type Source =
  | { kind: "contact"; contactId: string }
  | {
      kind: "sgsa_client";
      ref: string;
      label: string;
      meta?: Record<string, unknown>;
    }
  | {
      kind: "alert";
      ref: string;
      label: string;
      meta?: Record<string, unknown>;
    };

/**
 * 029 — «＋ Flujo»: suma ESTA fuente al flujo PERSONAL del usuario.
 *
 * Se elige tablero (Ventas o Gestiones) — salvo las alertas, que solo entran
 * al de gestiones. Con `fixedBoard` no hay menú: el contexto ya dijo a cuál.
 * El API es idempotente: si ya está, contesta «ya estaba» en vez de duplicar,
 * así que el botón se puede tocar sin miedo.
 */
export function AddToPipelineButton({
  source,
  size = "sm",
  fixedBoard,
  texto,
  className,
}: {
  source: Source;
  size?: "sm" | "icon";
  /** Sin menú: suma directo a este tablero. */
  fixedBoard?: PipelineBoard;
  texto?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<
    { tipo: "ok" | "info" | "error"; texto: string } | null
  >(null);
  const [guardando, setGuardando] = useState(false);

  async function sumar(board: PipelineBoard) {
    setAbierto(false);
    setGuardando(true);
    setEstado(null);
    try {
      const res = await fetch("/api/pipeline/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          board,
          kind: source.kind,
          contactId: source.kind === "contact" ? source.contactId : undefined,
          ref: source.kind !== "contact" ? source.ref : undefined,
          label: source.kind !== "contact" ? source.label : undefined,
          meta: source.kind !== "contact" ? source.meta : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        created?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setEstado({
          tipo: "error",
          texto: data?.error?.message ?? "No se pudo sumar al flujo",
        });
        return;
      }
      const destino = board === "ventas" ? "ventas" : "gestiones";
      setEstado(
        data?.created
          ? { tipo: "ok", texto: `Sumada a tu flujo de ${destino} ✓` }
          : { tipo: "info", texto: `Ya estaba en tu flujo de ${destino}` }
      );
    } catch {
      setEstado({ tipo: "error", texto: "No se pudo sumar al flujo" });
    } finally {
      setGuardando(false);
    }
  }

  // Las alertas son cosas para GESTIONAR: no eligen tablero.
  if (source.kind === "alert") {
    return (
      <span className={cn("relative inline-flex flex-col items-start gap-0.5", className)}>
        <button
          type="button"
          onClick={() => void sumar("gestiones")}
          disabled={guardando}
          aria-label="Sumar la alerta a mi flujo de gestiones"
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-background px-2 py-1 text-[12px] font-medium hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {texto ?? "A mi flujo"}
        </button>
        {estado && (
          <span
            className={cn(
              "text-[10.5px]",
              estado.tipo === "error" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {estado.texto}
          </span>
        )}
      </span>
    );
  }

  // Contexto que ya sabe el tablero: un botón directo, sin menú.
  if (fixedBoard) {
    return (
      <span className={cn("relative inline-flex flex-col items-start gap-0.5", className)}>
        <button
          type="button"
          onClick={() => void sumar(fixedBoard)}
          disabled={guardando}
          aria-label={`Sumar a mi flujo de ${fixedBoard}`}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border border-border-strong bg-background font-medium hover:bg-accent disabled:opacity-50",
            size === "icon" ? "h-7 w-7" : "px-2 py-1 text-[12px]"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {size !== "icon" && (texto ?? "Sumar")}
        </button>
        {estado && (
          <span
            className={cn(
              "text-[10.5px]",
              estado.tipo === "error" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {estado.texto}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={guardando}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Sumar a mi flujo"
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-md border border-border-strong bg-background font-medium hover:bg-accent disabled:opacity-50",
          size === "icon" ? "h-8 w-8" : "px-2 py-1 text-[12px]"
        )}
        title="Sumar a mi flujo"
      >
        <Plus className="h-3.5 w-3.5" />
        {size !== "icon" && "Flujo"}
      </button>
      {abierto && (
        <>
          {/* Fuera del menú cierra: lo que uno intenta primero. */}
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <span
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-card p-1 shadow-pop"
          >
            {/* 037 — acá se suman CONTACTOS: el tablero de tareas no entra
                (las tareas se crean desde su pestaña o desde una ficha). */}
            {PIPELINE_BOARDS.filter((b) => b.value !== "tareas").map((b) => (
              <button
                key={b.value}
                type="button"
                role="menuitem"
                onClick={() => void sumar(b.value)}
                className="block w-full rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
              >
                Flujo de {b.label.toLowerCase()}
              </button>
            ))}
          </span>
        </>
      )}
      {estado && (
        <span
          className={cn(
            "absolute left-1/2 top-full z-50 mt-1 w-max -translate-x-1/2 rounded border bg-card px-2 py-0.5 text-[10.5px] shadow-sm",
            estado.tipo === "error" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {estado.texto}
        </span>
      )}
    </span>
  );
}
