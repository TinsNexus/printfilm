"""Dynamic Celery worker autoscaler (Windows-friendly solo pool).

Monitors Redis queue depth + unacked tasks, then spawns/kills
`--pool=solo --concurrency=1` workers within [min, max].

Run:
  cd backend
  .\\.venv\\Scripts\\python -m app.workers.autoscale
"""

from __future__ import annotations

import atexit
import logging
import os
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import redis

from app.config import get_settings, reload_settings
from app.logging_setup import configure_logging
from app.workers.queues import parse_worker_queues, worker_queues_csv

_settings = get_settings()
configure_logging(level="INFO", sql_echo=_settings.sql_echo)
# autoscale 自己的格式已由 configure_logging 覆盖；保留 logger 名
logger = logging.getLogger("autoscale")
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = BACKEND_ROOT / ".celery_autoscale"


@dataclass
class WorkerProc:
    name: str
    index: int
    process: subprocess.Popen
    started_at: float = field(default_factory=time.time)


class CeleryAutoscaler:
    def __init__(self) -> None:
        self.settings = reload_settings()
        self.min_workers = max(0, int(self.settings.celery_autoscale_min))
        self.max_workers = max(self.min_workers, int(self.settings.celery_autoscale_max))
        self.poll_sec = max(2.0, float(self.settings.celery_autoscale_poll_sec))
        self.scale_down_sec = max(5.0, float(self.settings.celery_autoscale_idle_sec))
        raw_queues = (
            (self.settings.celery_worker_queues or "").strip()
            or (self.settings.celery_autoscale_queue or "").strip()
        )
        self.monitor_queues = parse_worker_queues(raw_queues or None)
        self.worker_queues = worker_queues_csv(raw_queues or None)
        try:
            from app.services.worker_manager import read_autoscale_bounds

            rmin, rmax, _ = read_autoscale_bounds()
            self.min_workers = rmin
            self.max_workers = rmax
        except Exception:  # noqa: BLE001
            pass
        self.host = socket.gethostname().split(".")[0]
        self.workers: dict[int, WorkerProc] = {}
        self._idle_since: float | None = None
        self._stop = False
        self._redis = redis.Redis.from_url(
            self.settings.redis_url,
            decode_responses=False,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        STATE_DIR.mkdir(parents=True, exist_ok=True)

    def _celery_exe(self) -> Path:
        win = BACKEND_ROOT / ".venv" / "Scripts" / "celery.exe"
        nix = BACKEND_ROOT / ".venv" / "bin" / "celery"
        if win.exists():
            return win
        if nix.exists():
            return nix
        return Path(sys.executable).with_name("celery.exe" if os.name == "nt" else "celery")

    def _worker_name(self, index: int) -> str:
        return f"auto-{index}@{self.host}"

    def queue_load(self) -> tuple[int, int, int]:
        """Return (pending, unacked, load)."""
        pending = 0
        for queue_name in self.monitor_queues:
            try:
                pending += int(self._redis.llen(queue_name) or 0)
            except Exception:  # noqa: BLE001
                pass
        try:
            unacked = int(self._redis.hlen("unacked") or 0)
        except Exception:  # noqa: BLE001
            unacked = 0
        load = pending + unacked
        return pending, unacked, load

    def desired_count(self, load: int) -> int:
        if load <= 0:
            return self.min_workers
        return max(self.min_workers, min(self.max_workers, load))

    def _spawn(self, index: int) -> WorkerProc:
        name = self._worker_name(index)
        celery = str(self._celery_exe())
        cmd = [
            celery,
            "-A",
            "app.workers.celery_app.celery_app",
            "worker",
            "-Q",
            self.worker_queues,
            "-l",
            "info",
            "--concurrency=1",
            "--pool=solo",
            "-n",
            name,
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
        ]
        log_path = STATE_DIR / f"worker-{index}.log"
        log_f = open(log_path, "a", encoding="utf-8", errors="replace")  # noqa: SIM115
        creationflags = 0
        if os.name == "nt":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        proc = subprocess.Popen(
            cmd,
            cwd=str(BACKEND_ROOT),
            stdout=log_f,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        (STATE_DIR / f"worker-{index}.pid").write_text(str(proc.pid), encoding="utf-8")
        wp = WorkerProc(name=name, index=index, process=proc)
        self.workers[index] = wp
        logger.info("scale-up %s pid=%s (workers=%s)", name, proc.pid, len(self.workers))
        return wp

    def _terminate(self, wp: WorkerProc, *, reason: str) -> None:
        pid = wp.process.pid
        logger.info("scale-down %s pid=%s (%s)", wp.name, pid, reason)
        try:
            if os.name == "nt":
                # CTRL_BREAK for process group; fall back to terminate
                try:
                    wp.process.send_signal(signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
                    wp.process.wait(timeout=8)
                except Exception:  # noqa: BLE001
                    wp.process.terminate()
                    try:
                        wp.process.wait(timeout=5)
                    except Exception:  # noqa: BLE001
                        wp.process.kill()
            else:
                wp.process.terminate()
                try:
                    wp.process.wait(timeout=8)
                except Exception:  # noqa: BLE001
                    wp.process.kill()
        except Exception as exc:  # noqa: BLE001
            logger.warning("failed stopping %s: %s", wp.name, exc)
        self.workers.pop(wp.index, None)
        pid_file = STATE_DIR / f"worker-{wp.index}.pid"
        if pid_file.exists():
            pid_file.unlink(missing_ok=True)

    def _reap_dead(self) -> None:
        dead = [idx for idx, wp in self.workers.items() if wp.process.poll() is not None]
        for idx in dead:
            wp = self.workers.pop(idx)
            logger.warning("worker died %s exit=%s", wp.name, wp.process.returncode)

    def _next_index(self) -> int:
        used = set(self.workers)
        for i in range(1, self.max_workers + 8):
            if i not in used:
                return i
        return max(used, default=0) + 1

    def reconcile(self) -> None:
        self._reap_dead()
        pending, unacked, load = self.queue_load()
        desired = self.desired_count(load)
        alive = len(self.workers)

        if load > 0:
            self._idle_since = None
        elif self._idle_since is None:
            self._idle_since = time.time()

        # Scale up immediately
        while len(self.workers) < desired:
            self._spawn(self._next_index())

        # Scale down only after idle cooldown (avoid killing mid-task when queue briefly empty)
        if desired < len(self.workers):
            idle_for = (time.time() - self._idle_since) if self._idle_since else 0.0
            if load == 0 and idle_for >= self.scale_down_sec:
                extras = sorted(self.workers.values(), key=lambda w: w.started_at, reverse=True)
                while len(self.workers) > desired and extras:
                    self._terminate(extras.pop(0), reason=f"idle {idle_for:.0f}s")
            elif load > 0 and alive > desired:
                # More workers than load but work still present — keep until unfinished
                pass

        logger.info(
            "load pending=%s unacked=%s → desired=%s alive=%s",
            pending,
            unacked,
            desired,
            len(self.workers),
        )

    def ensure_minimum(self) -> None:
        while len(self.workers) < self.min_workers:
            self._spawn(self._next_index())

    def shutdown(self) -> None:
        self._stop = True
        for wp in list(sorted(self.workers.values(), key=lambda w: w.index)):
            self._terminate(wp, reason="shutdown")

    def run_forever(self) -> None:
        logger.info(
            "start queues=%s min=%s max=%s poll=%.1fs idle_down=%.1fs redis=%s",
            self.worker_queues,
            self.min_workers,
            self.max_workers,
            self.poll_sec,
            self.scale_down_sec,
            self.settings.redis_url,
        )
        # Cold start: drop orphan unacked left by killed Windows workers
        try:
            from app.workers.recover import reclaim_unacked, redispatch_stale_projects

            reclaim_unacked(self.settings.redis_url)
            import asyncio

            from app.database import dispose_engine

            async def _boot_recover() -> None:
                await dispose_engine()
                try:
                    await redispatch_stale_projects(older_than_sec=120)
                finally:
                    await dispose_engine()

            asyncio.run(_boot_recover())
        except Exception:  # noqa: BLE001
            logger.exception("startup recover failed")

        self.ensure_minimum()
        loops = 0
        while not self._stop:
            try:
                self.settings = get_settings()
                # Hot-read bounds each loop (env reload optional)
                self.min_workers = max(0, int(self.settings.celery_autoscale_min))
                self.max_workers = max(self.min_workers, int(self.settings.celery_autoscale_max))
                self.poll_sec = max(2.0, float(self.settings.celery_autoscale_poll_sec))
                self.scale_down_sec = max(5.0, float(self.settings.celery_autoscale_idle_sec))
                try:
                    from app.services.worker_manager import read_autoscale_bounds

                    rmin, rmax, _ = read_autoscale_bounds()
                    self.min_workers = rmin
                    self.max_workers = rmax
                except Exception:  # noqa: BLE001
                    pass
                self.reconcile()
                loops += 1
                # Every ~2 min: redispatch projects with no progress
                if loops % max(1, int(120 / self.poll_sec)) == 0:
                    from app.workers.recover import redispatch_stale_projects
                    import asyncio

                    from app.database import dispose_engine

                    async def _periodic_recover() -> None:
                        await dispose_engine()
                        try:
                            await redispatch_stale_projects()
                        finally:
                            await dispose_engine()

                    asyncio.run(_periodic_recover())
            except redis.RedisError as exc:
                logger.error("redis error: %s", exc)
            except Exception:  # noqa: BLE001
                logger.exception("reconcile failed")
            time.sleep(self.poll_sec)


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


def main() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = STATE_DIR / "autoscale.pid"
    if lock_path.exists():
        try:
            old = int(lock_path.read_text(encoding="utf-8").strip())
            if _pid_alive(old):
                logger.error("another autoscale already running pid=%s", old)
                sys.exit(1)
        except Exception:  # noqa: BLE001
            pass

    scaler = CeleryAutoscaler()
    lock_path.write_text(str(os.getpid()), encoding="utf-8")

    def _cleanup() -> None:
        scaler.shutdown()
        try:
            if lock_path.exists() and lock_path.read_text(encoding="utf-8").strip() == str(os.getpid()):
                lock_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass

    def _sig(_signum, _frame) -> None:  # noqa: ANN001
        logger.info("signal received, shutting down…")
        _cleanup()
        sys.exit(0)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _sig)
        except Exception:  # noqa: BLE001
            pass
    atexit.register(_cleanup)
    try:
        scaler.run_forever()
    finally:
        _cleanup()


if __name__ == "__main__":
    main()
