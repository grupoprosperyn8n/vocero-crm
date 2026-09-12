"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  MessageSquareText,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ClientConversationDto,
  ContactDto,
  SystemClientSearchResultDto,
} from "@/lib/types";
import { formatPhone } from "@/lib/utils";
import { SOURCE_LABELS } from "@/server/contact-source";

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Web",
  instagram: "Instagram",
  messenger: "Messenger",
};

const AIRTABLE_BASE = "appuhslj3GFf60Tea";
const AIRTABLE_TABLE = "tblVAcMxNTLYXbLfT";

function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Dato({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function ConvList({
  conversations,
  contactId,
  onOpenConversation,
}: {
  conversations: ClientConversationDto[];
  contactId: string;
  onOpenConversation: (contactId: string) => void;
}) {
  return (
    <ul className="mt-1.5 space-y-1">
      {conversations.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <span className="text-muted-foreground">
            {CHANNEL_LABEL[c.channel] ?? c.channel} ·{" "}
            {c.closed ? "cerrada" : "abierta"}
            {c.isTest ? " · prueba" : ""}
            {c.lastMessageAt
              ? ` · ${new Date(c.lastMessageAt).toLocaleDateString("es-AR")}`
              : ""}
          </span>
          {!c.closed && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onOpenConversation(contactId)}
            >
              Abrir
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tarjeta de un cliente del sistema de gestión de seguros: los datos que
 * importan + su estado en el CRM + los botones para abrir el chat por
 * WhatsApp o Telegram (pedido Diego, 2026-09-12).
 */
export function SystemClientCard({
  result,
  onClose,
  onOpenConversation,
}: {
  result: SystemClientSearchResultDto;
  onClose: () => void;
  onOpenConversation: (contactId: string) => void;
}) {
  const { client, crm } = result;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openConv = crm?.conversations.find((c) => !c.closed);
  const tgConv = crm?.conversations.find((c) => c.channel === "telegram");
  const nombre = `${client.nombre} ${client.apellido}`.trim() || "Cliente";
  const p = client.polizas;

  async function abrirChat() {
    setError(null);
    if (!client.telefono) {
      setError("El cliente no tiene teléfono cargado en el sistema");
      return;
    }
    if (crm && openConv) {
      onOpenConversation(crm.contactId);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/clients/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recordId: client.recordId,
        name: nombre,
        phone: client.telefono,
      }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as
      | { contactId?: string; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.contactId) {
      setError(data?.error?.message ?? "No se pudo abrir el chat");
      return;
    }
    onOpenConversation(data.contactId);
  }

  const chips: { label: string; tone?: "warn" | "ok" }[] = [];
  if (p.total !== null) chips.push({ label: `Pólizas: ${p.total}` });
  if (p.activas !== null) chips.push({ label: `Activas: ${p.activas}`, tone: "ok" });
  if (p.enTramite !== null && p.enTramite > 0)
    chips.push({ label: `En trámite: ${p.enTramite}` });
  if (p.anuladas !== null && p.anuladas > 0)
    chips.push({ label: `Anuladas: ${p.anuladas}` });
  if (p.vence7 !== null && p.vence7 > 0)
    chips.push({ label: `⚠ Vencen en 7 días: ${p.vence7}`, tone: "warn" });
  if (p.vence30 !== null && p.vence30 > 0)
    chips.push({ label: `Vencen en 30 días: ${p.vence30}` });

  return (
    <Modal label={`Cliente ${nombre}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{nombre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Cliente del sistema de seguros</span>
            {client.estado && <Badge variant="outline">{client.estado}</Badge>}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <Dato
          label="Teléfono"
          value={
            client.telefono
              ? formatPhone(client.telefono)
              : (client.telefonoRaw ?? "Sin teléfono")
          }
        />
        <Dato label="DNI" value={client.dni} />
        <Dato
          label="Email"
          value={client.email ? `✉ ${client.email}` : null}
        />
        <Dato
          label="Oficina"
          value={client.oficina ? `🏢 ${client.oficina}` : null}
        />
        <Dato label="ID único" value={client.idUnico} />
        <Dato
          label="Alta"
          value={
            client.fechaAlta
              ? new Date(client.fechaAlta).toLocaleDateString("es-AR")
              : null
          }
        />
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                c.tone === "warn"
                  ? "border-amber-400/60 text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
              }`}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      {client.perfilRiesgo && (
        <div className="mt-3 rounded-md border bg-subtle p-3">
          <p className="text-xs font-medium">Perfil de riesgo (IA)</p>
          <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
            {client.perfilRiesgo}
          </p>
        </div>
      )}

      <div className="mt-4 rounded-md border bg-subtle p-3">
        {crm ? (
          <>
            <p className="text-xs font-medium">
              En el CRM: {crm.name}
              {crm.isTest && (
                <Badge variant="secondary" className="ml-1.5">
                  Prueba
                </Badge>
              )}
              {crm.archivedAt && (
                <Badge variant="secondary" className="ml-1.5">
                  Archivado
                </Badge>
              )}
            </p>
            {crm.conversations.length > 0 ? (
              <ConvList
                conversations={crm.conversations}
                contactId={crm.contactId}
                onOpenConversation={onOpenConversation}
              />
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Todavía no hay conversaciones: abrí el chat para iniciar.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Todavía no está en el CRM. Al abrir el chat se vincula por teléfono
            y queda guardado el enlace con el sistema.
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void abrirChat()}
          disabled={busy || !client.telefono}
          title={
            !client.telefono
              ? "El cliente no tiene teléfono en el sistema"
              : undefined
          }
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <MessageSquareText className="mr-1.5 h-4 w-4" />
          )}
          {crm && openConv ? "Abrir conversación" : "Escribir por WhatsApp"}
        </Button>
        <Button
          variant="secondary"
          disabled={!tgConv || !crm}
          title={
            tgConv && crm
              ? undefined
              : "Telegram solo funciona si el cliente ya escribió al bot"
          }
          onClick={() => tgConv && crm && onOpenConversation(crm.contactId)}
        >
          <Send className="mr-1.5 h-4 w-4" />
          {tgConv ? "Abrir chat Telegram" : "Telegram no disponible"}
        </Button>
        <a
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          href={`https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${client.recordId}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Ver ficha completa
        </a>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        WhatsApp: si el cliente escribió en las últimas 24 h podés responderle
        directo desde la Bandeja; si no, hace falta una plantilla aprobada.
      </p>
    </Modal>
  );
}

/**
 * Tarjeta de un contacto del CRM (click en la lista de Contactos): datos +
 * sus conversaciones + abrir/editar.
 */
export function ContactCard({
  contact,
  onClose,
  onOpenConversation,
  onEdit,
}: {
  contact: ContactDto;
  onClose: () => void;
  onOpenConversation: (contactId: string) => void;
  onEdit: () => void;
}) {
  const [convs, setConvs] = useState<ClientConversationDto[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/contacts/${contact.id}`).catch(() => null);
      if (!alive) return;
      if (!res?.ok) {
        setConvs([]);
        return;
      }
      const data = (await res.json()) as {
        conversations?: ClientConversationDto[];
      };
      setConvs(data.conversations ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [contact.id]);

  const openConv = convs?.find((c) => !c.closed) ?? null;
  const ficha = Object.entries(contact.ficha ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  return (
    <Modal label={`Contacto ${contact.name}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{contact.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {contact.channel && (
              <Badge variant="outline">
                {CHANNEL_LABEL[contact.channel] ?? contact.channel}
              </Badge>
            )}
            {contact.isTest && <Badge variant="secondary">Prueba</Badge>}
            {contact.archivedAt && (
              <Badge variant="secondary">Archivado</Badge>
            )}
            {contact.stageName && (
              <Badge variant="outline">{contact.stageName}</Badge>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <Dato label="Teléfono" value={formatPhone(contact.phone)} />
        <Dato
          label="Fuente"
          value={
            contact.source?.source === "capturada"
              ? SOURCE_LABELS[contact.source.value]
              : null
          }
        />
        <Dato
          label="Alta"
          value={
            contact.createdAt
              ? new Date(contact.createdAt).toLocaleDateString("es-AR")
              : null
          }
        />
        <Dato label="Notas" value={contact.notes} />
      </div>

      {ficha.length > 0 && (
        <div className="mt-3 rounded-md border bg-subtle p-3">
          <p className="text-xs font-medium">Ficha</p>
          <div className="mt-1.5 space-y-1">
            {ficha.map(([k, v]) => (
              <p key={k} className="text-xs">
                <span className="text-muted-foreground">{k}:</span>{" "}
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md border bg-subtle p-3">
        <p className="text-xs font-medium">Conversaciones</p>
        {convs === null ? (
          <p className="mt-1 text-xs text-muted-foreground">Cargando…</p>
        ) : convs.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Sin conversaciones todavía.
          </p>
        ) : (
          <ConvList
            conversations={convs}
            contactId={contact.id}
            onOpenConversation={onOpenConversation}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => onOpenConversation(contact.id)}
          disabled={!openConv}
          title={
            openConv
              ? undefined
              : "No hay conversación abierta: usá «Escribir primero» o reabrí una cerrada desde la Bandeja"
          }
        >
          <MessageSquareText className="mr-1.5 h-4 w-4" />
          Abrir conversación
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </Modal>
  );
}
