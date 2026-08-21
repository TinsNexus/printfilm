"""pending 分镜视频任务作废判定：重新生成不得因旧 video 被误取消。"""

from types import SimpleNamespace

from app.services.tasks.service import stale_pending_fragment_video_reason


def _frag(**kwargs):
    return SimpleNamespace(**kwargs)


def test_stale_reason_none_when_regen_queued_with_video():
    frag = _frag(
        video="https://cdn/old.mp4",
        params={"generation": {"status": "queued"}},
    )
    assert stale_pending_fragment_video_reason([frag]) is None


def test_stale_reason_skip_duplicate_when_video_done():
    frag = _frag(video="https://cdn/done.mp4", cover="", params={})
    assert stale_pending_fragment_video_reason([frag]) == "分镜已生成完成，跳过重复任务"


def test_stale_reason_keep_when_no_video_yet():
    frag = _frag(video="", params={"generation": {"status": "queued"}})
    assert stale_pending_fragment_video_reason([frag]) is None


def test_stale_reason_deleted_fragments():
    assert stale_pending_fragment_video_reason([]) == "分镜已变更，任务已作废"
