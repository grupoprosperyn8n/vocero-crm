"use client";

import { useState } from "react";
import { avatarColor, cn, initials } from "@/lib/utils";

/**
 * Avatar de contacto: foto si la hay, iniciales sobre color estable si no
 * (FR-006). `src` es opcional — cuando la persona tiene foto cargada (ver
 * /api/avatars) se muestra la foto; si la imagen falla, se cae a las
 * iniciales sin dejar el hueco roto.
 */
export function ContactAvatar({
  name,
  seed,
  size = "md",
  src = null,
}: {
  name: string;
  /** Semilla del color (id o teléfono): estable para el mismo contacto. */
  seed: string;
  size?: "sm" | "md" | "lg";
  /** 032 — foto de perfil (p. ej. /api/avatars/EMP995). Opcional. */
  src?: string | null;
}) {
  const [rota, setRota] = useState(false);
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  } as const;
  if (src && !rota) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 032: el proxy /api/avatars pide sesión; el optimizador de next/image no la lleva.
      <img
        src={src}
        alt=""
        aria-hidden
        onError={() => setRota(true)}
        className={cn("shrink-0 rounded-full object-cover", sizes[size])}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        avatarColor(seed)
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
