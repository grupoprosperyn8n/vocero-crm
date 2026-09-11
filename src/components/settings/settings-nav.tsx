"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: "/settings/whatsapp", label: "WhatsApp" },
  { href: "/settings/ai", label: "IA" },
  { href: "/settings/connectors", label: "Conectores" },
  { href: "/settings/agents", label: "Automejora" },
  { href: "/settings/branding", label: "Marca" },
  { href: "/settings/templates", label: "Plantillas" },
  { href: "/settings/team", label: "Equipo" },
];

/** 015 — "Agenda" solo existe si esta instancia encendió la bandera. */
const AGENDA_TAB: Tab = { href: "/settings/calendar", label: "Agenda" };

/** 016 — Igual con "Anuncios" y la bandera ATRIBUCION. */
const ADS_TAB: Tab = { href: "/settings/ads", label: "Anuncios" };

/** 017 — "Messenger" solo si el canal está encendido con CHANNELS. */
const MESSENGER_TAB: Tab = { href: "/settings/messenger", label: "Messenger" };

export function SettingsNav({
  role = "member",
  agenda = false,
  atribucion = false,
  messenger = false,
}: {
  /** 021 — Qué pestañas ve cada rol lo decide el layout server y baja por prop. */
  role?: string;
  agenda?: boolean;
  atribucion?: boolean;
  messenger?: boolean;
}) {
  const pathname = usePathname();
  // Qué pestañas existen lo decide el servidor y baja por prop: este es un
  // componente de cliente y no puede leer variables de entorno.
  // Messenger va junto a WhatsApp: son las dos conexiones de mensajería.
  const all = [
    ...TABS.slice(0, 1),
    ...(messenger ? [MESSENGER_TAB] : []),
    ...TABS.slice(1),
    ...(agenda ? [AGENDA_TAB] : []),
    ...(atribucion ? [ADS_TAB] : []),
  ];
  // 021 — La customización del CRM es del propietario; el administrador ve
  // únicamente Equipo; a los miembros los rebota la guarda del layout.
  const tabs =
    role === "owner"
      ? all
      : role === "admin"
        ? all.filter((t) => t.href === "/settings/team")
        : [];
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:space-y-1 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "block shrink-0 whitespace-nowrap rounded-sm px-3 py-2 text-[13.5px] font-semibold transition-colors",
            pathname.startsWith(t.href)
              ? "bg-brand-tint text-brand-text"
              : "text-text-2 hover:bg-accent hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
