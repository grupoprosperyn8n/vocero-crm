import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad — GYP CRM",
  description:
    "Cómo GYP CRM recolecta, usa y protege los datos de las personas y de los negocios que usan el CRM.",
};

const actualizado = "19 de noviembre de 2026";
const contacto = "grupoprospery@gmail.com";

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[15px] leading-relaxed text-slate-700">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Política de privacidad
      </h1>
      <p className="mt-2 text-sm text-slate-500">Última actualización: {actualizado}</p>

      <p className="mt-8">
        GYP CRM es un sistema de gestión de conversaciones de WhatsApp para negocios.
        Esta política explica qué datos tratamos cuando un negocio usa GYP CRM, cuando una
        persona escribe a un negocio que usa GYP CRM, y cuando alguien inicia sesión en
        nuestra plataforma con su cuenta de Facebook.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">1. Quién es el responsable</h2>
      <p className="mt-3">
        El responsable del tratamiento es el negocio que contrata GYP CRM respecto de sus
        propios clientes, y Sistemas Agenticos respecto de la operación de la plataforma.
        El contacto por cualquier tema de privacidad es{" "}
        <a className="text-blue-700 underline" href={`mailto:${contacto}`}>
          {contacto}
        </a>
        .
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">2. Qué datos tratamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          Datos de la cuenta del negocio: nombre, correo electrónico, rol dentro del equipo
          y credenciales de acceso.
        </li>
        <li>
          Datos de conexión con WhatsApp Business: identificadores de la cuenta de WhatsApp
          Business, del número de teléfono y del portfolio comercial, junto con los tokens
          que Meta emite para operar esa cuenta en nombre del negocio.
        </li>
        <li>
          Conversaciones: mensajes enviados y recibidos por el negocio a través de GYP CRM,
          junto con el nombre y el número de teléfono del contacto y las etiquetas o notas
          que el equipo del negocio agregue.
        </li>
        <li>
          Datos técnicos: registros de acceso, dirección IP, tipo de dispositivo y errores
          de la aplicación, con fines de seguridad y diagnóstico.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">3. Para qué los usamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Prestar el servicio: recibir, mostrar, responder y automatizar conversaciones.</li>
        <li>Conectar y mantener la cuenta de WhatsApp Business del negocio con Meta.</li>
        <li>Autenticar a las personas del equipo y aplicar los permisos que el negocio define.</li>
        <li>Detectar abusos, prevenir fraude y resolver incidentes técnicos.</li>
        <li>Cumplir obligaciones legales y responder requerimientos de autoridad competente.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        4. Inicio de sesión con Facebook
      </h2>
      <p className="mt-3">
        Si una persona elige iniciar sesión con Facebook, recibimos de Meta su identificador
        de usuario, su nombre público y su correo electrónico, únicamente para identificarla
        y vincularla al negocio al que fue invitada. No publicamos nada en su nombre ni
        accedemos a su lista de amigos, a sus publicaciones ni a sus mensajes personales. Los
        permisos sobre activos comerciales se otorgan por separado y el negocio puede
        revocarlos en cualquier momento desde su configuración de Meta.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">5. Con quién los compartimos</h2>
      <p className="mt-3">
        Con Meta Platforms para enviar y recibir mensajes de WhatsApp, tal como lo exige la
        Plataforma de WhatsApp Business. Con el proveedor de infraestructura que aloja la
        aplicación. No vendemos datos personales ni los cedemos a terceros con fines
        publicitarios.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">6. Cuánto tiempo los guardamos</h2>
      <p className="mt-3">
        Las conversaciones se conservan mientras el negocio mantenga su cuenta activa o
        hasta que solicite su eliminación. Los registros técnicos se conservan por un máximo
        de doce meses. Al eliminar una cuenta, los datos asociados se borran en un plazo de
        treinta días, salvo aquellos que debamos conservar por obligación legal.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">7. Seguridad</h2>
      <p className="mt-3">
        Las credenciales de Meta se guardan cifradas, el acceso a la plataforma requiere
        autenticación y los permisos se asignan por rol. El tráfico viaja cifrado mediante
        HTTPS. Ningún sistema es infalible: si se produce un incidente que afecte datos
        personales, notificaremos a los negocios afectados y a la autoridad cuando
        corresponda.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">8. Tus derechos</h2>
      <p className="mt-3">
        Podés solicitar acceso, corrección, actualización o eliminación de tus datos
        escribiendo a{" "}
        <a className="text-blue-700 underline" href={`mailto:${contacto}`}>
          {contacto}
        </a>
        . Si escribiste a un negocio que usa GYP CRM y querés que no te envíe más mensajes,
        podés responder «BAJA» en la conversación o pedirlo por ese mismo correo. La
        Ley 25.326 de Protección de Datos Personales de Argentina reconoce el derecho a
        presentar una denuncia ante la Agencia de Acceso a la Información Pública.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">9. Eliminación de datos</h2>
      <p className="mt-3">
        Para pedir la eliminación de tu cuenta y de los datos asociados, escribí a{" "}
        <a className="text-blue-700 underline" href={`mailto:${contacto}`}>
          {contacto}
        </a>{" "}
        indicando el número de teléfono o el correo con el que te registraste. Confirmamos la
        recepción y completamos el borrado en un plazo de treinta días.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">10. Cambios</h2>
      <p className="mt-3">
        Si modificamos esta política, publicaremos la versión nueva en esta misma dirección
        con su fecha de actualización.
      </p>

      <p className="mt-12 text-sm text-slate-500">
        <Link className="text-blue-700 underline" href="/login">
          Volver al inicio de sesión
        </Link>
      </p>
    </main>
  );
}
