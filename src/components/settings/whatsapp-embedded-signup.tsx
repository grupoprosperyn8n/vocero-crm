"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 050 — Alta del número por Embedded Signup (coexistencia incluida).
 *
 * Dos compuertas antes de tocar Meta:
 *  1. pre-consentimiento explícito (qué se apaga en el celular),
 *  2. checklist de lo que hay que tener a mano.
 *
 * El postMessage del popup se acepta SOLO si viene del origen de Meta, del
 * popup que abrimos nosotros y con el tipo de evento del SDK. El `code` que
 * devuelve va al servidor, que es quien decide de quién es el número: acá no se
 * guarda nada.
 */

type Fase = "intro" | "opening" | "saving" | "done" | "error";

type EmbeddedSignupFinish = {
  waba_id?: string;
  phone_number_id?: string;
  code?: string;
};

const META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
]);

/** Carga el SDK de Facebook una sola vez por pestaña. */
function loadFbSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.FB) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    // Sin integrity: el SDK de Meta se sirve versionado y cambia sin aviso; el
    // origen es fijo y la carga ocurre solo al abrir esta pantalla.
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.FB?.init({ appId, xfbml: false, version: "v25.0" });
      resolve();
    };
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Meta"));
    document.body.appendChild(script);
  });
}

export function WhatsappEmbeddedSignup({
  appId,
  configId,
  onConnected,
}: {
  appId: string;
  configId: string;
  onConnected: () => void;
}) {
  const [fase, setFase] = useState<Fase>("intro");
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"coexistence" | "standard" | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const finishRef = useRef<EmbeddedSignupFinish | null>(null);
  const sentRef = useRef(false);

  const enviarAlta = useCallback(
    async (finish: EmbeddedSignupFinish) => {
      if (sentRef.current) return;
      if (!finish.code) return;
      sentRef.current = true;
      setFase("saving");
      setError(null);
      try {
        const res = await fetch("/api/settings/whatsapp/embedded-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: finish.code,
            wabaId: finish.waba_id,
            phoneNumberId: finish.phone_number_id,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { mode?: "coexistence" | "standard"; displayPhoneNumber?: string; error?: { message?: string } }
          | null;
        if (!res.ok) {
          setError(
            data?.error?.message ??
              "No se pudo completar el alta. Volvé a intentar desde el principio."
          );
          setFase("error");
          sentRef.current = false;
          return;
        }
        setModo(data?.mode ?? null);
        setNumero(data?.displayPhoneNumber ?? null);
        setFase("done");
        onConnected();
      } catch {
        setError("Se cortó la conexión con el servidor. Probá de nuevo.");
        setFase("error");
        sentRef.current = false;
      }
    },
    [onConnected]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!META_ORIGINS.has(event.origin)) return;
      if (popupRef.current && event.source !== popupRef.current) return;
      const data = event.data as
        | { type?: string; event?: string; data?: EmbeddedSignupFinish }
        | undefined;
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        finishRef.current = data.data ?? null;
        if (data.data?.code) void enviarAlta(data.data);
      }
      if (data.event === "CANCEL") {
        setFase("intro");
        setError(null);
      }
      if (data.event === "ERROR") {
        setFase("error");
        setError("Meta informó un error durante el alta. Revisá los permisos de tu cuenta.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enviarAlta]);

  async function abrirDialogo() {
    setError(null);
    setFase("opening");
    try {
      await loadFbSdk(appId);
      const fb = window.FB;
      if (!fb) throw new Error("sin SDK");
      fb.login(
        (response: { authResponse?: { code?: string } } | undefined) => {
          const code = response?.authResponse?.code;
          if (code) {
            const pending = finishRef.current ?? {};
            void enviarAlta({ ...pending, code });
          } else if (fase === "opening") {
            setFase("intro");
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
            version: "v4",
          },
        }
      );
    } catch {
      setFase("error");
      setError(
        "No se pudo abrir la ventana de Meta. Revisá que el navegador no esté bloqueando las ventanas emergentes."
      );
    }
  }

  if (fase === "done") {
    return (
      <div className="space-y-2 rounded-lg border border-success-soft bg-success-tint p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-success-text">
          <CheckCircle2 className="h-4 w-4" /> Número conectado
          {numero ? `: ${numero}` : ""}
        </p>
        <p className="text-success-text opacity-80">
          {modo === "coexistence"
            ? "Coexistencia: seguís usando WhatsApp Business en el celular. Los mensajes que contestes desde el teléfono también aparecen en la bandeja."
            : "El número quedó solo en el CRM (no estaba en la app de WhatsApp Business)."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">Conectar con WhatsApp (conserva tu celular)</p>
          <p className="text-sm text-muted-foreground">
            Autorizás desde tu cuenta de Meta y seguís atendiendo en el teléfono como siempre.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-success-soft bg-success-tint/40 p-3 text-sm">
          <p className="mb-1 font-medium text-success-text">Sigue funcionando</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>La app de WhatsApp Business en tu teléfono</li>
            <li>Tus chats y contactos</li>
            <li>Las llamadas y los mensajes que mandes a mano</li>
          </ul>
        </div>
        <div className="rounded-md border border-danger-soft bg-danger-tint/40 p-3 text-sm">
          <p className="mb-1 font-medium text-danger-text">Deja de funcionar</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Listas de difusión (quedan de solo lectura)</li>
            <li>Mensajes temporales y de «ver una vez»</li>
            <li>Ubicación en vivo y grupos no se sincronizan</li>
          </ul>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="mb-1 font-medium">Antes de empezar, tené a mano</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>El celular con la app de WhatsApp Business abierta y actualizada</li>
          <li>La cuenta de Meta que administra el negocio</li>
          <li>El número que querés conectar</li>
          <li>
            El código de verificación llega <strong>dentro de la app</strong>, no por SMS.
          </li>
        </ul>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
        />
        <span>
          Entiendo qué funciones dejo de tener en el teléfono y quiero conectar mi número.
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-danger-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => void abrirDialogo()} disabled={!acepta || fase === "opening" || fase === "saving"}>
          {fase === "opening"
            ? "Esperando a Meta…"
            : fase === "saving"
              ? "Guardando…"
              : "Conectar con WhatsApp"}
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> La autorización se hace en la pantalla de Meta
        </span>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; xfbml: boolean; version: string }) => void;
      login: (
        cb: (response: { authResponse?: { code?: string } } | undefined) => void,
        opts: Record<string, unknown>
      ) => void;
    };
  }
}
