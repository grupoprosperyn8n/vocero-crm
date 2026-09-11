"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 021 — Conexión del canal de Telegram.
 *
 * Un solo campo: el token del bot de BotFather. El webhook no se pega en
 * ninguna plataforma — al conectar, la instancia llama a `setWebhook` con su
 * propia URL firmada, así que el operador no arma rutas a mano (misma
 * filosofía de "probar contra la plataforma antes de guardar" que el wizard
 * de WhatsApp). La pantalla solo existe si el canal está encendido con
 * `CHANNELS` (ADR-001), y es del propietario.
 */

type Connection = {
  botId: string;
  botUsername: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
  webhookUrl: string;
};

const HELP_ITEMS = [
  "Abrí Telegram y hablale a @BotFather: mandá /newbot, elegí un nombre y un usuario para el bot.",
  "BotFather te devuelve el token (formato 123456:ABC-DEF…): copialo y pegalo acá.",
  "Al conectar, Vocero le avisa a Telegram dónde entregar los mensajes: no hay que pegar ninguna URL en ningún lado.",
  "Para probar: abrí el bot desde Telegram y mandale /start o un mensaje — la conversación aparece en la bandeja como cualquier otra.",
  "En grupos, el bot solo ve los mensajes que lo mencionan (ajuste de privacidad de BotFather); en chat directo recibe todo.",
];

export function TelegramClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/telegram").catch(() => null);
    if (res?.ok) {
      const data = (await res.json().catch(() => null)) as {
        connection: Connection | null;
      } | null;
      if (data) setConnection(data.connection);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/settings/telegram", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo conectar el bot");
      return;
    }
    const data = (await res.json()) as { botUsername?: string | null };
    setToken("");
    setSaved(
      data.botUsername ? `Bot conectado: @${data.botUsername}` : "Conexión guardada"
    );
    void refetch();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin portapapeles (contexto no seguro): el texto sigue visible
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              El token del bot expiró o fue revocado.
            </p>
            <p className="text-danger-text opacity-80">
              Los envíos por Telegram están pausados. Pega uno nuevo abajo para
              reconectar.
            </p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              {connection.botUsername
                ? `Conectado: @${connection.botUsername}`
                : "Bot conectado"}
            </p>
            <p className="text-success-text opacity-80">
              Bot {connection.botId} · token que termina en ····{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Telegram activo</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {connection ? "Reconectar el bot" : "Conectar Telegram"}
          </CardTitle>
          <CardDescription>
            Los mensajes que le escriban al bot entran a la misma bandeja que
            WhatsApp, con su distintivo de canal, y se responden desde el mismo
            hilo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {HELP_ITEMS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Token del bot (BotFather)</Label>
            <Input
              id="tg-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456:ABC-DEF…"
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success-text">{saved} ✓</p>}

          <Button
            disabled={saving || token.trim().length < 10}
            onClick={() => void save()}
          >
            {saving ? "Probando…" : "Probar y conectar"}
          </Button>
        </CardContent>
      </Card>

      {connection?.webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook de Telegram</CardTitle>
            <CardDescription>
              La dirección a la que Telegram entrega los mensajes del bot. La
              configura sola esta instancia al conectar: se muestra para que
              quede a la vista.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>URL de entrega</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={connection.webhookUrl}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar la URL"
                  onClick={() => void copy(connection.webhookUrl)}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-text-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Cada entrega viaja firmada con el secreto de esta URL (header
              X-Telegram-Bot-Api-Secret-Token) y se verifica antes de procesar
              nada.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
