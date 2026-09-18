"use client";

/**
 * 041d — CONTENEDOR UNIVERSAL DE ARCHIVOS. Sección GLOBAL «Archivos» del
 * tablero (042b: no va dentro de la ficha 360° de un cliente — es para todos).
 *
 * "Ese contenedor es para todos": un solo estante para todo el equipo. Las
 * imágenes se pueden elegir desde acá para armar una publicidad y los videos
 * quedan a mano para mandarlos. Lo que sube dueño/propietario/gerente queda
 * FIJO (no se puede quitar); el servidor es el que manda, acá solo se refleja.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  FolderOpen,
  ImageIcon,
  Loader2,
  Lock,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

type LibraryAsset = {
  id: string;
  name: string;
  kind: "image" | "video";
  mime: string;
  byteSize: number;
  url: string;
  uploaderName: string | null;
  uploaderRole: string;
  protected: boolean;
  canDelete: boolean;
  createdAt: string;
};

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function LibraryPanel() {
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState<LibraryAsset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/library");

    if (!res.ok) {
      setError("No se pudo cargar el contenedor");
      setAssets([]);
      return;
    }

    const body = (await res.json().catch(() => null)) as {
      assets?: LibraryAsset[];
    } | null;

    setAssets(body?.assets ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setBusy(true);
    setError(null);

    for (const file of Array.from(files)) {
      const res = await fetch(
        `/api/library?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        }
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? `No se pudo subir ${file.name}`);
        break;
      }
    }

    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const remove = async (asset: LibraryAsset) => {
    if (!window.confirm(`¿Quitar «${asset.name}» del contenedor?`)) return;

    setBusyId(asset.id);
    setError(null);

    const res = await fetch(`/api/library/${asset.id}`, { method: "DELETE" });

    setBusyId(null);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo quitar el archivo");
      return;
    }

    await load();
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-text-3 uppercase">
          <FolderOpen size={13} />
          Contenedor de archivos
          {assets !== null && (
            <span className="ml-1 rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-semibold text-text-3 normal-case">
              {assets.length}
            </span>
          )}
        </h3>
        <label
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          Subir
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      </div>

      <p className="mb-2 text-[11.5px] text-text-3">
        Estante compartido del equipo: de acá se eligen las imágenes para las
        publicidades. Lo que sube dueño, propietario o gerente queda fijo
        (con candado) y no se puede quitar.
      </p>

      {error && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
          <TriangleAlert size={13} /> {error}
        </p>
      )}

      {assets === null ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border bg-subtle/60" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-4 py-5 text-center text-[12.5px] text-text-3">
          Todavía no hay archivos — subí el primero (imágenes o videos).
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {assets.map((asset) => (
            <figure
              key={asset.id}
              className="group overflow-hidden rounded-xl border bg-card"
            >
              <div className="relative h-24 w-full bg-subtle/60">
                {asset.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(asset)}
                    className="flex h-full w-full flex-col items-center justify-center gap-1 text-text-2 hover:bg-subtle"
                    aria-label={`Ver video ${asset.name}`}
                  >
                    <Film size={22} />
                    <span className="text-[10.5px] font-semibold">Ver video</span>
                  </button>
                )}
                {asset.protected && (
                  <span
                    title="Lo subió un dueño, propietario o gerente: queda fijo"
                    className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    <Lock size={10} /> Fijo
                  </span>
                )}
                {asset.canDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(asset)}
                    disabled={busyId === asset.id}
                    aria-label={`Quitar ${asset.name}`}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-90 hover:bg-red-600 disabled:opacity-40"
                  >
                    {busyId === asset.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                )}
              </div>
              <figcaption className="space-y-0.5 px-2 py-1.5">
                <p className="truncate text-[11.5px] font-semibold text-text-1" title={asset.name}>
                  {asset.name}
                </p>
                <p className="flex items-center gap-1 text-[10.5px] text-text-3">
                  {asset.kind === "image" ? <ImageIcon size={10} /> : <Film size={10} />}
                  {sizeLabel(asset.byteSize)}
                  {asset.uploaderName ? ` · ${asset.uploaderName.split(" ")[0]}` : ""}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {videoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl space-y-2 rounded-2xl border bg-card p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-bold text-text-1">{videoOpen.name}</p>
              <button
                type="button"
                onClick={() => setVideoOpen(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
              >
                <X size={16} />
              </button>
            </div>
            <video
              src={videoOpen.url}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 shadow-2xl ring-1 ring-white/60"
            />
          </div>
        </div>
      )}
    </section>
  );
}
