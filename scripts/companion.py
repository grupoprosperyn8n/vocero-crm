#!/usr/bin/env python3
"""
Vocero Companion — puente local entre la UI web del CRM y los agentes CLI de
ESTA máquina (la que abrió el navegador). Enmienda 1 (Agent-First): la web
detecta los agentes donde corre el browser, sin instalar nada en el VPS.

Endpoints (127.0.0.1:8790, CORS abierto para localhost):
  GET  /api/agents       → agentes CLI detectados (which + versión)
  GET  /api/repo         → estado del checkout local del repo
  POST /api/automejora   → {agent, objetivo, follow_up?, run_id?}
                           Crea un run (objetivo) o un turno de seguimiento
                           sobre un run existente (modo sesión/chat). El
                           primer turno pushea automático; los follow-ups NO
                           (el push es manual desde la UI con gates en verde).
  POST /api/automejora/push → {run_id}: gates + push de lo pendiente
  GET  /api/run/<id>     → estado/resultado de una corrida (polling)

Uso:  python3 scripts/companion.py [--port 8790] [--repo ~/Documentos/vocero-crm]
Sin dependencias (stdlib). Python 3.10+.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8790
REPO_DEFAULT = str(Path.home() / "Documentos" / "vocero-crm")

# Agentes detectables: id → (comando, flag de versión)
AGENT_DEFS = {
    "codex": ("codex", ["--version"]),
    "claude": ("claude", ["--version"]),
    "hermes": ("hermes", ["--version"]),
    "opencode": ("opencode", ["--version"]),
    "gemini": ("gemini", ["--version"]),
}

# Comando headless por agente. El objetivo SIEMPRE aterriza con la misma
# instrucción: seguir AGENTS.md (Enmienda 1) y los gates del repo.
HEADLESS = {
    "codex": lambda prompt: ["codex", "exec", "--full-auto", prompt],
    "claude": lambda prompt: ["claude", "-p", prompt, "--dangerously-skip-permissions"],
    "opencode": lambda prompt: ["opencode", "run", prompt],
    # Hermes Agent: -z ejecuta un prompt en modo no interactivo (verificado).
    "hermes": lambda prompt: ["hermes", "-z", prompt],
    # gemini CLI tiene -p headless pero requiere auth (~/.gemini/settings.json
    # o GEMINI_API_KEY) Y carpeta "trusted" (si no, yolo se degrada a prompts
    # y el run queda esperando). Habilitar cuando haya auth configurada:
    # "gemini": lambda prompt: ["gemini", "-p", prompt, "--approval-mode", "yolo"],
}

AGENTS_MD_INSTR = (
    "Seguí AGENTS.md del repo (y CLAUDE.md si existe): gates typecheck+lint+test "
    "en verde y self-test cuando aplique. No preguntes pasos reversibles; "
    "bloqueate solo ante acciones irreversibles (merge a main, borrado, gastar dinero)."
)

RUNS: dict[str, dict] = {}
RUNS_LOCK = threading.Lock()

# Cache de detección: los --version de 5 CLIs tardan ~6s; con TTL de 15s la
# UI (heartbeat/reintentos) obtiene respuesta instantánea.
_AGENTS_CACHE_TS = 0.0
_AGENTS_CACHE_DATA: list[dict] = []
_AGENTS_LOCK = threading.Lock()
AGENTS_TTL_S = 15


def detect_agents(use_cache: bool = True) -> list[dict]:
    global _AGENTS_CACHE_TS, _AGENTS_CACHE_DATA
    now = time.time()
    if use_cache:
        with _AGENTS_LOCK:
            if now - _AGENTS_CACHE_TS < AGENTS_TTL_S:
                return list(_AGENTS_CACHE_DATA)
    out = []
    for aid, (bin_name, ver_flags) in AGENT_DEFS.items():
        path = shutil.which(bin_name)
        if not path:
            continue
        version = ""
        try:
            r = subprocess.run([bin_name, *ver_flags], capture_output=True,
                               text=True, timeout=4)
            version = (r.stdout or r.stderr or "").strip().splitlines()
            version = version[0][:80] if version else ""
        except Exception:
            version = ""
        out.append({
            "id": aid,
            "bin": bin_name,
            "path": path,
            "version": version,
            "headless": aid in HEADLESS,
        })
    with _AGENTS_LOCK:
        _AGENTS_CACHE_TS = time.time()
        _AGENTS_CACHE_DATA = out
    return out


def repo_state(repo: str) -> dict:
    def git(*args: str) -> str:
        try:
            r = subprocess.run(["git", "-C", repo, *args],
                               capture_output=True, text=True, timeout=10)
            return r.stdout.strip()
        except Exception:
            return ""
    return {
        "repo": repo,
        "exists": Path(repo, ".git").is_dir(),
        "branch": git("branch", "--show-current"),
        "commit": git("rev-parse", "--short", "HEAD"),
        "dirty": bool(git("status", "--porcelain")),
    }


def git_ahead(repo: str) -> int:
    """Commits locales sin pushear (el agente puede commitear y no pushear)."""
    try:
        r = subprocess.run(["git", "-C", repo, "rev-list", "--count",
                            "@{u}..HEAD"], capture_output=True, text=True,
                           timeout=15)
        return int((r.stdout or "0").strip() or "0")
    except Exception:
        return 0


def run_gates(repo: str, log: list[str]) -> bool:
    pnpm = shutil.which("pnpm") or os.path.expanduser(
        "~/.nvm/versions/node/v22.23.2/bin/pnpm")
    for cmd in ("typecheck", "lint", "test"):
        log.append(f"$ pnpm {cmd}")
        try:
            r = subprocess.run([pnpm, cmd], cwd=repo, capture_output=True,
                               text=True, timeout=600)
        except subprocess.TimeoutExpired:
            log.append(f"⛔ pnpm {cmd}: TIMEOUT")
            return False
        tail = (r.stdout or "")[-600:] + (r.stderr or "")[-600:]
        log.append(f"exit={r.returncode}")
        if r.returncode != 0:
            log.append(tail)
            return False
    return True


def push_pending(repo: str, agent: str, objetivo: str, log: list[str]) -> tuple[bool, str | None]:
    """Commit de lo sucio (si hay) + push. Devuelve (ok, commit)."""
    st = repo_state(repo)
    dirty = st["dirty"]
    ahead = git_ahead(repo)
    if not dirty and ahead == 0:
        log.append("ℹ️ sin cambios ni commits locales — nada que pushear")
        return True, None
    if dirty:
        git_cfg = ["-c", "user.name=grupoprosperyn8n",
                   "-c", "user.email=grupoprosperyn8n@users.noreply.github.com"]
        subprocess.run(["git", "-C", repo, *git_cfg, "add", "-A"],
                       capture_output=True, timeout=30)
        subprocess.run(["git", "-C", repo, *git_cfg, "commit", "-m",
                        f"automejora({agent}): {objetivo[:100]}"],
                       capture_output=True, timeout=30)
    p = subprocess.run(["git", "-C", repo, "push", "origin",
                        repo_state(repo)["branch"]],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        log.append(f"⛔ push falló: {(p.stderr or '')[-400:]}")
        return False, None
    commit = repo_state(repo)["commit"]
    log.append(f"✅ pusheado {commit} — Coolify deploya si el webhook está activo")
    return True, commit


def build_prompt(objetivo: str, run: dict | None, follow_up: str | None) -> str:
    """Prompt del turno: con follow_up, incluye el historial de la sesión."""
    if not follow_up:
        return f"{objetivo}\n\n{AGENTS_MD_INSTR}"
    msgs = (run or {}).get("messages", [])
    history = "\n".join(
        f"- {m['role']}: {m['content'][:400]}" for m in msgs[-8:]
    )
    return (
        f"CONTEXTO DE LA SESIÓN DE MEJORA (ya aplicado en el repo):\n{history}\n\n"
        f"NUEVO MENSAJE DEL DUEÑO: {follow_up}\n\n"
        f"Objetivo original: {objetivo}\n\n{AGENTS_MD_INSTR}"
    )


def run_turn(run: dict, prompt: str) -> None:
    """Ejecuta UN turno del agente sobre el repo (worker thread)."""
    repo = REPO
    agent = run["agent"]
    log = run["log"]
    log.append(f"\n——— turno {run['turn']} ———")
    try:
        if agent not in HEADLESS:
            log.append(f"⛔ agente '{agent}' no soporta headless todavía")
            run["status"] = "failed"
            return
        if not Path(repo, ".git").is_dir():
            log.append(f"⛔ repo no encontrado en {repo}")
            run["status"] = "failed"
            return
        log.append(f"repo: {repo} @ {repo_state(repo)['branch']}")
        log.append(f"$ {agent} (headless)…")
        r = subprocess.run(HEADLESS[agent](prompt), cwd=repo,
                           capture_output=True, text=True, timeout=1800)
        out = (r.stdout or "")[-3000:] + (r.stderr or "")[-1000:]
        log.append(out or "(sin salida)")
        if r.returncode != 0:
            log.append(f"⛔ {agent} salió con código {r.returncode}")
            run["status"] = "failed"
            return
        # Gates — obligatorios en cada turno.
        if not run_gates(repo, log):
            log.append("⛔ gates en rojo — los cambios quedaron en el repo. "
                       "Iterá (corregí el rumbo) o revertí.")
            run["status"] = "gates_failed"
            return
        if run["auto_push"]:
            ok, commit = push_pending(repo, agent, run["objetivo"], log)
            run["commit"] = commit
            run["status"] = "done" if ok else "push_failed"
        else:
            st = repo_state(repo)
            dirty = st["dirty"] or git_ahead(repo) > 0
            if dirty:
                run["status"] = "ready_to_push"
                log.append("ℹ️ cambios listos — pushealos desde la UI cuando quieras "
                           "(botón 'Pushear cambios', re-corre gates).")
            else:
                run["status"] = "done"
                log.append("ℹ️ sin cambios nuevos en este turno.")
    except subprocess.TimeoutExpired:
        log.append("⛔ timeout del agente (30 min)")
        run["status"] = "failed"
    except Exception as e:  # noqa: BLE001
        log.append(f"⛔ error: {e}")
        run["status"] = "failed"


def start_run(agent: str, objetivo: str, follow_up: str | None = None,
              run_id: str | None = None, auto_push: bool = True) -> dict:
    """Crea un run (objetivo) o un turno sobre un run existente (follow_up)."""
    with RUNS_LOCK:
        if run_id:
            run = RUNS.get(run_id)
            if not run:
                return {"ok": False, "error": "run no encontrado"}
            if run["status"] == "running":
                return {"ok": False, "error": "el run sigue en ejecución"}
            if run["agent"] != agent:
                return {"ok": False, "error": f"el run es del agente {run['agent']}"}
            run["status"] = "running"
            run["turn"] += 1
            run["auto_push"] = auto_push
            run["messages"].append({"role": "user", "content": follow_up or objetivo})
            rid = run_id
        else:
            rid = uuid.uuid4().hex[:10]
            run = {
                "id": rid, "agent": agent, "status": "running",
                "objetivo": objetivo, "turn": 1, "auto_push": auto_push,
                "messages": [{"role": "user", "content": objetivo}],
                "log": [], "commit": None, "started": time.time(),
            }
            RUNS[rid] = run

    prompt = build_prompt(objetivo, run, follow_up)
    threading.Thread(target=run_turn, args=(run, prompt), daemon=True).start()
    return {"ok": True, "id": rid, "status": "running"}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome/Edge (Private Network Access): una página https NO puede
        # fetchear a 127.0.0.1 sin este header en el preflight OPTIONS.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):  # noqa: N802
        if self.path == "/api/agents":
            return self._json(200, {"ok": True, "agents": detect_agents()})
        if self.path == "/api/repo":
            return self._json(200, {"ok": True, **repo_state(REPO)})
        if self.path.startswith("/api/run/"):
            rid = self.path.rsplit("/", 1)[-1]
            with RUNS_LOCK:
                run = RUNS.get(rid)
            if not run:
                return self._json(404, {"ok": False, "error": "run no encontrado"})
            return self._json(200, {"ok": True, "run": run})
        return self._json(404, {"ok": False, "error": "not found"})

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return None

    def do_POST(self):  # noqa: N802
        if self.path == "/api/automejora":
            body = self._read_body()
            if body is None:
                return self._json(400, {"ok": False, "error": "json inválido"})
            agent = (body.get("agent") or "").strip()
            objetivo = (body.get("objetivo") or "").strip()
            follow_up = (body.get("follow_up") or "").strip() or None
            run_id = (body.get("run_id") or "").strip() or None
            # auto_push acepta bool o string ("true"/"false" desde la UI).
            raw_ap = body.get("auto_push")
            if raw_ap is None:
                auto_push = not bool(follow_up)
            elif isinstance(raw_ap, bool):
                auto_push = raw_ap
            else:
                auto_push = str(raw_ap).lower() in ("1", "true", "yes")
            if follow_up:
                auto_push = False  # los follow-ups jamás pushean solos
            if not agent or (not objetivo and not follow_up):
                return self._json(400, {"ok": False,
                                        "error": "faltan agent/objetivo"})
            detected = {a["id"] for a in detect_agents()}
            if agent not in detected:
                return self._json(404, {"ok": False,
                                        "error": f"agente '{agent}' no detectado"})
            r = start_run(agent, objetivo, follow_up, run_id, auto_push)
            code = 200 if r.get("ok") else 400
            return self._json(code, r)
        if self.path == "/api/automejora/push":
            body = self._read_body()
            if body is None:
                return self._json(400, {"ok": False, "error": "json inválido"})
            rid = (body.get("run_id") or "").strip()
            with RUNS_LOCK:
                run = RUNS.get(rid)
            if not run:
                return self._json(404, {"ok": False, "error": "run no encontrado"})
            if run["status"] == "running":
                return self._json(400, {"ok": False,
                                        "error": "el run sigue en ejecución"})

            def do_push():
                log = run["log"]
                log.append("\n——— push manual ———")
                if not run_gates(REPO, log):
                    log.append("⛔ gates en rojo — NO se pushea")
                    run["status"] = "gates_failed"
                    return
                ok, commit = push_pending(REPO, run["agent"], run["objetivo"], log)
                run["commit"] = commit
                run["status"] = "done" if ok else "push_failed"

            run["status"] = "running"
            threading.Thread(target=do_push, daemon=True).start()
            return self._json(200, {"ok": True, "id": rid, "status": "running"})
        return self._json(404, {"ok": False, "error": "not found"})

    def log_message(self, format: str, *args):  # silenciar
        pass


def main():
    global PORT, REPO
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--repo", default=REPO_DEFAULT)
    args = ap.parse_args()
    PORT, REPO = args.port, args.repo
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Vocero Companion en http://127.0.0.1:{PORT}  (repo: {REPO})")
    print("Agentes detectados:", [a["id"] for a in detect_agents()])
    srv.serve_forever()


if __name__ == "__main__":
    main()
