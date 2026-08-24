"""分镜生成状态与视频版本。"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.services.drama.generation import (
    activate_fragment_video_version,
    archive_fragment_video_version,
    fragment_generation_status,
    generation_queued_recently,
)


def _frag(**kwargs):
    return SimpleNamespace(**kwargs)


def test_fragment_generation_status_prefers_queued_over_video():
    frag = _frag(
        video="https://cdn/x.mp4",
        cover="https://cdn/x.jpg",
        params={"generation": {"status": "queued", "message": "已入队"}},
    )
    st = fragment_generation_status(frag)  # type: ignore[arg-type]
    assert st["status"] == "queued"


def test_fragment_generation_status_done_when_video_and_idle_gen():
    frag = _frag(video="https://cdn/x.mp4", cover="", params={"generation": {"status": "idle"}})
    st = fragment_generation_status(frag)  # type: ignore[arg-type]
    assert st["status"] == "done"


def test_archive_and_activate_video_version():
    frag = _frag(
        id=9,
        video="https://cdn/old.mp4",
        cover="https://cdn/old.jpg",
        params={"lastFrameUrl": "https://cdn/old-last.jpg", "video_versions": []},
    )
    archived = archive_fragment_video_version(frag)  # type: ignore[arg-type]
    assert archived is not None
    assert frag.params["video_versions"][0]["video"] == "https://cdn/old.mp4"

    frag.video = "https://cdn/new.mp4"
    frag.cover = "https://cdn/new.jpg"
    frag.params["lastFrameUrl"] = "https://cdn/new-last.jpg"
    version_id = frag.params["video_versions"][0]["id"]
    out = activate_fragment_video_version(frag, version_id)  # type: ignore[arg-type]
    assert out["video"] == "https://cdn/old.mp4"
    assert frag.video == "https://cdn/old.mp4"
    assert any(v.get("video") == "https://cdn/new.mp4" for v in frag.params["video_versions"])


def test_generation_queued_recently_within_grace():
    now = datetime(2026, 8, 24, 7, 0, tzinfo=UTC)
    gen = {"status": "queued", "queued_at": (now - timedelta(seconds=10)).isoformat()}
    assert generation_queued_recently(gen, now=now) is True


def test_generation_queued_recently_expired():
    now = datetime(2026, 8, 24, 7, 0, tzinfo=UTC)
    gen = {"status": "queued", "queued_at": (now - timedelta(seconds=90)).isoformat()}
    assert generation_queued_recently(gen, now=now) is False
