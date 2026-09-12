"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TodayOffice = {
  officeId: string;
  displayName: string;
  locality: string | null;
  selectedAt: string;
};

type OfficeRow = { id: string; displayName: string; locality?: string | null };

/**
 * 023 — Sucursal del día.
 *
 * El empleado rota entre oficinas: al entrar al CRM se le pregunta dónde
 * trabaja hoy (una vez; se puede posponer con "Después") y queda el registro
 * diario empleado | fecha | oficina. El botón del nav muestra la sucursal
 * actual y permite cambiarla durante el día.
 */
export function OfficeTodayPicker() {
  const [today, setToday] = useState<TodayOffice | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askedRef = useRef(false);

  const loadOffices = useCallback(async () => {
    const res = await fetch("/api/offices").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as {
      offices: OfficeRow[];
    } | null;
    setOffices(data?.offices ?? []);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/office").catch(() => null);
    if (!res?.ok) {
      setToday(null);
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      today: TodayOffice | null;
    } | null;
    const t = data?.today ?? null;
    setToday(t);
    // Al entrar sin sucursal marcada hoy, se pregunta una vez por pantalla.
    if (!t && !askedRef.current) {
      askedRef.current = true;
      void loadOffices();
      setOpen(true);
    }
  }, [loadOffices]);

  useEffect(() => {
    void load();
  }, [load]);

  function openPicker() {
    setError(null);
    setOpen(true);
    if (offices.length === 0) void loadOffices();
  }

  async function choose(officeId: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const data = res
          ? ((await res.json().catch(() => null)) as {
              error?: { message?: string };
            } | null)
          : null;
        setError(data?.error?.message ?? "No se pudo guardar la sucursal");
        return;
      }
      const data = (await res.json()) as { today: TodayOffice };
      setToday(data.today);
      setOpen(false);
      setQuery("");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offices;
    return offices.filter((o) => o.displayName.toLowerCase().includes(q));
  }, [offices, query]);

  return (
    <>
      <button
        onClick={openPicker}
        title="Sucursal de hoy — clic para cambiar"
        className={cn(
          "flex items-center gap-[10px] rounded-sm px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-accent",
          today ? "text-text-2" : "text-brand-text"
        )}
      >
        <Building2
          className={cn(
            "h-[17px] w-[17px]",
            today ? "text-text-3" : "text-brand"
          )}
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate">
          {today === undefined
            ? "Sucursal…"
            : today
              ? `Sucursal: ${today.displayName}`
              : "Elegir sucursal (hoy)"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4">
          <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-md border bg-background shadow-pop">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-[15px] font-bold">
                  {today
                    ? "Cambiar sucursal de hoy"
                    : "¿En qué sucursal estás hoy?"}
                </h3>
                <p className="mt-0.5 text-[11.5px] text-text-3">
                  Queda registrada la sucursal por día.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-text-3 hover:bg-accent"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </header>

            <div className="border-b px-4 py-2.5">
              <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-text-3" strokeWidth={2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar sucursal…"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
                />
              </div>
              {error && (
                <p className="mt-1.5 text-[12px] font-semibold text-red-600">
                  {error}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-[12.5px] text-text-3">
                  No hay sucursales para mostrar.
                </p>
              )}
              {filtered.map((o) => {
                const current = today?.officeId === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => void choose(o.id)}
                    disabled={saving}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-accent disabled:opacity-50",
                      current && "bg-accent"
                    )}
                  >
                    <Building2
                      className={cn(
                        "h-4 w-4 shrink-0",
                        current ? "text-brand" : "text-text-3"
                      )}
                      strokeWidth={1.8}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {o.displayName}
                      </span>
                      {o.locality && (
                        <span className="block truncate text-[11.5px] text-text-3">
                          {o.locality}
                        </span>
                      )}
                    </span>
                    {current && (
                      <span className="shrink-0 text-[11px] font-semibold text-brand-text">
                        Hoy
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <footer className="flex justify-end border-t px-4 py-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-accent"
              >
                Después
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
