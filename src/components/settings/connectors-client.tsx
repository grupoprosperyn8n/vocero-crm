"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Connector = {
  id: string;
  name: string;
  url: string;
  secretSet: boolean;
  enabled: boolean;
};

type Draft = { id?: string; name: string; url: string; secret: string };

/**
 * 1F — Configuración → Conectores: destinos del webhook de cierre
 * (multi conector). Cada conector recibe la gestión curada firmada con su
 * propio secreto; el cierre de una conversación emite a TODOS los
 * conectores habilitados. Sin conectores, la gestión queda en el CRM.
 */
export function ConnectorsSettings() {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/connectors");
      const data = (await res.json()) as { connectors?: Connector[]; error?: string };
      if (!res.ok || !data.connectors) {
        setLoadError(data.error ?? "No se pudo cargar la lista.");
        return;
      }
      setConnectors(data.connectors);
      setLoadError(null);
    } catch {
      setLoadError("No se pudo cargar la lista.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setDraft({ name: "", url: "", secret: "" });
    setFormError(null);
  };

  const startEdit = (c: Connector) => {
    setDraft({ id: c.id, name: c.name, url: c.url, secret: "" });
    setFormError(null);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = { name: draft.name, url: draft.url };
      if (draft.secret) body.secret = draft.secret;
      const res = await fetch(
        draft.id ? `/api/settings/connectors/${draft.id}` : "/api/settings/connectors",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFormError(data.error ?? "No se pudo guardar el conector.");
        setBusy(false);
        return;
      }
      setDraft(null);
      await load();
    } catch {
      setFormError("No se pudo guardar el conector.");
    }
    setBusy(false);
  };

  const toggle = async (c: Connector) => {
    await fetch(`/api/settings/connectors/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    }).catch(() => null);
    void load();
  };

  const remove = async (c: Connector) => {
    if (!window.confirm(`¿Eliminar el conector "${c.name}"?\n\nDejará de recibir las gestiones curadas al cerrar conversaciones.`)) {
      return;
    }
    await fetch(`/api/settings/connectors/${c.id}`, { method: "DELETE" }).catch(() => null);
    void load();
  };

  const clearSecret = async (c: Connector) => {
    if (!window.confirm(`¿Quitar la firma del conector "${c.name}"?\n\nLos próximos envíos llegarán sin x-vocero-signature.`)) {
      return;
    }
    await fetch(`/api/settings/connectors/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: null }),
    }).catch(() => null);
    void load();
  };

  const test = async (c: Connector) => {
    setTestResult({ id: c.id, ok: true, text: "Enviando prueba…" });
    try {
      const res = await fetch(`/api/settings/connectors/${c.id}/test`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: number };
      setTestResult(
        data.ok
          ? { id: c.id, ok: true, text: `El destino respondió OK (HTTP ${data.status ?? 200}).` }
          : { id: c.id, ok: false, text: data.error ?? `HTTP ${data.status ?? "?"} del destino.` }
      );
    } catch {
      setTestResult({ id: c.id, ok: false, text: "No se pudo contactar el destino." });
    }
  };

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h3 className="text-[15px] font-bold tracking-tight">Conectores salientes</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-2">
          Destinos que reciben la <strong>gestión curada</strong> cuando cerrás una
          conversación (resumen IA + datos; el transcript queda siempre en el CRM).
          El cierre emite a todos los conectores habilitados. Cada uno firma con su
          propio secreto (HMAC, header <code className="rounded bg-accent px-1">x-vocero-signature</code>).
        </p>
      </div>

      {loadError && (
        <p className="rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-danger-text">
          {loadError}
        </p>
      )}

      {!draft && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-text-2">
            {connectors === null
              ? "Cargando…"
              : `${connectors.length} ${connectors.length === 1 ? "conector" : "conectores"}`}
          </p>
          <button
            onClick={startNew}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            + Agregar conector
          </button>
        </div>
      )}

      {draft && (
        <form
          onSubmit={(e) => void save(e)}
          className="flex flex-col gap-3 rounded-lg border border-border-strong bg-secondary p-4"
        >
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-2">
              Nombre
            </label>
            <input
              autoFocus
              className={inputCls}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="n8n Sira (gestión curada)"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-2">
              URL del destino
            </label>
            <input
              type="url"
              className={inputCls}
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://…/webhook/vocero-cierre"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-2">
              Secreto (firma HMAC — opcional)
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={draft.secret}
              onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
              placeholder={
                draft.id
                  ? "(dejalo vacío para mantener el actual)"
                  : "Sin secreto: el destino recibe el payload sin firmar"
              }
            />
          </div>
          {draft.id && draft.secret === "" && (
            <p className="text-[12.5px] text-text-2">
              El conector tiene firma activa.{" "}
              <button
                type="button"
                onClick={() => {
                  const c = connectors?.find((x) => x.id === draft.id);
                  if (c) void clearSecret(c);
                }}
                className="font-semibold text-danger-text underline"
              >
                Quitar la firma
              </button>{" "}
              (los envíos llegarán sin firmar)
            </p>
          )}
          {formError && (
            <p className="rounded-md border border-danger-soft bg-danger-tint p-2.5 text-[12.5px] text-danger-text">
              {formError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-semibold text-text-2 transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Guardando…" : draft.id ? "Guardar cambios" : "Agregar conector"}
            </button>
          </div>
        </form>
      )}

      {connectors !== null && connectors.length === 0 && !draft && (
        <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-[13px] leading-relaxed text-text-2">
          Todavía no hay conectores. Al cerrar una conversación la gestión curada
          queda guardada en el CRM y no se envía a ningún backend.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(connectors ?? []).map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border border-border-strong p-3.5 transition-opacity",
              !c.enabled && "opacity-60"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13.5px] font-bold">{c.name}</span>
                {c.secretSet ? (
                  <span
                    title="Firma HMAC activa: los envíos viajan con x-vocero-signature"
                    className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-text-2"
                  >
                    🔒 firmado
                  </span>
                ) : (
                  <span
                    title="Sin secreto: el destino recibe el payload sin firma"
                    className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-text-2"
                  >
                    sin firma
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => void test(c)}
                  title="Enviar evento de prueba al destino"
                  className="rounded border border-border-strong px-2 py-1 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent hover:text-foreground"
                >
                  Probar
                </button>
                <button
                  onClick={() => startEdit(c)}
                  className="rounded border border-border-strong px-2 py-1 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent hover:text-foreground"
                >
                  Editar
                </button>
                <button
                  onClick={() => void remove(c)}
                  title="Eliminar conector"
                  className="rounded border border-border-strong px-2 py-1 text-[12px] font-semibold text-danger-text transition-colors hover:bg-danger-tint"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => void toggle(c)}
                  title={c.enabled ? "Apagar (deja de recibir cierres)" : "Encender"}
                  className={cn(
                    "relative ml-1 h-5 w-9 rounded-full transition-colors",
                    c.enabled ? "bg-[var(--success)]" : "bg-border-strong"
                  )}
                  aria-pressed={c.enabled}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                      c.enabled ? "left-[18px]" : "left-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <code className="truncate font-mono text-[12px] text-text-2">{c.url}</code>
              {testResult?.id === c.id && (
                <span
                  className={cn(
                    "shrink-0 rounded px-2 py-0.5 text-[11.5px] font-semibold",
                    testResult.ok
                      ? "bg-success-tint text-success-text"
                      : "bg-danger-tint text-danger-text"
                  )}
                >
                  {testResult.text}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
