"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, MessageSquareText, X } from "lucide-react";
import type {
  FichaDto,
  FichaValue,
  PipelineBoard,
  PipelineCardDto,
  PriorityValue,
  StageDto,
} from "@/lib/types";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { ALERT_ESTADO_LABEL } from "@/lib/alerts";
import { alertRecordInterfaceUrl, sgsaClientInterfaceUrl } from "@/lib/sgsa-links";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { FichaPanel } from "@/components/ficha-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityPicker } from "./priority-picker";

/**
 * La tarjeta, abierta, sin salir del tablero.
 *
 * Antes el clic en una tarjeta no hacía nada: para ver de quién era había que
 * irse a la bandeja y volver, y revisando una columna de quince eso son treinta
 * viajes. El cajón contesta la pregunta "¿quién es y cómo va?" en el sitio
 * donde uno la hace.
 *
 * 029 — la tarjeta puede ser un contacto del CRM, un cliente del sistema o una
 * alerta: cada origen trae su bloque. Las ajenas se abren en modo lectura
 * (ver el tablero del equipo no es tocarlo).
 */
export function LeadDrawer({
  lead,
  board,
  stages,
  currency,
  readOnly = false,
  onClose,
  onMoveStage,
  onAmount,
  onPriority,
  onRemove,
}: {
  lead: PipelineCardDto;
  board: PipelineBoard;
  stages: StageDto[];
  /** Moneda del negocio, para la tarjeta que aún no tiene la suya. */
  currency: string;
  /** Tarjeta de otro: se consulta, no se edita. */
  readOnly?: boolean;
  onClose: () => void;
  /** Pasa por el mismo camino que el arrastre: perder exige motivo. */
  onMoveStage: (stageId: string) => void;
  onAmount: (cents: number | null) => void;
  onPriority: (value: PriorityValue | null) => void;
  /** Sacar la tarjeta de MI pipeline (029). */
  onRemove: () => void;
}) {
  const [ficha, setFicha] = useState<FichaDto>({});
  const [monto, setMonto] = useState("");
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [confirmandoSacar, setConfirmandoSacar] = useState(false);

  const titulo = lead.contact?.name ?? lead.label ?? "Tarjeta";
  const contactId = lead.contact?.id ?? null;
  const moneda = lead.currency ?? currency;
  const esGestion = board === "gestiones";

  const cargarFicha = useCallback(async () => {
    if (!contactId) return;
    const detail = await fetch(`/api/contacts/${contactId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setFicha(detail?.contact?.ficha ?? {});
  }, [contactId]);

  useEffect(() => {
    setEditandoMonto(false);
    setConfirmandoSacar(false);
    setMonto(lead.amountCents === null ? "" : (lead.amountCents / 100).toFixed(2));
    void cargarFicha();
  }, [cargarFicha, lead.amountCents, lead.id]);

  // Escape cierra: un cajón que solo se cierra con el ratón estorba a quien
  // revisa el tablero con el teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function guardarFicha(patch: Record<string, FichaValue | null>) {
    if (!contactId) return;
    setFicha((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return next;
    });
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ficha: patch }),
    }).catch(() => null);
    void cargarFicha();
  }

  const montoParseado = monto.trim() ? parseMoneyToCents(monto) : null;
  const montoInvalido = monto.trim().length > 0 && montoParseado === null;

  // Enlaces externos de la fuente (029).
  const linkRegistro =
    typeof lead.meta?.linkRegistro === "string" ? lead.meta.linkRegistro : "";
  const clienteRecordId =
    typeof lead.meta?.clienteRecordId === "string" ? lead.meta.clienteRecordId : "";
  const clienteNombre =
    typeof lead.meta?.clienteNombre === "string" ? lead.meta.clienteNombre : "";
  const alertaTipo = typeof lead.meta?.tipo === "string" ? lead.meta.tipo : "";
  const alertaUrgencia =
    typeof lead.meta?.urgencia === "string" ? lead.meta.urgencia : "";
  /**
   * 030 — una gestión del sistema ya trae su URL de interface hecha (busca su
   * registro en GESTIÓN GENERAL); alertas y clientes la arman con el helper.
   */
  const registroUrl =
    lead.sourceKind === "sgsa_gestion" &&
    typeof lead.meta?.registroUrl === "string"
      ? lead.meta.registroUrl
      : alertRecordInterfaceUrl(linkRegistro || null, clienteRecordId || null);

  return (
    <>
      {/* Velo: cerrar tocando fuera es lo que uno intenta primero. */}
      <button
        aria-label="Cerrar la tarjeta"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${esGestion ? "Gestión" : "Trato"} de ${titulo}`}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] flex-col border-l bg-background shadow-pop"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="kicker text-text-2">{esGestion ? "Gestión" : "Trato"}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar el panel"
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Quién / de dónde viene */}
          <section className="border-b p-4">
            <div className="flex items-center gap-3">
              <ContactAvatar name={titulo} seed={lead.contact?.id ?? lead.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-[650]">{titulo}</p>
                <p className="text-xs text-text-3">
                  {lead.contact
                    ? formatPhone(lead.contact.phone)
                    : lead.sourceKind === "alert"
                      ? "Alerta del sistema"
                      : lead.sourceKind === "sgsa_gestion"
                        ? "Gestión del sistema"
                        : "Cliente del sistema"}
                </p>
              </div>
            </div>

            {clienteNombre && clienteNombre !== titulo && (
              <p className="mt-2 text-xs text-text-3">Cliente: {clienteNombre}</p>
            )}
            {(alertaTipo || alertaUrgencia) && (
              <p className="mt-1 text-xs text-text-3">
                {[alertaTipo, alertaUrgencia].filter(Boolean).join(" · ")}
              </p>
            )}
            {readOnly && (
              <p className="mt-2 rounded border border-warning-soft bg-warning-tint px-2 py-1 text-[11px] text-warning-text">
                Tarjeta de otra persona: se consulta, no se edita.
              </p>
            )}

            {lead.contact && lead.conversationId && (
              <Link
                href={`/inbox?contact=${lead.contact.id}`}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <MessageSquareText className="h-4 w-4" /> Abrir conversación
              </Link>
            )}
            {lead.contact && !lead.conversationId && (
              <p className="mt-3 text-xs text-text-3">
                Todavía no hay conversación con este contacto.
              </p>
            )}
            {lead.sourceKind === "alert" && (
              <div className="mt-3 space-y-2">
                {/* 030 — el estado REAL de la alerta, a la vista: la tarjeta
                    va macheada con la tabla. */}
                {typeof lead.meta?.estado === "string" && (
                  <p className="rounded border border-border-strong bg-subtle px-2 py-1 text-[11px] text-text-2">
                    Estado en el sistema:{" "}
                    <span className="font-semibold">
                      {ALERT_ESTADO_LABEL[lead.meta.estado] ?? lead.meta.estado}
                    </span>
                  </p>
                )}
                {registroUrl && (
                  <a
                    href={registroUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir registro
                  </a>
                )}
                {clienteRecordId && (
                  <a
                    href={sgsaClientInterfaceUrl(clienteRecordId)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir cliente
                  </a>
                )}
              </div>
            )}
            {lead.sourceKind === "sgsa_gestion" && registroUrl && (
              <a
                href={registroUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ExternalLink className="h-4 w-4" /> Abrir gestión en el sistema
              </a>
            )}
            {lead.sourceKind === "sgsa_client" && lead.sgsaRef && (
              <a
                href={sgsaClientInterfaceUrl(lead.sgsaRef)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ExternalLink className="h-4 w-4" /> Abrir cliente en el sistema
              </a>
            )}
          </section>

          {/* Cuánto — solo el embudo de ventas maneja plata. */}
          {!esGestion && (
            <section className="border-b p-4">
              <p className="mb-2 kicker">Monto ({moneda})</p>
              {readOnly ? (
                <p className="text-sm tabular-nums">
                  {lead.amountCents === null
                    ? "Sin monto"
                    : formatMoneyCents(lead.amountCents, moneda)}
                </p>
              ) : editandoMonto ? (
                <>
                  <Input
                    autoFocus
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !montoInvalido) {
                        setEditandoMonto(false);
                        onAmount(montoParseado);
                      }
                      if (e.key === "Escape") setEditandoMonto(false);
                    }}
                    placeholder="12,500"
                    aria-label="Monto del trato"
                    className="h-8 text-sm"
                  />
                  <p className="mt-1 text-xs text-text-3">
                    {montoInvalido
                      ? "No se entiende ese importe."
                      : montoParseado === null
                        ? "Déjalo vacío para quitar el monto."
                        : `Se guardará como ${formatMoneyCents(montoParseado, moneda)}`}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={montoInvalido}
                      onClick={() => {
                        setEditandoMonto(false);
                        onAmount(montoParseado);
                      }}
                    >
                      Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditandoMonto(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setEditandoMonto(true)}
                  aria-label="Editar el monto"
                  className={cn(
                    "w-full rounded px-1 py-1 text-left text-sm tabular-nums hover:bg-accent",
                    lead.amountCents === null
                      ? "text-text-3"
                      : "font-semibold text-foreground"
                  )}
                >
                  {lead.amountCents === null
                    ? "Sin monto — captúralo"
                    : formatMoneyCents(lead.amountCents, moneda)}
                </button>
              )}
            </section>
          )}

          {/* A quién llamar primero */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">Prioridad</p>
            {readOnly ? (
              <p className="text-sm">
                {lead.priority === null
                  ? "Sin prioridad"
                  : lead.priority === "alta"
                    ? "Alta"
                    : lead.priority === "media"
                      ? "Media"
                      : "Baja"}
              </p>
            ) : (
              <PriorityPicker value={lead.priority} onChange={onPriority} />
            )}
          </section>

          {/* Dónde va */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">Etapa</p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const actual = s.id === lead.stageId;
                return (
                  <button
                    key={s.id}
                    onClick={() => !actual && !readOnly && onMoveStage(s.id)}
                    aria-pressed={actual}
                    aria-label={`Mover a ${s.name}`}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      actual
                        ? "border-brand bg-brand-tint font-semibold text-brand-text"
                        : "border-border text-text-2 hover:bg-accent",
                      !actual && readOnly && "cursor-default opacity-70"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Qué se sabe — solo con ficha de contacto del CRM. */}
          {lead.contact && !readOnly && <FichaPanel ficha={ficha} onSave={guardarFicha} />}

          {/* Sacar del pipeline (029): mi tarjeta se va con su historia. */}
          {!readOnly && (
            <section className="p-4">
              {confirmandoSacar ? (
                <div className="rounded-md border border-warning-soft bg-warning-tint p-3">
                  <p className="text-xs text-warning-text">
                    ¿Sacar la tarjeta del pipeline? Su historial se va con ella.
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="destructive" onClick={onRemove}>
                      Sacar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmandoSacar(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive"
                  onClick={() => setConfirmandoSacar(true)}
                >
                  Sacar del pipeline
                </Button>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
