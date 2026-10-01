"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  LifeBuoy,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ConnectForm,
  WebhookCard,
  type Connection,
  type WebhookInfo,
} from "./whatsapp-connect";
import {
  ASSISTANT_STEPS,
  EMPTY_BUSINESS_PROFILE,
  PREREQUISITES,
  TOTAL_ASSISTANT_STEPS,
  buildHandoffSummary,
  type BusinessProfile,
} from "./whatsapp-steps";

const PROFILE_CATEGORIES = [
  "Comercio / tienda",
  "Gastronomía",
  "Servicios",
  "Salud y bienestar",
  "Belleza y estética",
  "Automotor",
  "Inmobiliaria",
  "Educación",
  "Seguros y finanzas",
  "Otro",
] as const;

/** Select nativo con el mismo alto/estilo de los Input del design system. */
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 043 — Asistente de conexión paso a paso: lleva a una persona no técnica por
 * el alta completa en Meta (7 pasos), valida en vivo donde se puede (probar
 * conexión) y genera el resumen para pasarle a quien ayuda.
 */
export function WhatsappAssistant({
  existing,
  webhook,
  onSaved,
  onExit,
}: {
  existing: Connection | null;
  webhook: WebhookInfo | null;
  onSaved: () => void;
  onExit?: () => void;
}) {
  const connected = Boolean(existing);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [done, setDone] = useState<number[]>(
    connected ? [1, 2, 3, 4, 5, 6] : []
  );
  const [businessId, setBusinessId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [profile, setProfile] = useState<BusinessProfile>(
    EMPTY_BUSINESS_PROFILE
  );
  const [copiedSum, setCopiedSum] = useState(false);

  const current = ASSISTANT_STEPS.find((s) => s.n === step)!;
  const isCurrentDone = done.includes(step) || (connected && step <= 6);

  const summary = useMemo(
    () =>
      buildHandoffSummary({
        step,
        done,
        businessId,
        wabaId,
        phoneNumberId,
        connected,
        profile,
      }),
    [step, done, businessId, wabaId, phoneNumberId, connected, profile]
  );

  function go(n: number) {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }

  function completeCurrent() {
    setDone((d) => (d.includes(step) ? d : [...d, step]));
    go(Math.min(step + 1, TOTAL_ASSISTANT_STEPS));
  }

  function copySummary() {
    void navigator.clipboard.writeText(summary).then(() => {
      setCopiedSum(true);
      setTimeout(() => setCopiedSum(false), 1600);
    });
  }

  const captureValue =
    current.capture?.field === "businessId"
      ? businessId
      : current.capture?.field === "wabaId"
        ? wabaId
        : phoneNumberId;

  function setCapture(v: string) {
    if (current.capture?.field === "businessId") setBusinessId(v);
    else if (current.capture?.field === "wabaId") setWabaId(v);
    else setPhoneNumberId(v);
  }

  function setProfileField(k: keyof BusinessProfile, v: string) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" />
              Asistente de conexión
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {onExit && (
                <Button variant="ghost" size="sm" onClick={onExit}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Volver al estado
                </Button>
              )}
              {!connected && step !== 6 && (
                <Button variant="ghost" size="sm" onClick={() => go(6)}>
                  Ya tengo los datos
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={copySummary}>
                <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
                {copiedSum ? "Copiado ✓" : "Pasarle esto a quien me ayuda"}
              </Button>
            </div>
          </div>
          <CardDescription>
            {connected
              ? "Tu número ya está conectado. Puedes repasar los pasos o pasarle el resumen a quien te ayuda."
              : "Te llevamos paso a paso para conectar el WhatsApp del negocio. Son 7 pasos y no hace falta saber nada técnico."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {ASSISTANT_STEPS.map((s) => {
              const stepDone = done.includes(s.n) || (connected && s.n <= 6);
              const isCurrent = s.n === step;
              // Con conexión (modo consulta) los pasos se navegan libremente.
              const canGo = connected || s.n <= maxStep || stepDone;
              return (
                <div key={s.n} className="flex items-center">
                  {s.n > 1 && (
                    <div
                      className={cn(
                        "h-px w-2 sm:w-5",
                        stepDone ? "bg-success" : "bg-border"
                      )}
                    />
                  )}
                  <button
                    type="button"
                    disabled={!canGo}
                    onClick={() => canGo && go(s.n)}
                    aria-label={`Paso ${s.n}: ${s.title}`}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition",
                      isCurrent
                        ? "border-primary bg-primary text-primary-foreground"
                        : stepDone
                          ? "border-success-soft bg-success-tint text-success-text"
                          : "border-border bg-background text-muted-foreground",
                      canGo ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                    )}
                  >
                    {stepDone && !isCurrent ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      s.n
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {!connected && (
            <details
              open
              className="mt-3 rounded-md border bg-muted/20 p-3 text-sm"
            >
              <summary className="cursor-pointer text-muted-foreground">
                Antes de empezar: revisa estos requisitos
              </summary>
              <ul className="mt-2 space-y-2">
                {PREREQUISITES.map((p) => (
                  <li key={p.title} className="text-xs">
                    <span className="font-medium">{p.title}.</span>{" "}
                    <span className="text-muted-foreground">{p.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Paso {current.n} de {TOTAL_ASSISTANT_STEPS}
            </Badge>
            {isCurrentDone && <Badge variant="success">Hecho</Badge>}
          </div>
          <CardTitle>{current.title}</CardTitle>
          <CardDescription>{current.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {current.body.length > 0 && (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {current.body.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          )}

          {current.link && (
            <a
              href={current.link.href}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              {current.link.label}
            </a>
          )}

          {current.capture && (
            <div className="space-y-1.5">
              <Label htmlFor={`cap-${current.capture.field}`}>
                {current.capture.label}
              </Label>
              <Input
                id={`cap-${current.capture.field}`}
                value={captureValue}
                onChange={(e) => setCapture(e.target.value)}
                placeholder={current.capture.placeholder}
              />
              <p className="text-xs text-muted-foreground">
                {current.capture.hint}
              </p>
            </div>
          )}

          {current.warning && (
            <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {current.warning}
            </p>
          )}

          {current.tip && (
            <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {current.tip}
            </p>
          )}

          {step === 6 &&
            (connected ? (
              <p className="flex items-start gap-2 rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Tu número ya está conectado (token …{existing?.tokenLast4}). Si
                necesitas actualizar el token, usa «Reconectar / actualizar el
                número» y vuelve a esta guía cuando quieras.
              </p>
            ) : (
              <ConnectForm
                existing={null}
                initial={{ wabaId, phoneNumberId }}
                onSaved={() => {
                  setDone((d) => (d.includes(6) ? d : [...d, 6]));
                  go(7);
                  onSaved();
                }}
              />
            ))}

          {step === 7 && (
            <div className="space-y-3">
              {!webhook && (
                <p className="text-sm text-muted-foreground">
                  El webhook va a estar disponible cuando guardes la conexión
                  en el paso 6.
                </p>
              )}
              {webhook && <WebhookCard webhook={webhook} />}
              {connected && (
                <div className="flex items-start gap-2 rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      ¡Conexión completa! Prueba en vivo:
                    </p>
                    <p className="opacity-80">
                      desde otro celular, escríbele a{" "}
                      {existing?.displayPhoneNumber ?? "tu número"} y mira cómo
                      aparece en tu Bandeja.
                    </p>
                  </div>
                </div>
              )}
              {connected && (
                <Link href="/" className={buttonVariants({ size: "sm" })}>
                  Ir a la Bandeja <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={step === 1}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Volver
            </Button>
            {step < 6 && (
              <Button onClick={completeCurrent}>
                {step === 5 ? "Ir a la conexión" : "Listo, ya lo hice"}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
            {step === 6 && !connected && (
              <span className="text-xs text-muted-foreground">
                Primero prueba y guarda la conexión (arriba), y seguimos con el
                paso 7.
              </span>
            )}
            {step === 7 && !connected && (
              <span className="text-xs text-muted-foreground">
                Cuando guardes la conexión, vuelve a este paso para la prueba
                final.
              </span>
            )}
          </div>

          <details className="rounded-md border bg-muted/20 p-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Datos del negocio para el alta (opcional)
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Con estos datos se completa el perfil de WhatsApp (nombre visible,
              descripción, rubro, web, correo y dirección). Se suman al resumen
              para quien te ayuda. El logo se sube directo en WhatsApp Manager.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prof-name">Nombre visible</Label>
                <Input
                  id="prof-name"
                  value={profile.name}
                  onChange={(e) => setProfileField("name", e.target.value)}
                  placeholder="ej. Panadería del Sol"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-category">Rubro</Label>
                <select
                  id="prof-category"
                  value={profile.category}
                  onChange={(e) => setProfileField("category", e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Elegir rubro…</option>
                  {PROFILE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-website">Sitio web</Label>
                <Input
                  id="prof-website"
                  value={profile.website}
                  onChange={(e) => setProfileField("website", e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-email">Correo de contacto</Label>
                <Input
                  id="prof-email"
                  value={profile.email}
                  onChange={(e) => setProfileField("email", e.target.value)}
                  placeholder="contacto@tunegocio.com"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="prof-address">Dirección</Label>
                <Input
                  id="prof-address"
                  value={profile.address}
                  onChange={(e) => setProfileField("address", e.target.value)}
                  placeholder="Calle 123, ciudad"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="prof-description">Descripción</Label>
                <Textarea
                  id="prof-description"
                  rows={3}
                  value={profile.description}
                  onChange={(e) =>
                    setProfileField("description", e.target.value)
                  }
                  placeholder="Qué ofrece el negocio, horarios de atención, etc."
                />
              </div>
            </div>
          </details>

          <details className="rounded-md border bg-muted/20 p-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Resumen para pasarle a quien te ayuda
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs">
              {summary}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={copySummary}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copiedSum ? "Copiado ✓" : "Copiar resumen"}
            </Button>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
