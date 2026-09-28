"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OfficeTodayPicker } from "@/components/office-today";
import {
  Bell,
  CalendarDays,
  FlaskConical,
  Inbox,
  Kanban,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { ThemePreference } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo, BrandTile } from "@/components/brand-mark";
import { APP_VERSION, BUILD_COMMIT, versionLabel } from "@/lib/version";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Inbox;
  /** "crm" = no leídos de la Bandeja; "internal" = no leídos del chat interno (022);
   *  "alerts" = alertas pendientes del sistema (027). */
  badge?: "crm" | "internal" | "alerts";
};

const NAV: NavItem[] = [
  { href: "/inbox", label: "Bandeja", icon: Inbox, badge: "crm" },
  // 027 — Alertas del sistema de seguros (misma cola que la PWA). Solo existe
  // en instancias con backend de alertas configurado.
  { href: "/alerts", label: "Alertas", icon: Bell, badge: "alerts" },
  { href: "/pipeline", label: "Flujo de Venta/Gestión", icon: Kanban },
  { href: "/contacts", label: "Contactos", icon: Users },
  // 022 — Chat interno del equipo: lo ve TODO el equipo (no es de Ajustes).
  { href: "/chat", label: "Chat interno", icon: MessageSquareText, badge: "internal" },
  { href: "/agent", label: "Agente", icon: Sparkles },
  { href: "/lab", label: "Laboratorio", icon: FlaskConical },
  // 038 — Dashboard Management: el cockpit ejecutivo embebido, tal cual es.
  // Dueño y propietarios, y solo en instancias con cockpit configurado:
  // se filtra abajo por rol y por bandera.
  { href: "/dashboard-management", label: "Dashboard Management", icon: LayoutDashboard },
];

/** 015 — "Citas" solo existe si esta instancia encendió la agenda. */
const AGENDA_ITEM: NavItem = {
  href: "/bookings",
  label: "Citas",
  icon: CalendarDays,
};

/** Preferencia del toolbar colapsable (escritorio) — se recuerda en el navegador. */
const NAV_COLLAPSED_KEY = "vocero.navCollapsed";

/**
 * Un renglón del menú, como el `side-item` del mockup de la landing: texto
 * semibold, esquinas de 9px y, activo, lavado del acento con tinta azul.
 */
function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-[10px] rounded-sm px-2.5 py-2.5 text-[13.5px] font-semibold transition-colors lg:py-2",
    active
      ? "bg-brand-tint text-brand-text"
      : "text-text-2 hover:bg-accent hover:text-foreground"
  );
}

