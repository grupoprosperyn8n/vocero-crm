"use client";

/**
 * 041 — Ajustes → Propuestas comerciales: la configuración por TIPO de
 * sugerencia (retención, venta cruzada, renovación…): textos, foto de la
 * publicidad, logo del emisor (Rafael Allende), oferta y descuento/beneficio
 * para el CTA. Todo esto es lo que hereda cada propuesta al crearse.
 *
 * 042e — Los tipos se administran desde acá: se pueden CREAR tipos propios
 * (con nombre visible) y cargarle a cada uno su GUÍA del asistente (system
 * prompt de la acción comercial: renovación, captación, lanzamiento…).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  PROPOSAL_KINDS,
  type ProductOptionDto,
  type ProposalTemplateDto,
} from "@/lib/types";
import {
  DEFAULT_KIND_PROMPTS,
  GENERIC_KIND_PROMPT,
} from "@/lib/proposals/kind-prompts";

type Draft = {
  label: string;
  aiPrompt: string;
  title: string;
  subtitle: string;
  body: string;
  productName: string;
  productRef: string;
  offer: string;
  benefit: string;
  ctaLabel: string;
  ctaUrl: string;
  ctaKind: "link" | "pdf" | "agenda";
  assetId: string | null;
  logoAssetId: string | null;
};

const EMPTY: Draft = {
  label: "",
  aiPrompt: "",
  title: "",
  subtitle: "",
  body: "",
  productName: "",
  productRef: "",
  offer: "",
  benefit: "",
  ctaLabel: "",
  ctaUrl: "",
  ctaKind: "link",
  assetId: null,
  logoAssetId: null,
};

function toDraft(t: ProposalTemplateDto): Draft {
  return {
    label: t.label ?? "",
    aiPrompt: t.aiPrompt ?? "",
    title: t.title,
    subtitle: t.subtitle ?? "",
    body: t.body,
    productName: t.productName ?? "",
    productRef: t.productRef ?? "",
    offer: t.offer ?? "",
    benefit: t.benefit ?? "",
    ctaLabel: t.ctaLabel ?? "",
    ctaUrl: t.ctaUrl ?? "",
    ctaKind: t.ctaKind,
    assetId: t.assetId ?? null,
    logoAssetId: t.logoAssetId ?? null,
  };
}

/** Los tipos del catálogo tienen etiqueta y emoji propios; los propios, su nombre. */
function kindFace(kind: string, tpl?: ProposalTemplateDto): { emoji: string; label: string } {
  const base = PROPOSAL_KINDS.find((k) => k.id === kind);
  return {
    emoji: base?.emoji ?? "🎯",
    label: tpl?.label?.trim() || base?.label || kind,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function ProposalsSettings() {
  const [templates, setTemplates] = useState<ProposalTemplateDto[] | null>(null);
  const [role, setRole] = useState<string>("member");
  const [kind, setKind] = useState<string>(PROPOSAL_KINDS[0].id);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedKind, setSavedKind] = useState<string | null>(null);
  // 042e — creación de tipos propios
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // 042f — productos: catálogo para el selector (sistema + mini tabla del CRM)
  const [products, setProducts] = useState<ProductOptionDto[]>([]);
  const [productsOk, setProductsOk] = useState(true);

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/proposals/products", { cache: "no-store" }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as { products?: ProductOptionDto[]; systemOk?: boolean })
      : {};
    setProducts(data.products ?? []);
    setProductsOk(data.systemOk !== false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/proposals/templates", { cache: "no-store" }).catch(() => null);
      const data = res
        ? ((await res.json().catch(() => ({}))) as {
            templates?: ProposalTemplateDto[];
            viewer?: { role?: string };
          })
        : null;
      setTemplates(data?.templates ?? []);
      setRole(data?.viewer?.role ?? "member");
      const map: Record<string, Draft> = {};
      for (const t of data?.templates ?? []) map[t.kind] = toDraft(t);
      setDrafts(map);
      const first = data?.templates?.[0];
      if (first) {
        setImagePreview(first.assetId ? `/api/public/propuesta/img/${first.assetId}` : null);
        setLogoPreview(first.logoAssetId ? `/api/public/propuesta/img/${first.logoAssetId}` : null);
      }
    })();
  }, []);

  const current = drafts[kind] ?? EMPTY;
  const canEdit = role === "owner" || role === "admin";
  const isCatalog = PROPOSAL_KINDS.some((k) => k.id === kind);
  const currentTpl = (templates ?? []).find((t) => t.kind === kind);
  const face = kindFace(kind, currentTpl);
  const suggested = DEFAULT_KIND_PROMPTS[kind] ?? GENERIC_KIND_PROMPT;

  const switchKind = (k: string) => {
    setKind(k);
    setSavedKind(null);
    setError("");
    const d = drafts[k];
    setImagePreview(d?.assetId ? `/api/public/propuesta/img/${d.assetId}` : null);
    setLogoPreview(d?.logoAssetId ? `/api/public/propuesta/img/${d.logoAssetId}` : null);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDrafts((prev) => ({ ...prev, [kind]: { ...(prev[kind] ?? EMPTY), [key]: value } }));

  const createKind = () => {
    const name = newName.trim();
    const slug = slugify(name);
    if (!name || slug.length < 2) {
      setError("Poné un nombre de tipo de al menos 2 letras.");
      return;
    }
    if ((templates ?? []).some((t) => t.kind === slug) || PROPOSAL_KINDS.some((k) => k.id === slug)) {
      setError("Ya existe un tipo con ese nombre.");
      return;
    }
    const tpl: ProposalTemplateDto = {
      id: null,
      kind: slug,
      label: name,
      aiPrompt: null,
      productRef: null,
      title: "",
      subtitle: null,
      body: "",
      productName: null,
      offer: null,
      benefit: null,
      ctaLabel: null,
      ctaUrl: null,
      ctaKind: "link",
      assetId: null,
      logoAssetId: null,
      hasImage: false,
      hasLogo: false,
      updatedAt: null,
    };
    setTemplates((prev) => [...(prev ?? []), tpl]);
    setDrafts((prev) => ({ ...prev, [slug]: { ...EMPTY, label: name } }));
    setCreating(false);
    setNewName("");
    switchKind(slug);
  };

  const deleteKind = async () => {
    if (isCatalog) return;
    if (!window.confirm(`¿Eliminar el tipo «${face.label}»? No se puede deshacer.`)) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/proposals/templates", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }) : null;
    setBusy(false);
    if (!res?.ok || !data?.ok) {
      setError(data?.message ?? "No se pudo eliminar el tipo");
      return;
    }
    setTemplates((prev) => (prev ?? []).filter((t) => t.kind !== kind));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    switchKind(PROPOSAL_KINDS[0].id);
  };

  const upload = (file: File, target: "assetId" | "logoAssetId") => {
    setError("");
    if (file.size > 8_000_000) {
      setError("La imagen no puede pasar de 8 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? "");
      const res = await fetch("/api/proposals/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mime: file.type || "image/png",
          filename: file.name,
          data: dataUrl.split(",")[1] ?? "",
        }),
      }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { id?: string; message?: string }) : null;
      if (!res?.ok || !data?.id) {
        setError(data?.message ?? "No se pudo subir la imagen");
        return;
      }
      set(target, data.id);
      if (target === "assetId") setImagePreview(dataUrl);
      else setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setSavedKind(null);
    const res = await fetch("/api/proposals/templates", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        label: current.label.trim() || null,
        aiPrompt: current.aiPrompt.trim() || null,
        productRef: current.productRef || null,
        title: current.title,
        subtitle: current.subtitle || null,
        body: current.body,
        productName: current.productName || null,
        offer: current.offer || null,
        benefit: current.benefit || null,
        ctaLabel: current.ctaLabel || null,
        ctaUrl: current.ctaUrl || null,
        ctaKind: current.ctaKind,
        assetId: current.assetId,
        logoAssetId: current.logoAssetId,
      }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { template?: ProposalTemplateDto; message?: string }) : null;
    setBusy(false);
    if (!res?.ok || !data?.template) {
      setError(data?.message ?? "No se pudo guardar la plantilla");
      return;
    }
    setSavedKind(kind);
    setTemplates((prev) => {
      const list = prev ?? [];
      const exists = list.some((t) => t.kind === kind);
      return exists ? list.map((t) => (t.kind === kind ? data.template! : t)) : [...list, data.template!];
    });
  };

  if (templates === null) {
    return (
      <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-text-3">
        <Loader2 size={15} className="animate-spin" /> Cargando plantillas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {templates.map((t) => {
          const f = kindFace(t.kind, t);
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => switchKind(t.kind)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                kind === t.kind ? "border-brand-soft bg-brand-tint text-brand-text" : "bg-card text-text-2 hover:bg-subtle"
              }`}
            >
              {f.emoji} {f.label}
            </button>
          );
        })}
        {canEdit && !creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError("");
            }}
            className="flex items-center gap-1 rounded-lg border border-dashed border-brand-soft px-3 py-1.5 text-[12.5px] font-semibold text-brand-text hover:bg-brand-tint"
          >
            <Plus size={13} /> Nuevo tipo
          </button>
        )}
        {canEdit && creating && (
          <span className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createKind();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder="Nombre del tipo (ej.: Siniestros)"
              className="w-48 rounded border bg-subtle/40 px-2 py-1 text-[12.5px]"
            />
            <button
              type="button"
              onClick={createKind}
              className="rounded bg-brand px-2.5 py-1 text-[12px] font-bold text-white hover:opacity-90"
            >
              Crear
            </button>
          </span>
        )}
      </div>

      <p className="text-[12.5px] text-text-3">
        Esta es la pieza que se genera por cada tipo de sugerencia: todo lo de acá se hereda al crear una
        propuesta desde el panel de un cliente (después se puede ajustar caso por caso). La <b>guía</b> es lo
        que usa el asistente de IA para escribir como experto en esa acción comercial.
      </p>

      {!canEdit && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          Solo el propietario o un administrador pueden guardar cambios.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={current.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder={`Nombre visible del tipo (${face.label})`}
              disabled={!canEdit}
              className="rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold"
            />
            <div className="flex items-center rounded-lg border bg-subtle/30 px-3 py-2 text-[11.5px] text-text-3">
              Se guarda como <span className="mx-1 font-mono font-semibold text-text-2">{kind}</span>
            </div>
          </div>
          <input
            value={current.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Título de la publicidad"
            disabled={!canEdit}
            className="w-full rounded-lg border bg-card px-3 py-2 text-[13px] font-semibold"
          />
          <input
            value={current.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            placeholder="Subtítulo"
            disabled={!canEdit}
            className="w-full rounded-lg border bg-card px-3 py-2 text-[13px]"
          />
          <textarea
            value={current.body}
            onChange={(e) => set("body", e.target.value)}
            rows={3}
            placeholder="Mensaje"
            disabled={!canEdit}
            className="w-full rounded-lg border bg-card px-3 py-2 text-[13px]"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="min-w-0">
              <input
                value={current.productName}
                onChange={(e) => {
                  const v = e.target.value;
                  const m = products.find((p) => p.name === v.trim());
                  set("productName", v);
                  set("productRef", m ? m.ref : "");
                }}
                placeholder="Tipo de producto"
                list="ajustes-productos"
                disabled={!canEdit}
                className="w-full rounded-lg border bg-card px-3 py-2 text-[12.5px]"
              />
              <datalist id="ajustes-productos">
                {products.map((p) => (
                  <option key={p.ref} value={p.name}>
                    {p.source === "crm" ? "CRM" : "Sistema"}
                  </option>
                ))}
              </datalist>
            </div>
            <input
              value={current.offer}
              onChange={(e) => set("offer", e.target.value)}
              placeholder="Oferta"
              disabled={!canEdit}
              className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
            />
            <input
              value={current.benefit}
              onChange={(e) => set("benefit", e.target.value)}
              placeholder="Descuento o beneficio"
              disabled={!canEdit}
              className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={current.ctaLabel}
              onChange={(e) => set("ctaLabel", e.target.value)}
              placeholder="Texto del botón"
              disabled={!canEdit}
              className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
            />
            <input
              value={current.ctaUrl}
              onChange={(e) => set("ctaUrl", e.target.value)}
              placeholder="URL del CTA (https://… o PDF)"
              disabled={!canEdit}
              className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
            />
            <select
              value={current.ctaKind}
              onChange={(e) => set("ctaKind", e.target.value as "link" | "pdf" | "agenda")}
              disabled={!canEdit}
              className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
            >
              <option value="link">Enlace web</option>
              <option value="pdf">URL de PDF</option>
              <option value="agenda">Videollamada (agenda)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-text-2">
                <Sparkles size={14} className="text-brand-text" />
                Guía del asistente para esta acción comercial
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => set("aiPrompt", suggested)}
                  className="rounded-lg border border-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand-text hover:bg-brand-tint"
                >
                  Usar la sugerida
                </button>
              )}
            </div>
            <textarea
              value={current.aiPrompt}
              onChange={(e) => set("aiPrompt", e.target.value)}
              rows={6}
              placeholder={`Vacío = se usa la guía sugerida:\n\n${suggested}`}
              disabled={!canEdit}
              className="w-full rounded-lg border bg-subtle/30 px-3 py-2 text-[12.5px] leading-relaxed"
            />
            <p className="mt-1.5 text-[11.5px] text-text-3">
              Se la pasamos al asistente cuando escribe la publicidad de este tipo: rol de experto, jugada
              comercial y qué evitar. La guía vacía usa la sugerida de fábrica.
            </p>
          </div>

          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card p-3 text-[12px] font-semibold text-text-2 hover:bg-subtle">
              <ImageIcon size={16} className="text-text-3" />
              {imagePreview ? "Cambiar foto de la publicidad" : "Subir foto de la publicidad"}
              <input
                type="file"
                accept="image/*"
                disabled={!canEdit}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, "assetId");
                }}
              />
            </label>
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card p-3 text-[12px] font-semibold text-text-2 hover:bg-subtle">
              <ImageIcon size={16} className="text-text-3" />
              {logoPreview ? "Cambiar logo del emisor" : "Subir logo del emisor (RA)"}
              <input
                type="file"
                accept="image/*"
                disabled={!canEdit}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, "logoAssetId");
                }}
              />
            </label>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-subtle/40 p-3">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo" className="h-10 max-w-[140px] rounded border bg-card object-contain" />
            ) : (
              <span className="text-[11.5px] text-text-3">Sin logo cargado</span>
            )}
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Publicidad" className="h-20 max-w-[260px] rounded border object-cover" />
            ) : (
              <span className="text-[11.5px] text-text-3">Sin foto de publicidad cargada</span>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-[12.5px] font-semibold text-danger-text">{error}</p>}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar {face.label}
          </button>
          {savedKind === kind && (
            <span className="text-[12.5px] font-semibold text-emerald-700">✓ Guardado</span>
          )}
          {!isCatalog && (
            <button
              type="button"
              onClick={() => void deleteKind()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-danger-text/30 px-3 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger-text/10 disabled:opacity-50"
            >
              <Trash2 size={13} /> Eliminar tipo
            </button>
          )}
        </div>
      )}
      {!isCatalog && (
        <p className="text-[11.5px] text-text-3">
          «{face.label}» es un tipo propio: se elimina solo si ninguna publicidad lo está usando.
        </p>
      )}

      <ProductsMiniTable
        products={products}
        productsOk={productsOk}
        canEdit={canEdit}
        reload={loadProducts}
      />
    </div>
  );
}

/**
 * 042f — Mini tabla de productos: el menú de «Tipo de producto» de la
 * publicidad. Arriba los del SISTEMA (tabla PRODUCTOS de Airtable, solo
 * lectura: acá no se tocan) y abajo los propios del CRM, editables.
 */
function ProductsMiniTable({
  products,
  productsOk,
  canEdit,
  reload,
}: {
  products: ProductOptionDto[];
  productsOk: boolean;
  canEdit: boolean;
  reload: () => Promise<void>;
}) {
  const system = products.filter((p) => p.source === "sistema");
  const local = products.filter((p) => p.source === "crm");
  const [newIcon, setNewIcon] = useState("");
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, { icon: string; name: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const add = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      setErr("Poné un nombre de producto de al menos 2 letras.");
      return;
    }
    setBusy("new");
    setErr("");
    const res = await fetch("/api/proposals/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, icon: newIcon.trim() || null }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : null;
    setBusy(null);
    if (!res?.ok) {
      setErr(data?.message ?? "No se pudo crear el producto");
      return;
    }
    setNewIcon("");
    setNewName("");
    await reload();
  };

  const saveRow = async (p: ProductOptionDto) => {
    const d = edits[p.ref];
    if (!d) return;
    setBusy(p.ref);
    setErr("");
    const res = await fetch("/api/proposals/products", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.ref, name: d.name.trim(), icon: d.icon.trim() || null }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : null;
    setBusy(null);
    if (!res?.ok) {
      setErr(data?.message ?? "No se pudo guardar el producto");
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      delete next[p.ref];
      return next;
    });
    await reload();
  };

  const remove = async (p: ProductOptionDto) => {
    if (!window.confirm(`¿Eliminar «${p.name}» de los productos del CRM?`)) return;
    setBusy(p.ref);
    setErr("");
    const res = await fetch("/api/proposals/products", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.ref }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : null;
    setBusy(null);
    if (!res?.ok) {
      setErr(data?.message ?? "No se pudo eliminar el producto");
      return;
    }
    await reload();
  };

  const rowEdit = (p: ProductOptionDto) =>
    edits[p.ref] ?? { icon: p.icon ?? "", name: p.name };

  const setRowEdit = (p: ProductOptionDto, patch: Partial<{ icon: string; name: string }>) =>
    setEdits((prev) => ({ ...prev, [p.ref]: { ...rowEdit(p), ...patch } }));

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <Package size={15} className="text-brand-text" />
        <h3 className="text-[13px] font-bold">Productos (mini tabla)</h3>
        <span className="text-[11.5px] text-text-3">
          De acá sale el menú de «Tipo de producto» de la publicidad.
        </span>
      </div>

      {!productsOk && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700">
          El sistema (Airtable) no respondió: se muestran solo los productos del CRM.
        </p>
      )}

      {system.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {system.map((p) => (
            <span
              key={p.ref}
              className="flex items-center gap-1 rounded-lg border bg-subtle/40 px-2 py-1 text-[12px]"
              title="Producto del sistema (Airtable) — solo lectura"
            >
              {p.icon && <span>{p.icon}</span>}
              <span className="font-semibold text-text-2">{p.name}</span>
              <span className="rounded bg-subtle px-1 py-px text-[9.5px] font-bold uppercase text-text-3">
                Sistema
              </span>
            </span>
          ))}
        </div>
      )}
      {system.length === 0 && productsOk && (
        <p className="text-[11.5px] text-text-3">El sistema no tiene productos cargados.</p>
      )}

      {local.length > 0 ? (
        <div className="divide-y rounded-lg border">
          {local.map((p) => {
            const d = rowEdit(p);
            const dirty = d.name !== p.name || d.icon !== (p.icon ?? "");
            return (
              <div key={p.ref} className="flex items-center gap-1.5 p-1.5">
                <input
                  value={d.icon}
                  onChange={(e) => setRowEdit(p, { icon: e.target.value })}
                  placeholder="🙂"
                  disabled={!canEdit}
                  className="w-11 rounded border bg-subtle/40 px-1.5 py-1 text-center text-[13px]"
                  aria-label="Emoji"
                />
                <input
                  value={d.name}
                  onChange={(e) => setRowEdit(p, { name: e.target.value })}
                  disabled={!canEdit}
                  className="min-w-0 flex-1 rounded border bg-subtle/40 px-2 py-1 text-[12.5px] font-semibold"
                  aria-label="Nombre del producto"
                />
                <span className="rounded bg-subtle px-1 py-px text-[9.5px] font-bold uppercase text-text-3">
                  CRM
                </span>
                {canEdit && dirty && (
                  <button
                    type="button"
                    onClick={() => void saveRow(p)}
                    disabled={busy === p.ref}
                    className="flex items-center gap-1 rounded bg-brand px-2 py-1 text-[11.5px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === p.ref ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
                    Guardar
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(p)}
                    disabled={busy === p.ref}
                    className="rounded border border-danger-text/30 p-1.5 text-danger-text hover:bg-danger-text/10 disabled:opacity-50"
                    title="Eliminar producto del CRM"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11.5px] text-text-3">
          Todavía no hay productos propios del CRM. Creá el primero acá abajo.
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-1.5">
          <input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="🙂"
            className="w-11 rounded-lg border bg-subtle/40 px-1.5 py-1.5 text-center text-[13px]"
            aria-label="Emoji del producto nuevo"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            placeholder="Producto nuevo (ej.: Cobertura de viaje)"
            className="min-w-0 flex-1 rounded-lg border bg-subtle/40 px-2 py-1.5 text-[12.5px]"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy === "new"}
            className="flex items-center gap-1 rounded-lg border border-dashed border-brand-soft px-3 py-1.5 text-[12px] font-bold text-brand-text hover:bg-brand-tint disabled:opacity-50"
          >
            {busy === "new" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Agregar
          </button>
        </div>
      )}
      {!canEdit && (
        <p className="text-[11.5px] text-text-3">
          Para crear o editar productos del CRM necesitás ser propietario o administrador.
        </p>
      )}
      {err && <p className="text-[12px] font-semibold text-danger-text">{err}</p>}
      <p className="text-[11px] text-text-3">
        Los productos del <b>Sistema</b> vienen de la tabla PRODUCTOS de Airtable y acá son solo lectura;
        los del <b>CRM</b> se crean, editan y eliminan desde esta mini tabla. El CRM nunca escribe en Airtable.
      </p>
    </div>
  );
}
