from __future__ import annotations

import re
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from web.bridge import new_game, run_engine

ROOT = Path(__file__).resolve().parent.parent
SESSION_DIR = ROOT / "sessions"

app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="")


def _safe_session_id(sid: str) -> str | None:
    if not sid or len(sid) > 64:
        return None
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", sid):
        return None
    return sid


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/session", methods=["POST"])
def create_session():
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    sid = uuid.uuid4().hex
    data = request.get_json(silent=True) or {}
    names = data.get("names") or []
    if isinstance(names, str):
        names = [names]
    if not names:
        names = ["勇者"]
    names = [str(n)[:32] for n in names if str(n).strip()][:4]
    path = SESSION_DIR / f"{sid}.dat"
    payload = new_game(path, names)
    payload["session"] = sid
    return jsonify(payload)


@app.route("/api/action", methods=["POST"])
def action():
    data = request.get_json(silent=True) or {}
    sid = _safe_session_id(str(data.get("session", "")))
    if not sid:
        return jsonify({"ok": False, "message": "缺少或無效的 session"}), 400
    path = SESSION_DIR / f"{sid}.dat"
    if not path.is_file():
        return jsonify({"ok": False, "message": "找不到此 session，請重新開新局。"}), 404
    cmd = str(data.get("action", "")).strip().lower()
    allowed = {"explore", "attack", "defend", "flee", "undo", "use", "switch", "status"}
    if cmd not in allowed:
        return jsonify({"ok": False, "message": f"不支援的 action：{cmd}"}), 400
    arg = data.get("arg")
    arg_str = None
    if cmd in ("use", "switch"):
        if arg is None:
            return jsonify({"ok": False, "message": "use / switch 需要 arg（整數）"}), 400
        arg_str = str(int(arg))
    if cmd == "status":
        payload = run_engine(path, "status")
    else:
        payload = run_engine(path, cmd, arg_str)
    payload["session"] = sid
    return jsonify(payload)


@app.route("/api/state", methods=["GET"])
def state():
    sid = _safe_session_id(request.args.get("session", ""))
    if not sid:
        return jsonify({"ok": False, "message": "缺少或無效的 session"}), 400
    path = SESSION_DIR / f"{sid}.dat"
    if not path.is_file():
        return jsonify({"ok": False, "message": "找不到此 session"}), 404
    payload = run_engine(path, "status")
    payload["session"] = sid
    return jsonify(payload)
