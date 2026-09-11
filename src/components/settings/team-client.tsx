"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
};

function roleLabel(role: string): string {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  return "Miembro";
}

/**
 * Espejo EXACTO de las reglas del servidor (PATCH /api/settings/team), para
 * no mostrar botones que van a rebotar: propietario → maneja miembros y
 * administradores; administrador → solo miembros; nadie a sí mismo; al
 * propietario no se lo toca.
 */
function canToggle(viewer: Viewer | null, m: Member): boolean {
  if (!viewer) return false;
  if (m.userId === viewer.userId || m.role === "owner") return false;
  if (viewer.role === "owner") return true;
  if (viewer.role === "admin") return m.role === "member";
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

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
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

  const canManage = viewer?.role === "owner" || viewer?.role === "admin";

  return (
    <div className="max-w-2xl space-y-6">
      {/* 021 — Alta de cuentas: solo el propietario (el server lo re-valida). */}
      {viewer?.role === "owner" && (
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
            <ContactAvatar name={m.name} seed={m.id} size="sm" />
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
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                {roleLabel(m.role)}
              </Badge>
              {canToggle(viewer, m) && (
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
