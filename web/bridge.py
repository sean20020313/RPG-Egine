"""Invoke the C RPG engine (build/rpg_engine) and parse JSON from stdout."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def engine_path() -> Path:
    return _repo_root() / "build" / "rpg_engine"


def run_engine(state_path: Path, cmd: str, arg: str | None = None) -> dict:
    exe = engine_path()
    if not exe.is_file():
        return {"ok": False, "message": f"找不到 C 引擎：{exe}。請先執行 make。"}
    args = [str(exe), str(state_path), cmd]
    if arg is not None and arg != "":
        args.append(arg)
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    out = (proc.stdout or "").strip()
    if proc.returncode != 0 and not out:
        err = (proc.stderr or "").strip()
        return {"ok": False, "message": err or f"引擎結束碼 {proc.returncode}"}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"ok": False, "message": f"無法解析引擎輸出：{out[:200]}"}


def new_game(state_path: Path, names: list[str]) -> dict:
    exe = engine_path()
    if not exe.is_file():
        return {"ok": False, "message": f"找不到 C 引擎：{exe}。請先執行 make。"}
    args = [str(exe), str(state_path), "new", *names]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    out = (proc.stdout or "").strip()
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"ok": False, "message": (proc.stderr or out)[:300]}
