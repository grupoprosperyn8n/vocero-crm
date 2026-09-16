"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Hash, Loader2, Search, Settings2, X } from "lucide-react";
import { REVIEW_ENVIO_ALERT_LABEL, REVIEW_ENVIO_ALERT_TYPE } from "@/lib/reviews";
import { cn } from "@/lib/utils";

type Rule = {
  id: string;
  alertType: string;
  targetKind: "employee" | "group";
  targetId: string;
  targetName: string;
};

type Targets = {
  employees: { airtableId: string; nombre: string; online: boolean }[];
  groups: { id: string; nombre: string }[];
};

export function AlertRulesDialog({
  alertTypes,
  onClose,
  onSaved,
}: {
  alertTypes: string[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [alertType, setAlertType] = useState(alertTypes[0] ?? "POLIZA_SIN_VIGENCIA");
  const [q, setQ] = useState("");
  const [selEmps, setSelEmps] = useState<Set<string>>(new Set());
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [targetsRes, rulesRes] = await Promise.all([
        fetch("/api/alerts/share-targets").catch(() => null),
        fetch("/api/alerts/rules").catch(() => null),
      ]);
      const targetsData = (await targetsRes?.json().catch(() => null)) as (Targets & { ok?: boolean }) | null;
      const rulesData = (await rulesRes?.json().catch(() => null)) as { ok?: boolean; rules?: Rule[] } | null;
      if (cancelled) return;
      setTargets({ employees: targetsData?.employees ?? [], groups: targetsData?.groups ?? [] });
      setRules(rulesData?.rules ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const current = rules.filter((r) => r.alertType === alertType);
    setSelEmps(new Set(current.filter((r) => r.targetKind === "employee").map((r) => r.targetId)));
    setSelGroups(new Set(current.filter((r) => r.targetKind === "group").map((r) => r.targetId)));
  }, [alertType, rules]);

  const filteredEmps = useMemo(() => {
    if (!targets) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return targets.employees;
    return targets.employees.filter((e) => e.nombre.toLowerCase().includes(needle));
  }, [targets, q]);

  const knownTypes = Array.from(new Set([...alertTypes, ...rules.map((r) => r.alertType)])).sort();
  const total = selEmps.size + selGroups.size;
  // 033 — un destino por tipo (lo exige el backend): elegir uno reemplaza al anterior.
  const pickEmployee = (id: string) => {
    setSelEmps((prev) => (prev.has(id) ? new Set() : new Set([id])));
    setSelGroups(new Set());
  };
  const pickGroup = (id: string) => {
    setSelGroups((prev) => (prev.has(id) ? new Set() : new Set([id])));
    setSelEmps(new Set());
  };
  const typeDisplay =
    alertType === REVIEW_ENVIO_ALERT_TYPE ? REVIEW_ENVIO_ALERT_LABEL : alertType;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertType, empleados: [...selEmps], grupos: [...selGroups] }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { ok?: boolean; rules?: Rule[]; error?: { message?: string } } | null;
      if (!res?.ok || !data?.ok) {
        setError(data?.error?.message ?? "No se pudo guardar la regla.");
        return;
      }
      setRules(data.rules ?? []);
      setDone(total ? `Regla guardada para ${typeDisplay}.` : `Regla vaciada para ${typeDisplay}.`);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4" role="dialog" aria-label="Reglas de alertas">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border bg-background shadow-pop">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Settings2 className="h-4 w-4 text-brand" strokeWidth={1.9} />
            <div>
              <p className="text-[13.5px] font-bold">Reglas por tipo de alerta</p>
              <p className="text-[11.5px] text-text-3">Un destino por tipo: quién ve y gestiona esas alertas.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </header>

        <div className="space-y-3 border-b px-4 py-3">
          <label className="block text-[12px] font-semibold text-text-2">Tipo de alerta</label>
          <select value={alertType} onChange={(e) => setAlertType(e.target.value)} className="h-9 w-full rounded-md border bg-card px-2.5 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {knownTypes.map((t) => (
              <option key={t} value={t}>
                {t === REVIEW_ENVIO_ALERT_TYPE ? `${REVIEW_ENVIO_ALERT_LABEL} — ${t}` : t}
              </option>
            ))}
          </select>
          {alertType === REVIEW_ENVIO_ALERT_TYPE && (
            <p className="text-[11.5px] text-text-3">
              Las tarjetas de aprobación de siniestros del chat interno llegan a este destino. Sin regla: al Propietario.
            </p>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empleado..." className="h-9 w-full rounded-md border bg-card py-1.5 pl-8 pr-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {targets === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-text-3"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : (
            <>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-3">Empleados</p>
              <div className="space-y-1.5">
                {filteredEmps.map((e) => (
                  <button key={e.airtableId} type="button" onClick={() => pickEmployee(e.airtableId)} className={cn("flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px]", selEmps.has(e.airtableId) ? "border-brand bg-brand-tint" : "hover:bg-accent")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold", selEmps.has(e.airtableId) ? "border-brand bg-brand text-brand-fg" : "border-border-strong")}>{selEmps.has(e.airtableId) ? "✓" : ""}</span>
                    <span className="truncate">{e.nombre}</span>
                  </button>
                ))}
              </div>
              <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-3">Grupos</p>
              <div className="space-y-1.5">
                {targets.groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => pickGroup(g.id)} className={cn("flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px]", selGroups.has(g.id) ? "border-brand bg-brand-tint" : "hover:bg-accent")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold", selGroups.has(g.id) ? "border-brand bg-brand text-brand-fg" : "border-border-strong")}>{selGroups.has(g.id) ? "✓" : ""}</span>
                    <Hash className="h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.9} />
                    <span className="truncate">{g.nombre}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t px-4 py-3">
          {error ? <p className="mr-auto text-[12px] text-danger-text">{error}</p> : done ? <p className="mr-auto inline-flex items-center gap-1 text-[12px] text-success-text"><CheckCircle2 className="h-3.5 w-3.5" />{done}</p> : <p className="mr-auto text-[12px] text-text-3">{total ? `${total} destino${total === 1 ? "" : "s"}` : alertType === REVIEW_ENVIO_ALERT_TYPE ? "Sin destino: las revisiones de siniestro caen al Propietario" : "Sin destinos: este tipo queda sin asignación automática"}</p>}
          <button onClick={() => void save()} disabled={saving} className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg hover:opacity-90 disabled:opacity-40">
            {saving ? "Guardando…" : "Guardar regla"}
          </button>
        </footer>
      </div>
    </div>
  );
}
