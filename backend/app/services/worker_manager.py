"""Admin Worker 动态管理：pool 扩缩、systemd 重启、autoscale 配置。"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

AUTOSCALE_MIN_KEY = "ai_movie:autoscale:min"
AUTOSCALE_MAX_KEY = "ai_movie:autoscale:max"
AUTOSCALE_ENABLED_KEY = "ai_movie:autoscale:enabled"

SYSTEMD_WORKER_UNIT = "ai-movie-worker.service"
BACKEND_ROOT = Path(__file__).resolve().parents[2]
AUTOSCALE_STATE_DIR = BACKEND_ROOT / ".celery_autoscale"
AUTOSCALE_LOCK = AUTOSCALE_STATE_DIR / "autoscale.pid"


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=5,
    )


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
            handle = kernel32.OpenProcess(0x1000, False, pid)
            if handle:
                kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:  # noqa: BLE001
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _systemctl(*args: str) -> tuple[bool, str]:
    # 调用 systemctl；非 Linux 或无 systemd 时返回失败
    if os.name == "nt" or not _which("systemctl"):
        return False, "systemctl 不可用"
    try:
        proc = subprocess.run(
            ["systemctl", *args],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        out = (proc.stdout or proc.stderr or "").strip()
        return proc.returncode == 0, out
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def _which(cmd: str) -> str | None:
    from shutil import which

    return which(cmd)


def read_autoscale_bounds() -> tuple[int, int, str]:
    # 读取 autoscale min/max（Redis 覆盖 env）
    settings = get_settings()
    env_min = max(0, int(settings.celery_autoscale_min))
    env_max = max(env_min, int(settings.celery_autoscale_max))
    source = "env"
    try:
        r = _redis_client()
        raw_min = r.get(AUTOSCALE_MIN_KEY)
        raw_max = r.get(AUTOSCALE_MAX_KEY)
        if raw_min is not None:
            env_min = max(0, int(raw_min))
            source = "redis"
        if raw_max is not None:
            env_max = max(env_min, int(raw_max))
            source = "redis"
    except Exception:  # noqa: BLE001
        logger.exception("read autoscale bounds failed")
    return env_min, max(env_min, env_max), source


def is_autoscale_enabled() -> bool:
    try:
        r = _redis_client()
        raw = r.get(AUTOSCALE_ENABLED_KEY)
        if raw is None:
            return False
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}
    except Exception:  # noqa: BLE001
        return False


def autoscale_process_status() -> tuple[bool, int | None, int]:
    # 返回 (running, pid, subprocess_worker_count)
    pid: int | None = None
    running = False
    worker_count = 0
    if AUTOSCALE_LOCK.is_file():
        try:
            pid = int(AUTOSCALE_LOCK.read_text(encoding="utf-8").strip())
            running = _pid_alive(pid)
        except Exception:  # noqa: BLE001
            pid = None
    if AUTOSCALE_STATE_DIR.is_dir():
        worker_count = len(list(AUTOSCALE_STATE_DIR.glob("worker-*.pid")))
    return running, pid, worker_count


def _inspect_worker_pools() -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.use_celery:
        return []
    try:
        from app.workers.celery_app import celery_app

        stats = celery_app.control.inspect(timeout=2.0).stats() or {}
    except Exception:  # noqa: BLE001
        logger.exception("inspect worker stats failed")
        return []

    rows: list[dict[str, Any]] = []
    for worker_name, data in stats.items():
        if not isinstance(data, dict):
            continue
        pool = data.get("pool") or {}
        processes = pool.get("processes")
        proc_count = len(processes) if isinstance(processes, list) else None
        max_conc = pool.get("max-concurrency")
        try:
            max_conc_int = int(max_conc) if max_conc is not None else None
        except (TypeError, ValueError):
            max_conc_int = None
        rows.append(
            {
                "name": worker_name,
                "pool_implementation": str(pool.get("implementation") or ""),
                "max_concurrency": max_conc_int,
                "process_count": proc_count,
                "writes": pool.get("writes"),
            }
        )
    return rows


def get_worker_control_status(
    *,
    pools: list[dict[str, Any]] | None = None,
    skip_inspect: bool = False,
) -> dict[str, Any]:
    # 汇总 Worker 管理模式与可操作性；pools 可由 queue_monitor 传入避免重复 inspect
    settings = get_settings()
    bounds_min, bounds_max, bounds_source = read_autoscale_bounds()
    autoscale_running, autoscale_pid, autoscale_workers = autoscale_process_status()
    autoscale_enabled = is_autoscale_enabled()
    if pools is None and not skip_inspect:
        pools = _inspect_worker_pools()
    pool_rows = pools or []

    systemd_active: bool | None = None
    mode = "celery"
    if _which("systemctl"):
        ok, _ = _systemctl("is-active", "--quiet", SYSTEMD_WORKER_UNIT)
        systemd_active = ok
        if ok and not autoscale_running:
            mode = "systemd"

    if autoscale_running:
        mode = "autoscale"

    total_processes = sum(int(p.get("process_count") or 0) for p in pool_rows)
    max_concurrency = max(
        (int(p["max_concurrency"]) for p in pool_rows if p.get("max_concurrency") is not None),
        default=None,
    )

    pool_impl = pool_rows[0]["pool_implementation"] if pool_rows else ""
    can_pool_grow = bool(
        pool_rows
        and settings.use_celery
        and pool_impl
        and "solo" not in pool_impl.lower()
        and (max_concurrency is None or total_processes < int(settings.celery_pool_max))
    )
    can_pool_shrink = bool(
        pool_rows
        and settings.use_celery
        and pool_impl
        and "solo" not in pool_impl.lower()
        and total_processes > 1
    )

    return {
        "mode": mode,
        "systemd_unit": SYSTEMD_WORKER_UNIT,
        "systemd_active": systemd_active,
        "pools": pool_rows,
        "total_processes": total_processes,
        "max_concurrency": max_concurrency,
        "pool_max_limit": int(settings.celery_pool_max),
        "can_pool_grow": can_pool_grow,
        "can_pool_shrink": can_pool_shrink,
        "can_restart": bool(_which("systemctl")),
        "autoscale_running": autoscale_running,
        "autoscale_enabled": autoscale_enabled,
        "autoscale_pid": autoscale_pid,
        "autoscale_workers": autoscale_workers,
        "bounds_min": bounds_min,
        "bounds_max": bounds_max,
        "bounds_source": bounds_source,
    }


def pool_grow(*, n: int = 1) -> dict[str, Any]:
    # Celery pool 扩容
    settings = get_settings()
    if not settings.use_celery:
        raise RuntimeError("Celery 未启用")
    n = max(1, min(int(n), 4))
    status = get_worker_control_status()
    if not status["can_pool_grow"]:
        raise RuntimeError("当前 Worker 池不支持动态扩容（solo 池或已达上限）")
    total = int(status["total_processes"])
    if total + n > int(settings.celery_pool_max):
        raise RuntimeError(f"超过 pool 上限 {settings.celery_pool_max}")

    from app.workers.celery_app import celery_app

    celery_app.control.pool_grow(n=n)
    logger.info("admin pool_grow n=%s", n)
    return {"ok": True, "action": "pool_grow", "n": n}


def pool_shrink(*, n: int = 1) -> dict[str, Any]:
    # Celery pool 缩容
    settings = get_settings()
    if not settings.use_celery:
        raise RuntimeError("Celery 未启用")
    n = max(1, min(int(n), 4))
    status = get_worker_control_status()
    if not status["can_pool_shrink"]:
        raise RuntimeError("当前 Worker 池不支持缩容或仅剩 1 进程")
    from app.workers.celery_app import celery_app

    celery_app.control.pool_shrink(n=n)
    logger.info("admin pool_shrink n=%s", n)
    return {"ok": True, "action": "pool_shrink", "n": n}


def restart_systemd_worker() -> dict[str, Any]:
    # systemd 重启 Celery worker
    ok, msg = _systemctl("restart", SYSTEMD_WORKER_UNIT)
    if not ok:
        raise RuntimeError(msg or "重启 worker 失败")
    logger.info("admin restart %s", SYSTEMD_WORKER_UNIT)
    return {"ok": True, "action": "restart", "unit": SYSTEMD_WORKER_UNIT, "message": msg}


def update_autoscale_config(
    *,
    min_workers: int | None = None,
    max_workers: int | None = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    # 写入 Redis autoscale 配置
    r = _redis_client()
    if min_workers is not None:
        r.set(AUTOSCALE_MIN_KEY, str(max(0, int(min_workers))))
    if max_workers is not None:
        r.set(AUTOSCALE_MAX_KEY, str(max(1, int(max_workers))))
    if enabled is not None:
        r.set(AUTOSCALE_ENABLED_KEY, "1" if enabled else "0")
    bounds_min, bounds_max, bounds_source = read_autoscale_bounds()
    if bounds_max < bounds_min:
        bounds_max = bounds_min
        r.set(AUTOSCALE_MAX_KEY, str(bounds_max))
    return {
        "ok": True,
        "bounds_min": bounds_min,
        "bounds_max": bounds_max,
        "bounds_source": bounds_source,
        "autoscale_enabled": is_autoscale_enabled(),
    }


def start_autoscale_daemon() -> dict[str, Any]:
    # 启动 autoscale 守护进程
    running, pid, _ = autoscale_process_status()
    if running and pid:
        return {"ok": True, "already_running": True, "pid": pid}

    update_autoscale_config(enabled=True)
    py = sys.executable
    AUTOSCALE_STATE_DIR.mkdir(parents=True, exist_ok=True)
    log_path = AUTOSCALE_STATE_DIR / "autoscale-stdout.log"
    log_f = open(log_path, "a", encoding="utf-8", errors="replace")  # noqa: SIM115
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    proc = subprocess.Popen(
        [py, "-m", "app.workers.autoscale"],
        cwd=str(BACKEND_ROOT),
        stdout=log_f,
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    logger.info("admin start autoscale pid=%s", proc.pid)
    return {"ok": True, "action": "autoscale_start", "pid": proc.pid}


def stop_autoscale_daemon() -> dict[str, Any]:
    # 停止 autoscale 守护进程
    update_autoscale_config(enabled=False)
    running, pid, _ = autoscale_process_status()
    if not running or not pid:
        return {"ok": True, "action": "autoscale_stop", "stopped": False}

    try:
        if os.name == "nt":
            os.kill(pid, signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
        else:
            os.kill(pid, signal.SIGTERM)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"停止 autoscale 失败: {exc}") from exc
    logger.info("admin stop autoscale pid=%s", pid)
    return {"ok": True, "action": "autoscale_stop", "stopped": True, "pid": pid}
