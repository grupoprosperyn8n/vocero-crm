#!/usr/bin/env python3
"""
Vocero Companion — puente local entre la UI web del CRM y los agentes CLI de
ESTA máquina (la que abrió el navegador). Enmienda 1 (Agent-First): la web
detecta los agentes donde corre el browser, sin instalar nada en el VPS.

Endpoints (127.0.0.1:8790, CORS abierto para localhost):
  GET  /api/agents       → agentes CLI detectados (which + versión)
  GET  /api/repo         → estado del checkout local del repo
  POST /api/automejora   → {agent, objetivo}: corre el agente headless sobre
                           el repo, gates (typecheck/lint/test) y push si verde
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
    "aider": ("aider", ["--version"]),
}

# Comando headless por agente. El objetivo SIEMPRE aterriza con la misma
# instrucción: seguir AGENTS.md (Enmienda 1) y los gates del repo.
HEADLESS = {
    "codex": lambda obj: ["codex", "exec", "--full-auto",
                          f"{obj}\n\nSeguí AGENTS.md del repo: gates typecheck+lint+test en verde y self-test cuando aplique. No preguntes pasos reversibles; bloqueate solo ante acciones irreversibles."],
    "claude": lambda obj: ["claude", "-p",
                           f"{obj}\n\nSeguí AGENTS.md del repo: gates typecheck+lint+test en verde y self-test cuando aplique. No preguntes pasos reversibles.",
                           "--dangerously-skip-permissions"],
    "opencode": lambda obj: ["opencode", "run",
                             f"{obj}\n\nSeguí AGENTS.md del repo: gates typecheck+lint+test en verde y self-test cuando aplique."],
    # Hermes Agent: -z ejecuta un prompt en modo no interactivo (verificado).
    "hermes": lambda obj: ["hermes", "-z",
                           f"{obj}\n\nSeguí AGENTS.md del repo: gates typecheck+lint+test en verde y self-test cuando aplique. No preguntes pasos reversibles; bloqueate solo ante acciones irreversibles."],
    # gemini CLI tiene -p headless pero requiere auth (~/.gemini/settings.json
    # o GEMINI_API_KEY) Y carpeta "trusted" (si no, yolo se degrada a prompts
    # y el run queda esperando). Habilitar cuando haya auth configurada:
    # "gemini": lambda obj: ["gemini", "-p", f"{obj}\n\nSeguí AGENTS.md…", "--approval-mode", "yolo"],
}

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


def run_gates(repo: str, log: list[str]) -> bool:
    pnpm = shutil.which("pnpm") or os.path.expanduser("~/.nvm/versions/node/v22.23.2/bin/pnpm")
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


def run_automejora(agent: str, objetivo: str, repo: str) -> dict:
    run_id = uuid.uuid4().hex[:10]
    run = {"id": run_id, "agent": agent, "status": "running",
           "log": [], "commit": None, "started": time.time()}
    with RUNS_LOCK:
        RUNS[run_id] = run

    def work():
        log = run["log"]
        try:
            if agent not in HEADLESS:
                log.append(f"⛔ agente '{agent}' no soporta headless todavía")
                run["status"] = "failed"
                return
            if not Path(repo, ".git").is_dir():
                log.append(f"⛔ repo no encontrado en {repo}")
                run["status"] = "failed"
                return
            # 1) Estado previo
            log.append(f"repo: {repo} @ {repo_state(repo)['branch']}")
            # 2) Agente headless
            log.append(f"$ {agent} (headless)…")
            cmd = HEADLESS[agent](objetivo)
            r = subprocess.run(cmd, cwd=repo, capture_output=True,
                               text=True, timeout=1800)
            out = (r.stdout or "")[-3000:] + (r.stderr or "")[-1000:]
            log.append(out or "(sin salida)")
            if r.returncode != 0:
                log.append(f"⛔ {agent} salió con código {r.returncode}")
                run["status"] = "failed"
                return
            # 3) Gates
            if not run_gates(repo, log):
                log.append("⛔ gates en rojo — NO se pushea. Iterá vos o corregí.")
                run["status"] = "gates_failed"
                return
            # 4) Commit + push (solo si hay cambios)
            dirty = repo_state(repo)["dirty"]
            if not dirty:
                log.append("ℹ️ sin cambios en el repo — nada que pushear")
                run["status"] = "done"
                return
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
                run["status"] = "push_failed"
                return
            run["commit"] = repo_state(repo)["commit"]
            log.append(f"✅ pusheado {run['commit']} — Coolify deploya (si el webhook está activo)")
            run["status"] = "done"
        except subprocess.TimeoutExpired:
            log.append("⛔ timeout del agente")
            run["status"] = "failed"
        except Exception as e:  # noqa: BLE001
            log.append(f"⛔ error: {e}")
            run["status"] = "failed"

    threading.Thread(target=work, daemon=True).start()
    return {"id": run_id, "status": "running"}


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

    def do_POST(self):  # noqa: N802
        if self.path == "/api/automejora":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "json inválido"})
            agent = (body.get("agent") or "").strip()
            objetivo = (body.get("objetivo") or "").strip()
            if not agent or not objetivo:
                return self._json(400, {"ok": False,
                                        "error": "faltan agent/objetivo"})
            detected = {a["id"] for a in detect_agents()}
            if agent not in detected:
                return self._json(404, {"ok": False,
                                        "error": f"agente '{agent}' no detectado"})
            r = run_automejora(agent, objetivo, REPO)
            return self._json(200, {"ok": True, **r})
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