export function AppNav({
  branding,
  userName,
  role,
  theme,
  commit,
  agenda = false,
  alerts = false,
  dashboardManagement = false,
  open = false,
  onClose,
}: {
  branding: Branding;
  userName: string;
  role: string;
  theme: ThemePreference;
  /**
   * Commit resuelto en el servidor. Gana al de build porque puede venir de la
   * plataforma cuando quien construyó no lo pasó como build-arg.
   */
  commit?: string;
  /**
   * 015 — ¿hay agenda en esta instancia? Viene del servidor por prop y no se
   * deduce de los datos: una instancia con la agenda encendida pero sin citas
   * todavía debe ver la entrada igual.
   */
  agenda?: boolean;
  /** 027 — ¿hay sistema de alertas configurado en esta instancia? */
  alerts?: boolean;
  /** 038 — ¿esta instancia tiene Dashboard Management? (cockpit embebido) */
  dashboardManagement?: boolean;
  /** Solo aplica por debajo de `lg`: en escritorio el lateral es fijo. */
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [internalUnread, setInternalUnread] = useState(0);
  const [alertsPending, setAlertsPending] = useState(0);

  // Toolbar colapsable (solo escritorio): el cajón móvil no cambia. La
  // preferencia queda en localStorage, así la elección sobrevive al refresh.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  async function refetchInternalUnread() {
    const res = await fetch("/api/internal/rooms").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { rooms: { unreadCount: number }[] };
    setInternalUnread(data.rooms.reduce((a, r) => a + r.unreadCount, 0));
  }

  // 027 — Contador de alertas pendientes (la cola la mueven la PWA y el
  // backend; el CRM lo refresca cada minuto).
  async function refetchAlertsPending() {
    const res = await fetch("/api/alerts/count").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      pendientes?: number;
    } | null;
    setAlertsPending(data?.ok ? (data.pendientes ?? 0) : 0);
  }

  useEffect(() => {
    void refetchUnread();
    void refetchInternalUnread();
    if (alerts) void refetchAlertsPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!alerts) return;
    const t = setInterval(() => void refetchAlertsPending(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
    onInternalMessage: () => void refetchInternalUnread(),
    onInternalRoom: () => void refetchInternalUnread(),
  });

  const sha = commit || BUILD_COMMIT;
  const settingsActive = pathname.startsWith("/settings");
  // 021 — La configuración del CRM es del propietario: "Agente" (perfil y
  // conocimiento del bot) se esconde para el resto; el administrador entra a
  // Ajustes solo por Equipo. 027 — "Alertas" solo en instancias configuradas.
  let nav = role === "owner" ? NAV : NAV.filter((i) => i.href !== "/agent");
  if (!alerts) nav = nav.filter((i) => i.href !== "/alerts");
  // 038 — Dashboard Management: dueño y propietarios, solo con cockpit
  // configurado en esta instancia.
  if (!dashboardManagement || role === "member")
    nav = nav.filter((i) => i.href !== "/dashboard-management");
  // Citas va después del Flujo de Venta/Gestión: es el paso siguiente de un trato, no una
  // sección aparte.
  const items = agenda
    ? [...nav.slice(0, 2), AGENDA_ITEM, ...nav.slice(2)]
    : nav;

  return (
    <aside
      // Móvil: cajón que se desliza desde la izquierda (siempre montado, así
      // la transición corre en ambos sentidos). Escritorio: columna fija.
      // `visibility` va en la transición a propósito: al cerrar mantiene el
      // cajón visible mientras se desliza y recién entonces lo oculta, que es
      // lo que lo saca del orden de tabulación en móvil.
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto border-r bg-subtle px-3 pb-3.5 pt-4 transition-[transform,visibility] duration-200",
        "lg:static lg:visible lg:z-auto lg:translate-x-0 lg:overflow-visible lg:transition-[width,padding] lg:duration-200",
        collapsed ? "lg:w-[64px] lg:px-1.5" : "lg:w-56",
        open ? "visible translate-x-0 shadow-pop" : "invisible -translate-x-full"
      )}
    >
      {/* Marca: el logo de Vocero o, white-label, la inicial y el nombre.
          Colapsado (escritorio) queda el mosaico, con el botón para volver. */}
      <div
        className={cn(
          "mb-5 flex items-start gap-1.5 px-2 pt-0.5",
          collapsed && "lg:mb-4 lg:flex-col-reverse lg:items-center lg:gap-2 lg:px-0"
        )}
      >
        {/* En móvil el cajón necesita su propio cierre: el velo no siempre es
            alcanzable con el pulgar. */}
        <button
          onClick={onClose}
          aria-label="Cerrar el menú"
          className="-ml-1 mt-0.5 rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <div className={cn("min-w-0", collapsed && "lg:flex lg:justify-center")}>
          {collapsed && (
            <span className="hidden lg:inline-flex">
              <BrandTile
                branding={branding}
                className="h-[30px] w-[30px] rounded-[9px] text-[15px]"
              />
            </span>
          )}
          <span className={cn("block", collapsed && "lg:hidden")}>
            <BrandLogo branding={branding} />
            <span className="kicker mt-2 block">CRM · WhatsApp</span>
          </span>
        </div>
        {/* Colapsar/expandir el toolbar (escritorio). */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir el menú lateral" : "Colapsar el menú lateral"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir el menú lateral" : "Colapsar el menú lateral"}
          className={cn(
            "ml-auto hidden rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:inline-flex",
            collapsed && "lg:ml-0"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.8} />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.8} />
          )}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          // Un solo contador por ítem: inline cuando hay texto, sobre el
          // ícono cuando el toolbar está colapsado (solo escritorio).
          const count =
            item.badge === "crm"
              ? unread
              : item.badge === "internal"
                ? internalUnread
                : item.badge === "alerts"
                  ? alertsPending
                  : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                navItemClass(active),
                collapsed && "lg:justify-center lg:gap-0 lg:px-0"
              )}
            >
              <span className="relative shrink-0">
                <item.icon
                  className={cn("h-[17px] w-[17px]", active ? "text-brand" : "text-text-3")}
                  strokeWidth={1.8}
                />
                {count > 0 && (
                  <span
                    className={cn(
                      "absolute -right-2 -top-1.5 hidden h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-bold text-brand-fg",
                      collapsed && "lg:flex"
                    )}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className={cn("flex-1", collapsed && "lg:hidden")}>
                {item.label}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold text-brand-fg",
                    collapsed && "lg:hidden"
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* 023 — Sucursal del día: dónde trabaja hoy (rota entre oficinas). */}
      <OfficeTodayPicker compact={collapsed} />

      {/* 021 — Ajustes: el administrador entra solo por Equipo; el miembro no lo ve. */}
      {role !== "member" && (
        <Link
          href="/settings"
          title={collapsed ? "Ajustes" : undefined}
          aria-label={collapsed ? "Ajustes" : undefined}
          className={cn(
            navItemClass(settingsActive),
            collapsed && "lg:justify-center lg:gap-0 lg:px-0"
          )}
        >
          <Settings
            className={cn("h-[17px] w-[17px]", settingsActive ? "text-brand" : "text-text-3")}
            strokeWidth={1.8}
          />
          <span className={cn(collapsed && "lg:hidden")}>Ajustes</span>
        </Link>
      )}

      <div
        className={cn(
          "mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent",
          collapsed && "lg:flex-col lg:gap-1.5 lg:px-1"
        )}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-text"
          title={`${userName} · ${
            role === "owner"
              ? "Propietario"
              : role === "admin"
                ? "Administrador"
                : "Miembro"
          }`}
        >
          {initials(userName)}
        </span>
        <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block truncate text-[11px] text-text-3">
            {role === "owner"
              ? "Propietario"
              : role === "admin"
                ? "Administrador"
                : "Miembro"}{" "}
            · En línea
          </span>
        </span>
        <ThemeToggle initial={theme} />
        <button
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded p-1 text-text-3 hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>

      {/* Qué versión está corriendo. Discreta pero siempre visible: la duda
          "¿ya se desplegó?" aparece justo cuando algo no funciona, y mandar a
          alguien a comparar commits en el servidor significa que no lo hará. */}
      {/* `text-2` y no `text-3`: a 10.5px, el gris más claro no pasa AA contra
          el fondo de la barra. Discreta sí, ilegible no. */}
      {/* El nombre sale de la marca, no de una constante: esto es white-label,
          y una instancia rebautizada que dice "Vocero" en el tooltip delata el
          producto de debajo justo donde el operador la mira todos los días. */}
      <p
        className={cn(
          "mt-2 px-2.5 font-mono text-[10.5px] tracking-[0.06em] text-text-2",
          collapsed && "lg:hidden"
        )}
        title={
          sha
            ? `${branding.name} ${APP_VERSION}, construido del commit ${sha}`
            : `${branding.name} ${APP_VERSION}`
        }
      >
        {versionLabel(sha)}
      </p>
    </aside>
  );
}
