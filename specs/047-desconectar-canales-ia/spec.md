# 047 — Desconectar canales (WhatsApp/Telegram) + recuperar la IA del usuario

Estado: EN CURSO (01Oct, pedido Diego)

## Problema
Diego (verbatim): «cómo hago para desconectar mi Telegram — tanto WhatsApp como Telegram tienen que poder desconectar, poner offline… y también la IA: desconectar la DeepSeek mía que está y conectarla real, no automáticamente; que también se pueda tener varias y cargadas y un selector de IA para poner offline o eliminar».

Hallazgos:
- Ajustes → WhatsApp y Ajustes → Telegram NO tienen ninguna forma de desconectarse desde la UI (ni API DELETE).
- La conexión DeepSeek heredada (`ai_settings`) se había migrado en 0046, pero se perdió al correr la verificación E2E de prod (el upsert por proveedor la reemplazó por la de prueba y el cleanup la borró) → hoy la IA corre por la del sistema (gpt-4o-mini) y la DeepSeek del usuario no aparece en Ajustes → IA.

## Qué se construye
1. `DELETE /api/settings/telegram`: apaga el webhook en Telegram (best-effort) + borra la conexión local. UI: botón «Desconectar» con confirmación en la tarjeta «Telegram activo».
2. `DELETE /api/settings/whatsapp`: borra las credenciales de la organización. UI: bloque «Desconectar este número» con confirmación en el modo conectado del asistente.
3. Migración `0047`: recupera la fila de `ai_settings` como conexión de Ajustes → IA, ahora INACTIVA (offline). Con eso el usuario la ve, la prueba, la activa/desconecta/elimina o carga otra (varias conexiones, una activa a la vez: ya existe del 046).

## Criterios
- Dev: click en Desconectar (ambos canales) → confirmación → la conexión se borra (fila desaparece) y la página vuelve al asistente/formulario; API 200; re-click sin conexión sigue 200 (no-op).
- Dev IA: la conexión recuperada aparece «Inactiva»; Probar / Activar / Desconectar / Eliminar funcionan.
- Prod: migración aplicada y visible; botones presentes. NO se desconectan los canales reales durante la verificación.
- Compuertas: typecheck + lint + test en verde.

## Decisiones
- «Desconectar» borra credenciales locales; NO se des-suscribe la app en Meta (reconectar re-suscribe; sin credenciales locales los eventos se ignoran). Telegram: `deleteWebhook` best-effort — si Telegram falla, se borra local igual.
- La conexión recuperada queda INACTIVA a propósito («no automáticamente»): la activa el usuario cuando quiera.
- Desconectar avisa en la UI que para reconectar hay que volver a pegar credenciales (token de BotFather / datos de Meta).

## Fuera de alcance
- Múltiples conexiones del MISMO proveedor (sigue: una por proveedor).
- «Pausar» sin borrar credenciales.
- Reconexión automática.
