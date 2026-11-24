"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Link2,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WhatsappEmbeddedSignup } from "./whatsapp-embedded-signup";
import { COEXISTENCE_REQUIREMENTS, CONNECT_METHODS } from "./whatsapp-steps";

/**
 * 051 — Elección del método de conexión dentro de Ajustes → WhatsApp.
 *
 * Las dos puertas están a la vista con lo que se gana y lo que se pierde, y la
 * de coexistencia (QR) sólo se habilita si Meta aprobó la app como Tech
 * Provider. Si no, se muestra el motivo real y qué falta, en vez de un botón
 * que falla después de que el cliente ya se ilusionó.
 */

export type TechProviderInfo = {
  approved: boolean;
  embeddedSignupAvailable: boolean;
  reason: string | null;
};

export type EmbeddedSignupInfo = {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
};

export function ConnectMethods({
  techProvider,
  embedded,
  onConnected,
}: {
  techProvider: TechProviderInfo | null;
  embedded: EmbeddedSignupInfo | null;
  onConnected: () => void;
}) {
  const [abrirQr, setAbrirQr] = useState(false);

  const coexistence = CONNECT_METHODS.find((m) => m.id === "coexistence")!;
  const manual = CONNECT_METHODS.find((m) => m.id === "manual")!;

  const qrDisponible = Boolean(
    techProvider?.embeddedSignupAvailable &&
      embedded?.enabled &&
      embedded.appId &&
      embedded.configId
  );

  return (
    <section className="space-y-3" aria-labelledby="metodos-conexion">
      <div>
        <h2 id="metodos-conexion" className="text-sm font-semibold">
          ¿Cómo querés conectar tu WhatsApp?
        </h2>
        <p className="text-xs text-muted-foreground">
          Los dos caminos conectan el mismo número al CRM. Cambia quién controla
          la cuenta en Meta y si el celular sigue atendiendo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MethodCard
          title={coexistence.title}
          lead={coexistence.lead}
          keeps={coexistence.keeps}
          loses={coexistence.loses}
          icon={<Smartphone className="h-4 w-4" />}
          highlight
        >
          {qrDisponible ? (
            abrirQr ? (
              <WhatsappEmbeddedSignup
                appId={embedded!.appId!}
                configId={embedded!.configId!}
                onConnected={onConnected}
              />
            ) : (
              <Button size="sm" onClick={() => setAbrirQr(true)}>
                <Link2 className="mr-1.5 h-4 w-4" />
                Conectar con QR
              </Button>
            )
          ) : (
            <div className="space-y-2">
              <Button size="sm" variant="outline" disabled>
                <Link2 className="mr-1.5 h-4 w-4" />
                Conectar con QR
              </Button>
              <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-2 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {techProvider?.reason ??
                    "Esta instancia no tiene el alta automática configurada."}
                </span>
              </p>
              <details className="rounded-md border bg-muted/20 p-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Qué falta para habilitarlo
                </summary>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                  {COEXISTENCE_REQUIREMENTS.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Mientras tanto, el camino manual de la derecha conecta el
                  número hoy mismo.
                </p>
              </details>
            </div>
          )}
        </MethodCard>

        <MethodCard
          title={manual.title}
          lead={manual.lead}
          keeps={manual.keeps}
          loses={manual.loses}
          icon={<CheckCircle2 className="h-4 w-4" />}
        >
          <p className="text-xs text-muted-foreground">
            Es el recorrido de los 7 pasos que está abajo: cada paso trae la
            pantalla de Meta, qué copiar y el error típico.
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {manual.needs}
          </p>
        </MethodCard>
      </div>
    </section>
  );
}

function MethodCard({
  title,
  lead,
  keeps,
  loses,
  icon,
  highlight,
  children,
}: {
  title: string;
  lead: string;
  keeps: string[];
  loses: string[];
  icon: ReactNode;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        highlight ? "border-primary/40 bg-primary/5" : "bg-background"
      )}
    >
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="text-primary">{icon}</span>
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{lead}</p>
      </header>
      <div className="grid gap-2 text-xs">
        <div>
          <p className="font-medium text-success-text">Sigue funcionando</p>
          <ul className="mt-0.5 list-inside list-disc text-muted-foreground">
            {keeps.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-warning-text">Deja de funcionar</p>
          <ul className="mt-0.5 list-inside list-disc text-muted-foreground">
            {loses.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-auto space-y-2 pt-1">{children}</div>
    </article>
  );
}
