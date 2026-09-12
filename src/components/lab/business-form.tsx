"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Play, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Item = {
  id: string;
  question: string;
  hint: string;
  kbQuestion: string;
  answer: string | null;
  entryId: string | null;
};

type Group = {
  key: string;
  title: string;
  description: string;
  items: Item[];
};

type Counts = { total: number; cargados: number };

/**
 * Formulario "Datos del negocio" del Laboratorio: completa los datos que el
 * agente necesita y que faltan en el Conocimiento. Cada respuesta guardada
 * entra al Conocimiento como entrada qa (el agente la usa al instante).
 */
export function BusinessForm({ onRunLab }: { onRunLab: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback(
    (data: { groups: Group[]; counts: Counts }) => {
      setGroups(data.groups);
      setCounts(data.counts);
      const next: Record<string, string> = {};
      for (const g of data.groups) {
        for (const it of g.items) next[it.id] = it.answer ?? "";
      }
      setValues(next);
      setDirty({});
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/lab/business-form").catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError("No se pudo cargar el cuestionario");
      return;
    }
    applyState((await res.json()) as { groups: Group[]; counts: Counts });
  }, [applyState]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(runAfter: boolean) {
    setSaving(true);
    setError(null);
    setMsg(null);

    const answers = Object.keys(dirty)
      .filter((id) => dirty[id] && (values[id] ?? "").trim().length > 0)
      .map((id) => ({ id, answer: (values[id] ?? "").trim() }));

    if (answers.length === 0) {
      setSaving(false);
      if (runAfter) onRunLab();
      return;
    }

    const res = await fetch("/api/lab/business-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar");
      return;
    }

    const data = (await res.json()) as {
      created: number;
      updated: number;
      groups: Group[];
      counts: Counts;
    };
    applyState(data);
    setMsg(
      `Guardado ✓ — ${data.created} nuevo(s), ${data.updated} actualizado(s). El agente ya lo usa.`
    );
    if (runAfter) onRunLab();
  }

  if (loading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Cargando cuestionario…</p>
    );
  }

  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const pendientes = counts ? counts.total - counts.cargados : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            <ClipboardList className="h-4 w-4 text-primary" /> Datos del negocio
          </h3>
          <p className="text-xs text-muted-foreground">
            Lo que completes acá entra al Conocimiento y el agente lo usa al
            instante (Laboratorio y chat real).
            {counts &&
              ` ${counts.cargados} de ${counts.total} cargados${
                pendientes > 0 ? ` — quedan ${pendientes}` : ""
              }.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void save(false)}
            disabled={saving || dirtyCount === 0}
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando…" : `Guardar${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </Button>
          <Button onClick={() => void save(true)} disabled={saving}>
            <Play className="h-4 w-4" /> Guardar y correr evaluación
          </Button>
        </div>
      </div>

      {msg && <p className="text-sm text-success">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.map((g) => (
        <div key={g.key} className="rounded-lg border border-border-strong bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">{g.title}</p>
            <p className="text-xs text-muted-foreground">{g.description}</p>
          </div>
          <div className="divide-y">
            {g.items.map((it) => (
              <div key={it.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{it.question}</p>
                    <p className="text-xs text-muted-foreground">{it.hint}</p>
                  </div>
                  {dirty[it.id] ? (
                    <Badge variant="secondary">Sin guardar</Badge>
                  ) : it.entryId ? (
                    <Badge variant="success">Cargado</Badge>
                  ) : (
                    <Badge variant="warning">Pendiente</Badge>
                  )}
                </div>
                <Textarea
                  rows={3}
                  value={values[it.id] ?? ""}
                  placeholder={it.entryId ? "" : "Escribe la respuesta acá…"}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [it.id]: e.target.value }));
                    setDirty((d) => ({ ...d, [it.id]: true }));
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
