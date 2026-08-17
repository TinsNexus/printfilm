"""Worker 管理配置单测。"""

from app.services.worker_manager import read_autoscale_bounds


def test_read_autoscale_bounds_defaults(monkeypatch):
    monkeypatch.setattr(
        "app.services.worker_manager.get_settings",
        lambda: type("S", (), {"celery_autoscale_min": 1, "celery_autoscale_max": 3, "redis_url": "redis://127.0.0.1:9"})(),
    )

    class FakeRedis:
        def get(self, _key):
            return None

    monkeypatch.setattr("app.services.worker_manager._redis_client", lambda: FakeRedis())
    min_w, max_w, source = read_autoscale_bounds()
    assert min_w == 1
    assert max_w == 3
    assert source == "env"
