"use client";

/**
 * 041d — Elegir una imagen DEL CONTENEDOR universal para la publicidad.
 *
 * Se abre desde el armador de la pieza («Elegir del contenedor»): muestra
 * las imágenes del estante compartido, deja buscar y también subir una nueva
 * en el momento. Al tocar una, el padre la copia a la propuesta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Search, Upload, X } from "lucide-react";

export type PickerAsset = {
  id: string;
  name: string;
  kind: "image" | "video";
  url: string;
  mime: string;
  byteSize: number;
  uploaderName: string | null;
  protected: boolean;
};

export function LibraryPicker({
  title,
  onPick,
  onClose,
  kind = "image",
}: {
  title: string;
  onPick: (asset: PickerAsset) => void | Promise<void>;
  onClose: () => void;
  /** 042 — «all» para los medios de la publicidad (fotos + video). */
  kind?: "image" | "video" | "all";
}) {
  const [assets, setAssets] = useState<PickerAsset[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(kind === "all" ? "/api/library" : `/api/library?kind=${kind}`);

    if (!res.ok) {
      setError("No se pudo cargar el contenedor");
      setAssets([]);
      return;
    }

    const body = (await res.json().catch(() => null)) as {
      assets?: PickerAsset[];
    } | null;

    setAssets(body?.assets ?? []);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;

    setBusy(true);
    setError(null);

    const res = await fetch(`/api/library?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });

    const body = (await res.json().catch(() => null)) as
      | { asset?: PickerAsset; error?: { message?: string } }
      | null;

    setBusy(false);

    if (!res.ok || !body?.asset) {
      setError(body?.error?.message ?? "No se pudo subir la imagen");
      return;
    }

    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const pick = async (asset: PickerAsset) => {
    setPickedId(asset.id);
    await onPick(asset);
  };

  const filtradas =
    assets?.filter((a) =>
      search.trim() === ""
        ? true
        : a.name.toLowerCase().includes(search.trim().toLowerCase())
    ) ?? [];

  return (
    <div
      role="dialog"
      aria-label="Elegir del contenedor"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-text-1">
            <FolderOpen size={15} /> {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-subtle/40 px-2.5 py-1.5">
            <Search size={13} className="text-text-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el contenedor…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            />
          </label>
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
            Subir nueva
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
        </div>

        {error && (
          <p className="border-b bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {assets === null ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border bg-subtle/60" />
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-text-3">
              {search.trim()
                ? "Nada con ese nombre en el contenedor."
                : "El contenedor está vacío: subí una imagen para empezar."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtradas.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => void pick(asset)}
                  disabled={pickedId !== null}
                  className={`group overflow-hidden rounded-xl border text-left transition-shadow hover:shadow-md ${
                    pickedId === asset.id ? "border-emerald-500 ring-2 ring-emerald-400/50" : ""
                  }`}
                >
                  <span className="relative block h-28 w-full bg-subtle/60">
                    {asset.kind === "video" ? (
                      <video
                        src={asset.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={asset.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </>
                    )}
                    {asset.kind === "video" && (
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        VIDEO
                      </span>
                    )}
                    {pickedId === asset.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-bold text-white">
                        <Loader2 size={16} className="animate-spin" />
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-2 py-1.5 text-[11.5px] font-semibold text-text-1">
                    {asset.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
