"use client";

import { useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

/**
 * 038 — El cockpit ejecutivo (rafael-intelligence) embebido a pantalla
 * completa.
 *
 * Es un iframe a propósito: el cockpit es un producto vivo con su propio
 * ciclo de deploy y acá se muestra TAL CUAL — todas sus secciones, filtros,
 * listas y acciones siguen siendo las suyas. Este componente solo aporta el
 * marco: un velo de carga que se retira cuando el documento termina de
 * cargar, y dos acciones discretas (recargar / abrir en una pestaña nueva)
 * para cuando el iframe se queda corto.
 *
 * Sin atributo `sandbox`: es un dominio propio y las restricciones romperían
 * el almacenamiento (ayuda, motor de sugerencias, filtros) y los pop-ups del
 * cockpit. `clipboard-write` sí se habilita: el cockpit copia mensajes de
 * WhatsApp listos para enviar.
 */
export function DashboardManagementFrame({ url }: { url: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function reload() {
    setLoaded(false);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="relative h-full w-full">
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={reloadKey === 0 ? url : `${url}/?reload=${reloadKey}`}
        title="Dashboard Management"
        className="h-full w-full border-0"
        allow="clipboard-write; fullscreen"
        onLoad={() => setLoaded(true)}
      />

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-text-3" strokeWidth={1.8} />
            <p className="text-[13px] font-semibold text-text-2">
              Abriendo el dashboard…
            </p>
            <p className="max-w-[280px] text-center text-[11.5px] text-text-3">
              El tablero cruza cartera, historial y CRM. La primera carga puede
              demorar unos segundos.
            </p>
          </div>
        </div>
      )}

      {/* Acciones discretas: esquina inferior derecha, no compiten con el
          cockpit (que tiene su propia barra arriba). */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        <button
          onClick={reload}
          title="Recargar el dashboard"
          aria-label="Recargar el dashboard"
          className="rounded-md border bg-subtle/90 p-2 text-text-2 shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir en una pestaña nueva"
          aria-label="Abrir en una pestaña nueva"
          className="rounded-md border bg-subtle/90 p-2 text-text-2 shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
        </a>
      </div>
    </div>
  );
}
