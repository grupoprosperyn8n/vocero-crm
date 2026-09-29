"use client";

/*
 * 044b Bloque 4 — Constructor de publicaciones (subpestaña de Marketing).
 *
 * Wizard en pasos al estilo de la maqueta 044, montado sobre la maquinaria
 * REAL del CRM (cero duplicación de reglas):
 *   · /api/clients/search        → elegir el cliente del sistema (SGSA)
 *   · /api/proposals/products    → menú de productos (sistema + CRM)
 *   · /api/proposals/companies   → compañías auspiciantes
 *   · /api/proposals/assets      → subir fotos y video de la publicidad
 *   · POST /api/proposals        → crear la pieza (borrador, con su link /p/)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  Wand2,
  X,
} from "lucide-react";

import { LibraryPicker } from "./library-picker";

import { ANGLE_IDS, ANGLES, TONE_IDS, TONES, type ProposalAngleId, type ProposalToneId } from "@/lib/proposals/copy";
import { PROPOSAL_KINDS, type SystemClientSearchResultDto } from "@/lib/types";
import { cn, systemClientName } from "@/lib/utils";
import { ProposalPostPanel } from "./proposal-post";

type ClienteSistema = SystemClientSearchResultDto["client"];

type MediaItem = { id: string; mime: string; url: string; name: string };
type ProductoOpcion = { id: string; name: string };
type CompaniaOpcion = { id: string; name: string };

type Creada = { id: string; token: string; publicUrl: string };

const PASOS = ["Cliente", "Publicación", "Fotos y video", "Vista y creada"] as const;
const MAX_MEDIA = 8;

const inputClass =
  "h-9 w-full rounded-md border border-border-strong bg-background px-2.5 text-[12.5px] text-text";

export type ClienteFijoWizard = {
  recordId: string;
  nombre: string;
  apellido?: string | null;
  dni?: string | null;
  telefono?: string | null;
};

export function ConstructorPanel({
  onGoToProposals,
  clienteFijo,
  kindDefault,
  embebido = false,
  onCreated,
  onOpenInbox,
  onQuitarClienteFijo,
}: {
  onGoToProposals?: () => void;
  /** Modo Cliente 360: el cliente ya está elegido y el wizard arranca en «Publicación». */
  clienteFijo?: ClienteFijoWizard;
  kindDefault?: string;
  embebido?: boolean;
  onCreated?: (proposal: Record<string, unknown>) => void;
  /** B9 — abrir el chat con el borrador (lo usa el panel post-creación). */
  onOpenInbox?: (input: {
    contactId: string | null;
    draft: string;
    attach?: string | null;
  }) => void;
  /** 044b B9b — quitar el cliente fijo (el wizard vuelve a elegir destinatario). */
  onQuitarClienteFijo?: () => void;
}) {
  const pasoInicial = clienteFijo ? 1 : 0;
  const [paso, setPaso] = useState(pasoInicial);

  /* Paso 1 · cliente */
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<SystemClientSearchResultDto[]>([]);
  const [cliente, setCliente] = useState<ClienteSistema | null>(null);
  const [buscoAlMenosUnaVez, setBuscoAlMenosUnaVez] = useState(false);
  /* Destinatario: cliente del sistema · contacto del CRM · grupo o persona sin ficha. */
  const [modo, setModo] = useState<"sistema" | "libre" | "crm">("sistema");
  const [libreNombre, setLibreNombre] = useState("");
  /* B8 — contactos del CRM (prospectos nuevos: escribieron por WhatsApp). */
  const [crmQ, setCrmQ] = useState("");
  const [crmResultados, setCrmResultados] = useState<
    Array<{ id: string; name: string; phone: string | null; stageName?: string | null }>
  >([]);
  const [crmBuscando, setCrmBuscando] = useState(false);
  const [crmContactId, setCrmContactId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Paso 2 · publicación */
  const [kind, setKind] = useState<string>(kindDefault ?? PROPOSAL_KINDS[0].id);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    body: "",
    benefit: "",
    offer: "",
    productRef: "",
    productName: "",
    companyRef: "",
    companyName: "",
    ctaLabel: "",
    ctaUrl: "",
    ctaKind: "link" as "link" | "pdf" | "agenda",
  });
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [companias, setCompanias] = useState<CompaniaOpcion[]>([]);
  const [cargandoMenus, setCargandoMenus] = useState(true);
  /* Textos base por tipo (los mismos que usa el Cliente 360°). */
  const [plantillas, setPlantillas] = useState<
    Array<{
      kind: string;
      label?: string | null;
      title?: string;
      subtitle?: string | null;
      body?: string;
      productName?: string | null;
      productRef?: string | null;
      offer?: string | null;
      benefit?: string | null;
      ctaLabel?: string | null;
      ctaUrl?: string | null;
      ctaKind?: "link" | "pdf" | "agenda";
      assetId?: string | null;
      logoAssetId?: string | null;
    }>
  >([]);

  /* Logo del emisor + contenedor universal (biblioteca), igual que el panel real. */
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<null | "media" | "logo">(null);

  /* Paso 3 · medios */
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);

  /* Paso 4 · crear */
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState<Creada | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Asistente de IA (041c) — misma mecánica que el Cliente 360°: tono +
     concepto de venta + indicaciones libres escriben la pieza y el mensaje. */
  const [tone, setTone] = useState<ProposalToneId>("cercana");
  const [angle, setAngle] = useState<ProposalAngleId | null>("beneficio");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiBusy, setAiBusy] = useState<null | "pieza" | "mensaje">(null);
  const [aiNotas, setAiNotas] = useState<string | null>(null);
  const [prevForm, setPrevForm] = useState<typeof form | null>(null);

  /* Menús reales de productos y compañías + textos base (best-effort). */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [p, c, t] = await Promise.all([
        fetch("/api/proposals/products", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/proposals/companies", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/proposals/templates", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!vivo) return;
      const pl = (p as { products?: Array<Record<string, unknown>> } | null)?.products;
      if (Array.isArray(pl)) {
        setProductos(
          pl
            .map((x) => ({ id: String(x.ref ?? x.id ?? ""), name: String(x.name ?? "").trim() }))
            .filter((x) => x.id && x.name)
        );
      }
      const cl = (c as { companies?: Array<Record<string, unknown>> } | null)?.companies;
      if (Array.isArray(cl)) {
        setCompanias(
          cl
            .map((x) => ({ id: String(x.id ?? x.ref ?? ""), name: String(x.name ?? "").trim() }))
            .filter((x) => x.id && x.name)
        );
      }
      const tl = (t as { templates?: Array<Record<string, unknown>> } | null)?.templates;
      if (Array.isArray(tl)) {
        setPlantillas(
          tl
            .map((x) => ({
              kind: String(x.kind ?? ""),
              label: x.label ? String(x.label) : null,
              title: x.title ? String(x.title) : "",
              subtitle: x.subtitle ? String(x.subtitle) : "",
              body: x.body ? String(x.body) : "",
              productName: x.productName ? String(x.productName) : "",
              productRef: x.productRef ? String(x.productRef) : "",
              offer: x.offer ? String(x.offer) : "",
              benefit: x.benefit ? String(x.benefit) : "",
              ctaLabel: x.ctaLabel ? String(x.ctaLabel) : "",
              ctaUrl: x.ctaUrl ? String(x.ctaUrl) : "",
              ctaKind: (x.ctaKind === "pdf" || x.ctaKind === "agenda" ? x.ctaKind : "link") as
                | "link"
                | "pdf"
                | "agenda",
              assetId: x.assetId ? String(x.assetId) : null,
              logoAssetId: x.logoAssetId ? String(x.logoAssetId) : null,
            }))
            .filter((x) => x.kind)
        );
      }
      setCargandoMenus(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /* Búsqueda de clientes con debounce contra el sistema de seguros. */
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (cliente || term.length < 2) {
      setResultados([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      setBuscoAlMenosUnaVez(true);
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      setBuscando(false);
      setResultados(
        ((res as { results?: SystemClientSearchResultDto[] } | null)?.results ?? []).slice(0, 8)
      );
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, cliente]);

  /* B8 — búsqueda de contactos del CRM (prospectos nuevos) con debounce. */
  useEffect(() => {
    const term = crmQ.trim();
    if (modo !== "crm" || term.length < 2) {
      setCrmResultados([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setCrmBuscando(true);
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!alive) return;
      setCrmBuscando(false);
      setCrmResultados(
        (
          (res as
            | {
                contacts?: Array<{
                  id: string;
                  name: string;
                  phone: string | null;
                  stageName?: string | null;
                }>;
              }
            | null)?.contacts ?? []
        ).slice(0, 8)
      );
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [modo, crmQ]);

  const set = (campo: keyof typeof form) => (valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  /* 041c — la IA escribe la pieza con el tono y el concepto elegidos. Nunca
     pisa el texto sin vuelta atrás: guarda el anterior para «Deshacer». */
  const aiWrite = async () => {
    if (!cliente) return;
    setAiBusy("pieza");
    setError(null);
    const companyName = companias.find((c) => c.id === form.companyRef)?.name ?? "";
    const res = await fetch("/api/proposals/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "pieza",
        tone,
        angle,
        instructions: aiInstructions.trim() || null,
        clientName: systemClientName(cliente),
        kind,
        productName: form.productName,
        companyName,
        title: form.title,
        subtitle: form.subtitle,
        body: form.body,
        offer: form.offer,
        benefit: form.benefit,
      }),
    }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          copy?: {
            title?: string;
            subtitle?: string;
            body?: string;
            offer?: string;
            benefit?: string;
            notes?: string;
          };
          error?: { message?: string };
          message?: string;
        })
      : null;
    setAiBusy(null);
    if (!res?.ok || !data?.copy) {
      setError(data?.error?.message ?? data?.message ?? "No se pudo escribir con IA");
      return;
    }
    const copy = data.copy;
    setPrevForm(form);
    setForm((f) => ({
      ...f,
      title: copy.title ?? f.title,
      subtitle: copy.subtitle ?? f.subtitle,
      body: copy.body ?? f.body,
      offer: copy.offer ?? f.offer,
      benefit: copy.benefit ?? f.benefit,
    }));
    setAiNotas(copy.notes ?? null);
  };


  const subirArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMediaError(null);
    const lista = Array.from(files);
    const espacio = MAX_MEDIA - media.length;
    if (espacio <= 0) {
      setMediaError(`Máximo ${MAX_MEDIA} archivos por publicación.`);
      return;
    }
    setSubiendo(true);
    const subidos: MediaItem[] = [];
    for (const file of lista.slice(0, espacio)) {
      if (file.size > 30 * 1024 * 1024) {
        setMediaError(`«${file.name}» pesa más de 30 MB: achicalo e intentá de nuevo.`);
        continue;
      }
      if (
        file.type.startsWith("video/") &&
        (media.some((m) => m.mime.startsWith("video/")) ||
          subidos.some((m) => m.mime.startsWith("video/")))
      ) {
        setMediaError("La publicidad lleva UN video: quitá el que está para cambiarlo");
        continue;
      }
      const dataUrl = await new Promise<string | null>((resolve) => {
        const lector = new FileReader();
        lector.onload = () => resolve(typeof lector.result === "string" ? lector.result : null);
        lector.onerror = () => resolve(null);
        lector.readAsDataURL(file);
      });
      const base64 = dataUrl?.split(",")[1];
      if (!base64) {
        setMediaError(`No se pudo leer «${file.name}».`);
        continue;
      }
      const res = await fetch("/api/proposals/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mime: file.type || "application/octet-stream",
          filename: file.name,
          data: base64,
          purpose: "media",
        }),
      }).catch(() => null);
      const json = res ? ((await res.json().catch(() => null)) as { id?: string; url?: string; message?: string } | null) : null;
      if (!res?.ok || !json?.id || !json.url) {
        setMediaError(json?.message ?? `No se pudo guardar «${file.name}».`);
        continue;
      }
      subidos.push({ id: json.id, mime: file.type, url: json.url, name: file.name });
    }
    if (subidos.length > 0) setMedia((prev) => [...prev, ...subidos].slice(0, MAX_MEDIA));
    setSubiendo(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const crear = async () => {
    if (!cliente) return;
    setCreando(true);
    setError(null);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        clientRef: cliente.recordId,
        contactId: crmContactId ?? undefined,
        clientName: systemClientName(cliente),
        clientDni: cliente.dni ?? null,
        clientPhone: cliente.telefono ?? null,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        body: form.body.trim(),
        benefit: form.benefit.trim() || null,
        offer: form.offer.trim() || null,
        productName: form.productName.trim() || null,
        productRef: form.productRef.trim() || null,
        companyRef: form.companyRef.trim() || null,
        companyName: form.companyName.trim() || null,
        ctaKind: form.ctaKind,
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        logoAssetId,
        assetId: media.find((m) => m.mime.startsWith("image/"))?.id ?? null,
        mediaIds: media.map((m) => m.id),
      }),
    }).catch(() => null);
    const json = res
      ? ((await res.json().catch(() => ({}))) as {
          proposal?: { id: string; token: string; publicUrl?: string | null } & Record<string, unknown>;
          message?: string;
        })
      : null;
    setCreando(false);
    if (!res?.ok || !json?.proposal) {
      setError(json?.message ?? "No se pudo crear la publicación. Probá de nuevo.");
      return;
    }
    /* Cliente 360 (embebido): el panel que contiene sigue con derivar/enviar. */
    if (embebido && onCreated) {
      onCreated(json.proposal as unknown as Record<string, unknown>);
      return;
    }
    const token = json.proposal.token;
    setCreada({
      id: json.proposal.id,
      token,
      publicUrl: json.proposal.publicUrl ?? `/p/${token}`,
    });
  };


  const reiniciar = () => {
    setPaso(pasoInicial);
    setQ("");
    setResultados([]);
    setCliente(null);
    setBuscoAlMenosUnaVez(false);
    setModo("sistema");
    setLibreNombre("");
    setCrmQ("");
    setCrmResultados([]);
    setCrmContactId(null);
    setKind(kindDefault ?? PROPOSAL_KINDS[0].id);
    setForm({
      title: "",
      subtitle: "",
      body: "",
      benefit: "",
      offer: "",
      productRef: "",
      productName: "",
      companyRef: "",
      companyName: "",
      ctaLabel: "",
      ctaUrl: "",
      ctaKind: "link",
    });
    setMedia([]);
    setMediaError(null);
    setCreada(null);
    setError(null);
    setTone("cercana");
    setAngle("beneficio");
    setAiInstructions("");
    setAiNotas(null);
    setPrevForm(null);
    setLogoAssetId(null);
    setLogoPreview(null);
    setPickerTarget(null);
  };

  /* Textos base por tipo — misma mecánica que el Cliente 360° (applyTemplate). */
  const applyTemplate = (t: (typeof plantillas)[number] | undefined) => {
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: t.title ?? f.title,
      subtitle: t.subtitle ?? "",
      body: t.body ?? "",
      productName: t.productName ?? "",
      productRef: t.productRef ?? "",
      offer: t.offer ?? "",
      benefit: t.benefit ?? "",
      ctaLabel: t.ctaLabel ?? "",
      ctaUrl: t.ctaUrl ?? "",
      ctaKind: t.ctaKind ?? "link",
    }));
    if (t.assetId && media.length === 0) {
      setMedia([{ id: t.assetId, url: `/api/public/propuesta/img/${t.assetId}`, mime: "image/*", name: "Portada" }]);
    }
    if (t.logoAssetId) {
      setLogoAssetId(t.logoAssetId);
      setLogoPreview(`/api/public/propuesta/img/${t.logoAssetId}`);
    }
  };

  const elegirKind = (id: string) => {
    setKind(id);
    applyTemplate(plantillas.find((t) => t.kind === id));
  };

  /* Logo del emisor — subida real con purpose «logo» (igual que el panel real). */
  const subirLogo = async (file: File | null | undefined) => {
    if (!file) return;
    setMediaError(null);
    setSubiendoLogo(true);
    const dataUrl = await new Promise<string | null>((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(typeof lector.result === "string" ? lector.result : null);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(file);
    });
    const base64 = dataUrl?.split(",")[1];
    if (!base64) {
      setMediaError(`No se pudo leer «${file.name}».`);
      setSubiendoLogo(false);
      return;
    }
    const res = await fetch("/api/proposals/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mime: file.type || "image/png",
        filename: file.name,
        data: base64,
        purpose: "logo",
      }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { id?: string; url?: string; message?: string } | null) : null;
    setSubiendoLogo(false);
    if (!res?.ok || !json?.id) {
      setMediaError(json?.message ?? "No se pudo guardar el logo.");
      return;
    }
    setLogoAssetId(json.id);
    setLogoPreview(json.url ?? `/api/public/propuesta/img/${json.id}`);
  };

  /* Elegir del contenedor universal (biblioteca) — fotos/video o el logo. */
  const pickFromLibrary = async (asset: { id: string; mime: string }) => {
    if (!pickerTarget) return;
    setMediaError(null);
    const res = await fetch("/api/proposals/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        libraryId: asset.id,
        purpose: pickerTarget === "media" ? "media" : "logo",
      }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { id?: string; mime?: string; url?: string; message?: string } | null) : null;
    if (!res?.ok || !json?.id) {
      setMediaError(json?.message ?? "No se pudo usar el archivo del contenedor");
      setPickerTarget(null);
      return;
    }
    const mime = json.mime ?? asset.mime;
    if (pickerTarget === "media") {
      if (mime.startsWith("video/") && media.some((m) => m.mime.startsWith("video/"))) {
        setMediaError("La publicidad lleva UN video: quitá el que está para cambiarlo");
        setPickerTarget(null);
        return;
      }
      setMedia((prev) => [...prev, { id: json.id!, mime, url: json.url ?? `/api/public/propuesta/img/${json.id}`, name: "Del contenedor" }].slice(0, MAX_MEDIA));
    } else {
      setLogoAssetId(json.id);
      setLogoPreview(json.url ?? `/api/public/propuesta/img/${json.id}`);
    }
    setPickerTarget(null);
  };

  /* 360 -> Constructor: el cliente que llega del panel entra como si lo hubieran
   * elegido en el paso 1. Si ya había otro cliente, el que llega MANDA (queda
   * elegido y el wizard sigue en «Publicación»). */
  useEffect(() => {
    if (!clienteFijo) return;
    setCliente(clienteFijo as unknown as ClienteSistema);
    setPaso((p) => (p === 0 ? 1 : p));
  }, [clienteFijo]);

  /* Textos base: al cargar las plantillas, si el título está vacío, aplicar los del tipo. */
  useEffect(() => {
    if (plantillas.length && !form.title.trim()) {
      applyTemplate(plantillas.find((x) => x.kind === kind));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas]);

  const puedeAvanzar = useMemo(() => {
    if (paso === 0) return Boolean(cliente);
    if (paso === 1) return form.title.trim().length >= 3;
    if (paso === 2) return true;
    return true;
  }, [paso, cliente, form.title]);

  const publicUrlAbs = creada ? `${typeof window !== "undefined" ? window.location.origin : ""}${creada.publicUrl}` : "";
  const portada = media[0];

  /* ———————————————————— Éxito ———————————————————— */
  if (creada) {
    return (
      <div className="space-y-2">
        {/* B9 — el flujo post-creación (compartir a un cliente del sistema o
            del CRM, derivar con aceptación del grupo, mensaje con IA y envío)
            es el MISMO panel que usa el Cliente 360°: una sola experiencia. */}
        <ProposalPostPanel
          proposalId={creada.id}
          customerName={cliente ? systemClientName(cliente) : null}
          onOpenInbox={onOpenInbox}
          onNew={reiniciar}
        />
        <div className="flex flex-wrap items-center gap-2 px-1">
          {onGoToProposals && (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand-soft bg-brand-tint px-3 text-[12px] font-semibold text-brand-text transition-opacity hover:opacity-90"
              onClick={onGoToProposals}
            >
              Ver en Propuestas
            </button>
          )}
          <p className="text-[11px] text-text-3 break-all">{publicUrlAbs}</p>
        </div>
      </div>
    );
  }

  /* ———————————————————— Wizard ———————————————————— */
  return (
    <div className="space-y-3">
      {/* Pasos */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {clienteFijo && (
          <li>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 pl-2.5 pr-1 text-[11.5px] font-semibold text-emerald-700">
              <Check size={12} /> {clienteFijo.nombre}
              {onQuitarClienteFijo && (
                <button
                  type="button"
                  onClick={() => {
                    onQuitarClienteFijo();
                    setCliente(null);
                    setPaso(0);
                  }}
                  title="Quitar este cliente y elegir otro destinatario"
                  className="rounded-full p-1 transition-colors hover:bg-emerald-500/20"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          </li>
        )}
        {PASOS.map((nombre, i) => {
          if (clienteFijo && i === 0) return null;
          const activo = i === paso;
          const hecho = i < paso;
          return (
            <li key={nombre}>
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                  activo
                    ? "border-brand bg-brand text-brand-fg"
                    : hecho
                      ? "border-brand-soft bg-brand-tint text-brand-text"
                      : "border-border text-text-3"
                )}
                onClick={() => {
                  if (i <= paso) setPaso(i);
                }}
                disabled={i > paso}
              >
                {hecho ? <Check size={12} /> : <span className="text-[10.5px] font-bold">{clienteFijo ? i : i + 1}</span>}
                {nombre}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Columna de trabajo */}
        <div className="rounded-lg border bg-card p-4">
          {paso === 0 && (
            <section aria-label="Elegir destinatario">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Users size={14} /> ¿Para quién es la publicación?
              </h3>
              <p className="mt-0.5 text-[11.5px] text-text-3">
                Un cliente del sistema, un contacto nuevo del CRM, un grupo o alguien sin ficha —
                con todas las herramientas igual.
              </p>

              {!cliente && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                        modo === "sistema"
                          ? "border-brand bg-brand-tint text-brand-text"
                          : "border-border text-text-2 hover:bg-accent"
                      )}
                      onClick={() => {
                        setModo("sistema");
                        setQ("");
                        setResultados([]);
                      }}
                    >
                      <UserRound size={12} /> Cliente del sistema
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                        modo === "crm"
                          ? "border-brand bg-brand-tint text-brand-text"
                          : "border-border text-text-2 hover:bg-accent"
                      )}
                      onClick={() => {
                        setModo("crm");
                        setQ("");
                        setResultados([]);
                      }}
                    >
                      <MessageCircle size={12} /> Contacto del CRM
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                        modo === "libre"
                          ? "border-brand bg-brand-tint text-brand-text"
                          : "border-border text-text-2 hover:bg-accent"
                      )}
                      onClick={() => {
                        setModo("libre");
                        setQ("");
                        setResultados([]);
                      }}
                    >
                      <Users size={12} /> Grupo o persona sin ficha
                    </button>
                  </div>

                  {modo === "sistema" ? (
                    <>
                      <div className="relative mt-2">
                        <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-text-3" />
                        <input
                          className={cn(inputClass, "pl-8")}
                          placeholder="Ej.: GIMENEZ, 30123456, 341…"
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          autoFocus
                        />
                        {buscando && (
                          <Loader2 size={14} className="absolute right-2.5 top-2.5 animate-spin text-text-3" />
                        )}
                      </div>

                      {resultados.length > 0 && (
                        <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border">
                          {resultados.map((r) => (
                            <li key={r.client.recordId}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                                onClick={() => {
                                  setCliente(r.client);
                                  setCrmContactId(null);
                                  setResultados([]);
                                  setQ("");
                                }}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[12.5px] font-semibold">
                                    {systemClientName(r.client)}
                                  </span>
                                  <span className="block text-[11px] text-text-3">
                                    {r.client.dni ? `DNI ${r.client.dni}` : "sin DNI"}
                                    {r.client.telefono ? ` · ${r.client.telefono}` : ""}
                                    {r.client.oficina ? ` · ${r.client.oficina}` : ""}
                                  </span>
                                </span>
                                <ArrowRight size={13} className="shrink-0 text-text-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {buscoAlMenosUnaVez && !buscando && resultados.length === 0 && (
                        <p className="mt-2 rounded-md border bg-background px-3 py-2 text-[11.5px] text-text-3">
                          Sin resultados con esa búsqueda. Probá con otro apellido o el DNI completo
                          — o pasá a «Grupo o persona sin ficha».
                        </p>
                      )}
                    </>
                  ) : modo === "libre" ? (
                    <div className="mt-2 space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                          ¿Para quién es? *
                        </span>
                        <input
                          className={inputClass}
                          maxLength={160}
                          placeholder="Ej.: Vecinos de Funes · Juan Pérez (referido) · Gym Los Cedros"
                          value={libreNombre}
                          onChange={(e) => setLibreNombre(e.target.value)}
                          autoFocus
                        />
                      </label>
                      <button
                        type="button"
                        disabled={libreNombre.trim().length < 2}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand bg-brand px-3 text-[12px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                        onClick={() => {
                          setCliente({
                            recordId: "",
                            nombre: libreNombre.trim(),
                          } as unknown as ClienteSistema);
                          setLibreNombre("");
                        }}
                      >
                        <Check size={13} /> Usar «{libreNombre.trim() || "…"}»
                      </button>
                      <p className="text-[11px] text-text-3">
                        Queda «Para {libreNombre.trim() || "…"}», sin ficha: sirve para un grupo de
                        clientes, de personas, o alguien que no es cliente. Todas las opciones (IA,
                        textos base, fotos, logo) funcionan igual.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <div className="relative">
                        <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-text-3" />
                        <input
                          className={cn(inputClass, "pl-8")}
                          placeholder="Buscar prospecto por nombre o teléfono…"
                          value={crmQ}
                          onChange={(e) => setCrmQ(e.target.value)}
                          autoFocus
                        />
                        {crmBuscando && (
                          <Loader2 size={14} className="absolute right-2.5 top-2.5 animate-spin text-text-3" />
                        )}
                      </div>
                      {crmResultados.length > 0 && (
                        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border">
                          {crmResultados.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                                onClick={() => {
                                  setCliente({
                                    recordId: "",
                                    nombre: c.name,
                                    apellido: "",
                                    telefono: c.phone,
                                  } as unknown as ClienteSistema);
                                  setCrmContactId(c.id);
                                  setCrmQ("");
                                  setCrmResultados([]);
                                }}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[12.5px] font-semibold">
                                    {c.name}
                                  </span>
                                  <span className="block text-[11px] text-text-3">
                                    {c.phone ? `📱 ${c.phone}` : "sin teléfono"}
                                    {c.stageName ? ` · ${c.stageName}` : ""}
                                  </span>
                                </span>
                                <ArrowRight size={13} className="shrink-0 text-text-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {crmQ.trim().length >= 2 && !crmBuscando && crmResultados.length === 0 && (
                        <p className="rounded-md border bg-background px-3 py-2 text-[11.5px] text-text-3">
                          Sin resultados entre los contactos del CRM. Probá otro nombre o teléfono —
                          o usá «Grupo o persona sin ficha».
                        </p>
                      )}
                      <p className="text-[11px] text-text-3">
                        Prospectos nuevos del CRM (escribieron por WhatsApp, todavía no están en el
                        sistema): la publicación queda vinculada a su chat para mandársela.
                      </p>
                    </div>
                  )}
                </>
              )}

              {cliente && !clienteFijo && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-brand-soft bg-brand-tint px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-brand-text">
                      {systemClientName(cliente)}
                    </p>
                    <p className="text-[11px] text-text-3">
                      {cliente.recordId
                        ? `${cliente.dni ? `DNI ${cliente.dni}` : "sin DNI"}${
                            cliente.telefono ? ` · ${cliente.telefono}` : ""
                          }${cliente.oficina ? ` · ${cliente.oficina}` : ""}`
                        : crmContactId
                          ? `contacto del CRM — prospecto${
                              cliente.telefono ? ` · ${cliente.telefono}` : ""
                            }`
                          : "destinatario libre — sin ficha en el sistema"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-border-strong bg-card px-2 py-1 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                    onClick={() => {
                      if (crmContactId) {
                        setModo("crm");
                        setCrmQ(systemClientName(cliente));
                        setCrmContactId(null);
                      } else if (!cliente.recordId) {
                        setLibreNombre(systemClientName(cliente));
                        setModo("libre");
                      }
                      setCliente(null);
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              )}
            </section>
          )}

          {paso === 1 && (
            <section aria-label="Contenido de la publicación" className="space-y-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Wand2 size={14} /> ¿Qué ofrecemos?
                </h3>
                <p className="mt-0.5 text-[11.5px] text-text-3">
                  El tipo ordena la propuesta en el embudo; el texto es lo que va a leer el cliente.
                </p>
              </div>

              {plantillas.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Textos base (opcional)
                  </span>
                  <select
                    className={inputClass}
                    value=""
                    onChange={(e) => {
                      const t = plantillas.find((x) => x.kind === e.target.value);
                      if (t) {
                        setKind(t.kind);
                        applyTemplate(t);
                      }
                    }}
                  >
                    <option value="">Elegí un texto base para precargar la pieza…</option>
                    {plantillas.map((t) => (
                      <option key={t.kind} value={t.kind}>
                        {t.label?.trim() ||
                          PROPOSAL_KINDS.find((k) => k.id === t.kind)?.label ||
                          t.kind}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="flex flex-wrap gap-1.5">
                {PROPOSAL_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                      kind === k.id
                        ? "border-brand bg-brand-tint text-brand-text"
                        : "border-border text-text-2 hover:bg-accent"
                    )}
                    onClick={() => elegirKind(k.id)}
                  >
                    <span aria-hidden>{k.emoji}</span>
                    {k.label}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Título de la publicación *
                </span>
                <input
                  className={inputClass}
                  maxLength={120}
                  placeholder="Ej.: Tu auto, protegido por menos"
                  value={form.title}
                  onChange={(e) => set("title")(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Bajada (opcional)
                </span>
                <input
                  className={inputClass}
                  maxLength={160}
                  placeholder="Ej.: Cobertura completa con auxilio y sin sorpresas"
                  value={form.subtitle}
                  onChange={(e) => set("subtitle")(e.target.value)}
                />
              </label>

              {/* 041c — Escribir con IA: tono (cercana ↔ formal…) + concepto de venta */}
              <div className="space-y-2 rounded-xl border border-border-strong bg-subtle/60 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[12px] font-bold text-text-2">
                    <Wand2 size={13} /> Tono
                  </span>
                  {TONE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTone(id)}
                      aria-pressed={tone === id}
                      title={TONES[id].hint}
                      className={
                        tone === id
                          ? "rounded-full border border-brand bg-brand px-2.5 py-1 text-[12px] font-semibold text-white"
                          : "rounded-full border bg-card px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-subtle"
                      }
                    >
                      {TONES[id].label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[12px] font-bold text-text-2">
                    <Lightbulb size={13} /> Concepto de venta
                  </span>
                  {ANGLE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAngle((a) => (a === id ? null : id))}
                      aria-pressed={angle === id}
                      title={ANGLES[id].hint}
                      className={
                        angle === id
                          ? "rounded-full border border-brand bg-brand px-2.5 py-1 text-[12px] font-semibold text-white"
                          : "rounded-full border bg-card px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-subtle"
                      }
                    >
                      {ANGLES[id].label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    placeholder="Indicaciones para la IA (opcional): «mencioná el 20%», «hablale de la familia»…"
                    className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-[12.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => void aiWrite()}
                    disabled={aiBusy !== null || !form.title.trim()}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {aiBusy === "pieza" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Escribir con IA
                  </button>
                  {prevForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm(prevForm);
                        setPrevForm(null);
                        setAiNotas(null);
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-accent"
                    >
                      Deshacer
                    </button>
                  )}
                </div>
                {aiNotas && <p className="text-[11px] text-text-3">{aiNotas}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Producto
                  </span>
                  {productos.length > 0 ? (
                    <select
                      className={inputClass}
                      value={form.productRef}
                      onChange={(e) => {
                        const sel = productos.find((x) => x.id === e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          productRef: sel ? sel.id : "",
                          productName: sel ? sel.name : "",
                        }));
                      }}
                    >
                      <option value="">Sin producto puntual</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      placeholder={cargandoMenus ? "Cargando…" : "Ej.: AUTOMOTOR"}
                      value={form.productName}
                      onChange={(e) => setForm((prev) => ({ ...prev, productName: e.target.value, productRef: "" }))}
                    />
                  )}
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Compañía auspiciante
                  </span>
                  {companias.length > 0 ? (
                    <select
                      className={inputClass}
                      value={form.companyRef}
                      onChange={(e) => {
                        const sel = companias.find((x) => x.id === e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          companyRef: sel ? sel.id : "",
                          companyName: sel ? sel.name : "",
                        }));
                      }}
                    >
                      <option value="">Sin compañía</option>
                      {companias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      placeholder={cargandoMenus ? "Cargando…" : "Ej.: LA SEGUNDA"}
                      value={form.companyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value, companyRef: "" }))}
                    />
                  )}
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Beneficio destacado (opcional)
                </span>
                <input
                  className={inputClass}
                  maxLength={200}
                  placeholder="Ej.: 15% de descuento en la primera cuota 🎁"
                  value={form.benefit}
                  onChange={(e) => set("benefit")(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Oferta / detalles (opcional)
                </span>
                <input
                  className={inputClass}
                  maxLength={400}
                  placeholder="Ej.: válido hasta el 30/10 para clientes con póliza vigente"
                  value={form.offer}
                  onChange={(e) => set("offer")(e.target.value)}
                />
              </label>

              {/* Botón de la pieza — mismos campos que el panel real. */}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Botón — tipo
                  </span>
                  <select
                    className={inputClass}
                    value={form.ctaKind}
                    onChange={(e) => {
                      const v = e.target.value as "link" | "pdf" | "agenda";
                      setForm((prev) => ({
                        ...prev,
                        ctaKind: v,
                        ctaLabel:
                          prev.ctaLabel ||
                          (v === "agenda" ? "Agendar videollamada" : v === "pdf" ? "Ver la propuesta" : "Ver más"),
                      }));
                    }}
                  >
                    <option value="link">Enlace</option>
                    <option value="pdf">PDF</option>
                    <option value="agenda">Agendar</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Botón — texto (opcional)
                  </span>
                  <input
                    className={inputClass}
                    maxLength={60}
                    placeholder="Ej.: Quiero cotizar"
                    value={form.ctaLabel}
                    onChange={(e) => set("ctaLabel")(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Botón — enlace (opcional)
                  </span>
                  <input
                    className={inputClass}
                    maxLength={500}
                    placeholder="https://…"
                    value={form.ctaUrl}
                    onChange={(e) => set("ctaUrl")(e.target.value)}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Mensaje para el cliente
                </span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-border-strong bg-background px-2.5 py-2 text-[12.5px] text-text"
                  maxLength={1600}
                  placeholder="Contá la propuesta con tus palabras: qué gana, hasta cuándo, cómo la aprovecha…"
                  value={form.body}
                  onChange={(e) => set("body")(e.target.value)}
                />
              </label>
            </section>
          )}

          {paso === 2 && (
            <section aria-label="Fotos y video" className="space-y-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <ImagePlus size={14} /> Fotos y video de la publicación
                </h3>
                <p className="mt-0.5 text-[11.5px] text-text-3">
                  Hasta {MAX_MEDIA} archivos (imágenes o un video MP4/WebM de menos de 30 MB). La
                  primera foto es la portada.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-background px-3 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-60"
                  onClick={() => fileInput.current?.click()}
                  disabled={subiendo || media.length >= MAX_MEDIA}
                >
                  {subiendo ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  {subiendo ? "Subiendo…" : "Elegir archivos"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-background px-3 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-60"
                  onClick={() => setPickerTarget("media")}
                  disabled={subiendo || media.length >= MAX_MEDIA}
                >
                  <FolderOpen size={14} /> Elegir del contenedor
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                multiple
                className="hidden"
                onChange={(e) => void subirArchivos(e.target.files)}
              />

              {mediaError && (
                <p className="rounded-md border border-danger-soft bg-card px-3 py-2 text-[11.5px] text-danger-text">
                  {mediaError}
                </p>
              )}

              {media.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {media.map((m, i) => (
                    <li key={m.id} className="group relative overflow-hidden rounded-md border bg-background">
                      {m.mime.startsWith("video/") ? (
                        <video className="h-28 w-full object-cover" src={m.url} muted playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="h-28 w-full object-cover" src={m.url} alt={m.name} />
                      )}
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[9.5px] font-bold text-brand-fg">
                          Portada
                        </span>
                      )}
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 rounded-full border bg-card p-1 text-text-2 shadow-sm transition-colors hover:bg-accent"
                        onClick={() => setMedia((prev) => prev.filter((x) => x.id !== m.id))}
                        aria-label={`Quitar ${m.name}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {media.length === 0 && !subiendo && (
                <p className="rounded-md border bg-background px-3 py-2 text-[11.5px] text-text-3">
                  Sin archivos la publicación igual funciona: queda el texto y el beneficio.
                </p>
              )}

              {/* Logo del emisor (opcional) — subida propia o del contenedor. */}
              <div className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-semibold">Logo del emisor (opcional)</p>
                    <p className="text-[11px] text-text-3">
                      Va arriba de la pieza en la página pública, junto a la marca.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-60"
                      onClick={() => logoInput.current?.click()}
                      disabled={subiendoLogo}
                    >
                      {subiendoLogo ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                      {subiendoLogo ? "Subiendo…" : "Subir logo"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
                      onClick={() => setPickerTarget("logo")}
                    >
                      <FolderOpen size={12} /> Del contenedor
                    </button>
                  </div>
                </div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void subirLogo(e.target.files?.[0])}
                />
                {logoPreview && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="h-10 w-10 rounded-md border bg-card object-contain p-0.5"
                      src={logoPreview}
                      alt="Logo del emisor"
                    />
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-card px-2 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                      onClick={() => {
                        setLogoAssetId(null);
                        setLogoPreview(null);
                      }}
                    >
                      <Trash2 size={11} /> Quitar
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {paso === 3 && (
            <section aria-label="Vista previa y publicación" className="space-y-3">
              <div>
                <h3 className="text-[13px] font-semibold">Última revisión</h3>
                <p className="mt-0.5 text-[11.5px] text-text-3">
                  Mirá la vista previa de al lado. Cuando esté lista, creala: queda como borrador,
                  con su página pública y lista para derivar y enviar por WhatsApp.
                </p>
              </div>

              <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Cliente</dt>
                  <dd className="font-semibold">{cliente ? systemClientName(cliente) : "—"}</dd>
                </div>
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Tipo</dt>
                  <dd className="font-semibold">
                    {PROPOSAL_KINDS.find((k) => k.id === kind)?.emoji}{" "}
                    {PROPOSAL_KINDS.find((k) => k.id === kind)?.label}
                  </dd>
                </div>
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Archivos</dt>
                  <dd className="font-semibold">{media.length === 0 ? "Sin archivos" : `${media.length} cargado(s)`}</dd>
                </div>
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Producto</dt>
                  <dd className="font-semibold">{form.productName || "—"}</dd>
                </div>
              </dl>

              {error && (
                <p className="rounded-md border border-danger-soft bg-card px-3 py-2 text-[12px] text-danger-text">
                  {error}
                </p>
              )}

              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-[12.5px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
                onClick={() => void crear()}
                disabled={creando}
              >
                {creando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {creando ? "Creando…" : "Crear publicación"}
              </button>
            </section>
          )}

          {/* Navegación */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-3 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-40"
              onClick={() => setPaso((p) => Math.max(pasoInicial, p - 1))}
              disabled={paso === pasoInicial}
            >
              <ArrowLeft size={13} />
              Atrás
            </button>
            {paso < 3 && (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[12px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                onClick={() => setPaso((p) => Math.min(3, p + 1))}
                disabled={!puedeAvanzar}
              >
                Siguiente
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Vista previa (al estilo de la pieza pública) */}
        <aside className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
            Vista previa
          </p>
          <div className="overflow-hidden rounded-xl border border-border-strong bg-gradient-to-b from-brand-tint to-card">
            <div className="border-b border-border px-3 py-2 text-[10.5px] font-semibold text-text-2">
              Propuesta para {cliente ? systemClientName(cliente) : "el cliente"}
            </div>

            {portada ? (
              portada.mime.startsWith("video/") ? (
                <video className="h-36 w-full object-cover" src={portada.url} muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="h-36 w-full object-cover" src={portada.url} alt="" />
              )
            ) : (
              <div className="flex h-24 items-center justify-center text-[11px] text-text-3">
                (la portada va acá)
              </div>
            )}

            <div className="space-y-1.5 px-3 py-3">
              <p className="text-[13.5px] font-bold leading-snug">
                {form.title || "Título de la publicación"}
              </p>
              {form.subtitle && <p className="text-[11.5px] text-text-2">{form.subtitle}</p>}
              {form.benefit && (
                <p className="inline-flex rounded-full border border-brand-soft bg-brand-tint px-2 py-0.5 text-[10.5px] font-semibold text-brand-text">
                  🎁 {form.benefit}
                </p>
              )}
              {form.offer && <p className="text-[10.5px] text-text-3">{form.offer}</p>}
              {form.productName && (
                <p className="text-[10.5px] text-text-2">Producto: {form.productName}</p>
              )}
              {form.body && (
                <p className="line-clamp-4 whitespace-pre-line text-[11px] text-text-2">{form.body}</p>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="inline-flex h-6 items-center rounded-md bg-brand px-2 text-[10.5px] font-semibold text-brand-fg">
                  Te contacto
                </span>
                <span className="inline-flex h-6 items-center rounded-md border px-2 text-[10.5px] font-semibold text-text-2">
                  WhatsApp
                </span>
              </div>
              {form.companyName && (
                <p className="pt-1 text-[9.5px] uppercase tracking-wide text-text-3">
                  Auspicia {form.companyName}
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[10.5px] text-text-3">
            La pieza final (la que abre el cliente con el link) respeta este contenido.
          </p>
        </aside>
      </div>

      {/* Contenedor universal — elegir fotos/video o el logo desde el estante compartido. */}
      {pickerTarget && (
        <LibraryPicker
          title={
            pickerTarget === "media"
              ? "Elegir del contenedor — fotos y video"
              : "Elegir del contenedor — logo"
          }
          kind={pickerTarget === "media" ? "all" : "image"}
          onPick={(asset) => pickFromLibrary({ id: asset.id, mime: asset.mime })}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
