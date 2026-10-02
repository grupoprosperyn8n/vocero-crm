"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, UserPlus, X } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabel } from "@/lib/roles";
import { Select } from "@/components/ui/select";

type Viewer = { userId: string; role: string };

type Member = {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
  /** Ficha del empleado (sync LOGIN v2); null si la cuenta es manual. */
  employeeCode: string | null;
  operationalRole: string | null;
  locality: string | null;
  sourceStatus: string | null;
  /** 020 — Fuera de línea manual: no puede entrar hasta "Poner online". */
  offlineAt: string | null;
  offlineByName: string | null;
  createdAt: string;
  /** 032 — foto de perfil (proxy /api/avatars), null si no tiene. */
  avatarUrl: string | null;
};

/**
 * Espejo EXACTO de las reglas del servidor (PATCH /api/settings/team):
 * propietario → maneja miembros, gerentes y administradores; administrador →
 * solo miembros y gerentes; nadie a sí mismo; al propietario no se lo toca.
 */
function canManageMember(viewer: Viewer | null, m: Member): boolean {
  if (!viewer) return false;
  if (m.userId === viewer.userId || m.role === "owner") return false;
  if (viewer.role === "owner") return true;
  if (viewer.role === "admin") return m.role !== "admin";
  return false;
}

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 044b-B10 — editar / eliminar cuentas MANUALES del CRM (sin ficha).
  const [editing, setEditing] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { members: Member[]; viewer: Viewer };
    setMembers(data.members);
    setViewer(data.viewer ?? null);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function genPass(): string {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  }

  function generatePassword() {
    setTempPassword(genPass());
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la cuenta");
      return;
    }
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setTempPassword("");
    void refetch();
  }

  async function toggleOffline(m: Member) {
    setBusyId(m.id);
    setActionError(null);
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: m.id, offline: !m.offlineAt }),
    }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setActionError(data?.error?.message ?? "No se pudo cambiar el estado");
      return;
    }
    void refetch();
  }

  /** 026 — cambiar el rol: Gerente ve toda la bandeja; Miembro solo lo suyo. */
  async function setRole(m: Member, role: string) {
    setBusyId(m.id);
    setActionError(null);
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: m.id, role }),
    }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setActionError(data?.error?.message ?? "No se pudo cambiar el rol");
      return;
    }
    void refetch();
  }

  /** 044b-B10 — editar una cuenta MANUAL del CRM (nombre, correo, clave). */
  function openEdit(m: Member) {
    setEditing(m);
    setEditName(m.name);
    setEditEmail(m.email);
    setEditPassword("");
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const patch: Record<string, string> = { memberId: editing.id };
    if (editName.trim() && editName.trim() !== editing.name) {
      patch.name = editName.trim();
    }
    if (editEmail.trim() && editEmail.trim() !== editing.email) {
      patch.email = editEmail.trim();
    }
    if (editPassword.length >= 8) patch.password = editPassword;
    if (Object.keys(patch).length === 1) {
      setEditing(null);
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setEditSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setEditError(data?.error?.message ?? "No se pudo guardar la cuenta");
      return;
    }
    setEditing(null);
    void refetch();
  }

  async function removeMember() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await fetch("/api/settings/team", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: deleting.id }),
    }).catch(() => null);
    setDeleteBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setDeleteError(data?.error?.message ?? "No se pudo eliminar la cuenta");
      return;
    }
    setDeleting(null);
    void refetch();
  }

  const canManage = viewer?.role === "owner" || viewer?.role === "admin";

  return (
    <div className="max-w-2xl space-y-6">
      {/* 021 — Alta de cuentas: propietario y administrador (el server lo
          re-valida). */}
      {(viewer?.role === "owner" || viewer?.role === "admin") && (
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de equipo</CardTitle>
          <CardDescription>
            Sin correos ni invitaciones: comparte tú mismo la contraseña
            temporal con tu compañero (se muestra UNA sola vez).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                id="team-password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="mínimo 8 caracteres"
              />
              <Button variant="outline" onClick={generatePassword}>
                Generar
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm">
              <p className="font-medium text-success-text">Cuenta creada ✓</p>
              <p className="mt-1 text-success-text opacity-90">
                Comparte estos datos ahora (no se volverán a mostrar):
                <br />
                <code>{created.email}</code> · contraseña{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Creando…" : "Crear cuenta"}
          </Button>
        </CardContent>
      </Card>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Miembros
        </p>
        {canManage && (
          <p className="text-xs text-muted-foreground">
            Dejar offline corta el acceso sin borrar nada: la cuenta conserva
            su ficha y su historial, y podés ponerla online cuando quieras.
            El rol decide qué ve cada uno en la bandeja: un gerente ve todas
            las conversaciones (y puede filtrar por empleado); un miembro, solo
            las suyas.
          </p>
        )}
        {actionError && (
          <p className="text-sm text-destructive">{actionError}</p>
        )}
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <ContactAvatar name={m.name} seed={m.id} size="sm" src={m.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
              {(m.employeeCode ||
                m.operationalRole ||
                m.locality ||
                m.sourceStatus) && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[m.employeeCode, m.operationalRole, m.locality, m.sourceStatus]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {m.offlineAt && (
                <p className="mt-0.5 truncate text-xs text-warning-text">
                  Fuera de línea
                  {m.offlineByName ? ` — por ${m.offlineByName}` : ""}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {m.offlineAt && <Badge variant="warning">Offline</Badge>}
              {m.employeeCode && (
                <Badge
                  variant="secondary"
                  title="Cuenta del sistema (ficha de empleado): se edita o elimina desde el sistema"
                >
                  Sistema
                </Badge>
              )}
              {/* 026 — el rol se elige en el lugar (espejo de las reglas del
                  server): Gerente ve toda la bandeja; Administrador solo lo
                  reparte el propietario. */}
              {canManageMember(viewer, m) ? (
                <Select
                  value={m.role}
                  onChange={(v) => void setRole(m, v)}
                  disabled={busyId === m.id}
                  ariaLabel={`Rol de ${m.name}`}
                  className="rounded-md border bg-background px-2 py-1 text-xs font-medium"
                  options={[
                    { value: "member", label: "Miembro" },
                    { value: "manager", label: "Gerente" },
                    ...(viewer?.role === "owner"
                      ? [{ value: "admin", label: "Administrador" }]
                      : []),
                  ]}
                />
              ) : (
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {roleLabel(m.role)}
                </Badge>
              )}
              {canManageMember(viewer, m) && (
                <Button
                  variant={m.offlineAt ? "secondary" : "outline"}
                  size="sm"
                  disabled={busyId === m.id}
                  onClick={() => void toggleOffline(m)}
                >
                  {busyId === m.id
                    ? "…"
                    : m.offlineAt
                      ? "Poner online"
                      : "Dejar offline"}
                </Button>
              )}
              {/* 044b-B10 — las cuentas del CRM (manuales) se editan y
                  eliminan desde acá; las del sistema no se tocan. */}
              {canManageMember(viewer, m) && !m.employeeCode && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === m.id}
                    onClick={() => openEdit(m)}
                    title="Editar la cuenta (nombre, correo, contraseña)"
                    aria-label={`Editar ${m.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === m.id}
                    onClick={() => {
                      setDeleting(m);
                      setDeleteError(null);
                    }}
                    title="Eliminar la cuenta"
                    aria-label={`Eliminar ${m.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-label="Editar cuenta"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Editar cuenta de {editing.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nombre</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Correo</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-pass">
                  Nueva contraseña (dejala vacía para no cambiarla)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-pass"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="mínimo 8 caracteres"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setEditPassword(genPass())}
                  >
                    Generar
                  </Button>
                </div>
              </div>
              {editError && (
                <p className="text-sm text-destructive">{editError}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button disabled={editSaving} onClick={() => void saveEdit()}>
                {editSaving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div
          role="dialog"
          aria-label="Eliminar cuenta"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Eliminar la cuenta de {deleting.name}
              </h3>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Se borra la cuenta y su acceso al CRM (no se puede deshacer). El
              historial de conversaciones, gestiones y tareas queda sin
              asignar; nada se pierde.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-destructive">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void removeMember()}
              >
                {deleteBusy ? "Eliminando…" : "Eliminar cuenta"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
