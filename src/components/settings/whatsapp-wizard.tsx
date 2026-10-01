"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsappAssistant } from "./whatsapp-assistant";
import {
  ConnectForm,
  WebhookCard,
  type Connection,
  type WebhookInfo,
} from "./whatsapp-connect";

/**
 * 043 — Página de conexión: sin número conectado abre el ASISTENTE paso a
 * paso; con número conectado muestra el estado, la reconexión y el webhook.
 */
export function WhatsappWizard() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  /**
   * auto: sin conexión → guía; con conexión → estado.
   * guia / conexion: elección explícita del usuario (persiste tras guardar,
   * para que la prueba final del paso 7 no se pierda).
   */
  const [vista, setVista] = useState<"auto" | "guia" | "conexion">("auto");

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/whatsapp").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) setConnection(c.connection);
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  const mostrarGuia = vista === "guia" || (vista === "auto" && !connection);
  const mostrarEstado = !mostrarGuia && connection;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              El token de WhatsApp expiró o fue revocado.
            </p>
            <p className="text-danger-text opacity-80">
              Los envíos están pausados. Pega un token nuevo abajo y prueba la
              conexión para reconectar.
            </p>
          </div>
        </div>
      )}

      {connection && connection.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Número conectado: {connection.displayPhoneNumber ?? connection.phoneNumberId}
            </p>
            <p className="text-success-text opacity-80">
              {connection.verifiedName ? `${connection.verifiedName} · ` : ""}
              token …{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Conectado</Badge>
        </div>
      )}

      {mostrarGuia && (
        <WhatsappAssistant
          existing={connection}
          webhook={webhook}
          onSaved={() => {
            // Quedarse en la guía: el paso 7 (prueba final) sigue a la vista.
            setVista("guia");
            void refetch();
          }}
          onExit={
            vista === "guia" && connection
              ? () => setVista("conexion")
              : undefined
          }
        />
      )}

      {mostrarEstado && (
        <>
          <ReconnectSection
            connection={connection}
            onSaved={() => void refetch()}
          />
          {webhook && <WebhookCard webhook={webhook} />}
          <DisconnectSection
            onDone={() => {
              setVista("auto");
              void refetch();
            }}
          />
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setVista("guia")}>
              Ver la guía de conexión paso a paso
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 047 — Desconectar el número: borra las credenciales guardadas y vuelve al
 * asistente. La reconexión se hace pegando de nuevo los datos de Meta.
 */
function DisconnectSection({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/settings/whatsapp", { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    if (!res?.ok) {
      setErr("No se pudo desconectar; intenta de nuevo.");
      return;
    }
    setConfirming(false);
    onDone();
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-danger-soft bg-danger-tint p-4">
      <p className="text-sm font-medium text-danger-text">
        Desconectar este número
      </p>
      <p className="text-xs text-danger-text opacity-80">
        Se pausan los envíos y la recepción por WhatsApp y se borran las
        credenciales guardadas. Para reconectar, volvé a pegar los datos de
        Meta.
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {confirming ? (
        <span className="flex items-center gap-2 text-sm">
          ¿Desconectar?
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Sí
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            No
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          <Power className="h-3.5 w-3.5" /> Desconectar WhatsApp
        </Button>
      )}
    </div>
  );
}

function ReconnectSection({
  connection,
  onSaved,
}: {
  connection: Connection;
  onSaved: () => void;
}) {
  // Si el token expiró, el formulario se muestra abierto de entrada.
  const [open, setOpen] = useState(
    connection.status === "reconnect_required"
  );

  return (
    <div className="space-y-3">
      {!open && (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Reconectar / actualizar el número
        </Button>
      )}
      {open && (
        <>
          <ConnectForm
            existing={connection}
            onSaved={() => {
              setOpen(false);
              onSaved();
            }}
          />
          {connection.status === "connected" && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setOpen(false)}
            >
              Ocultar
            </button>
          )}
        </>
      )}
    </div>
  );
}
