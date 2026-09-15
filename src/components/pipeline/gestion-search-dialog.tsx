"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Search } from "lucide-react";
import type { SgsaGestionDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 030 — buscador de GESTIONES del sistema para sumarlas al pipeline:
 * «traer gestiones puntuales del backoffice con un buscador».
 *
 * Solo lectura contra el sistema; lo que se suma es una tarjeta PERSONAL del
 * tablero de gestiones (idempotente: si ya estaba, lo avisa).
 */
export function GestionSearchDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  /** Se llama tras sumar (para refrescar el tablero de fondo). */
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SgsaGestionDto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Contador de pedidos: una respuesta vieja jamás pisa a la nueva. */
  const seq = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    timer.current = setTimeout(() => {
      const mySeq = ++seq.current;
      void fetch(`/api/clients/gestiones?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { results?: SgsaGestionDto[] } | null) => {
          if (mySeq !== seq.current) return;
          setResults(d?.results ?? []);
        })
        .catch(() => {
          if (mySeq === seq.current) setResults([]);
        })
        .finally(() => {
          if (mySeq === seq.current) setBuscando(false);
        });
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  async function sumar(g: SgsaGestionDto) {
    setAgregando(g.recordId);
    setAviso(null);
    try {
      const res = await fetch("/api/pipeline/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          board: "gestiones",
          kind: "sgsa_gestion",
          ref: g.recordId,
          label: g.idUnico ?? g.motivo ?? "Gestión",
          meta: {
            clienteNombre: g.clienteNombre ?? undefined,
            clienteRecordId: g.clienteRecordId ?? undefined,
            motivo: g.motivo ?? undefined,
            tipoAtencion: g.tipoAtencion ?? undefined,
            fecha: g.fecha ?? undefined,
            poliza: g.poliza ?? undefined,
            registroUrl: g.registroUrl,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        created?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setAviso({
          tipo: "error",
          texto: data?.error?.message ?? "No se pudo sumar la gestión",
        });
        return;
      }
      setAviso({
        tipo: "ok",
        texto: data?.created
          ? "Sumada a tu pipeline de gestiones ✓"
          : "Ya estaba en tu pipeline de gestiones",
      });
      onAdded();
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo sumar la gestión" });
    } finally {
      setAgregando(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold">Sumar una gestión del sistema</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Buscá por n° de gestión, cliente, DNI, teléfono, póliza, patente o
          motivo. Se suma a TU pipeline de gestiones.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej.: 14954, 025CAM, CABALLERO, AB123CD…"
              className="pl-8"
            />
          </div>
          {buscando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {aviso && (
          <p
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-[12.5px]",
              aviso.tipo === "ok"
                ? "border-success-soft bg-success-tint text-success-text"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {aviso.texto}
          </p>
        )}

        <div className="mt-3 divide-y rounded-md border border-border-strong">
          {results.length === 0 && !buscando && q.trim().length >= 2 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              Sin resultados para «{q.trim()}».
            </p>
          )}
          {q.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              Escribí al menos 2 caracteres.
            </p>
          )}
          {results.map((g) => (
            <div key={g.recordId} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">
                  {g.clienteNombre ?? "Sin cliente"}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[g.idUnico, g.motivo, g.fecha?.slice(0, 10)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="truncate text-[11.5px] text-text-3">
                  {[
                    g.dni ? `DNI ${g.dni}` : null,
                    g.telefono,
                    g.poliza ? `Póliza ${g.poliza}` : null,
                    g.patente,
                    g.marcaModelo,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <a
                href={g.registroUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Abrir en el sistema"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <Button
                size="sm"
                variant="outline"
                disabled={agregando === g.recordId}
                onClick={() => void sumar(g)}
              >
                <Plus className="h-3.5 w-3.5" />
                {agregando === g.recordId ? "Sumando…" : "Pipeline"}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
