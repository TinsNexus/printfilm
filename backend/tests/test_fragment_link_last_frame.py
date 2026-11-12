"""单镜尾帧衔接开关：项目开启时可单镜关闭，项目关闭时单镜无法开启。"""

from types import SimpleNamespace

from app.services.drama.generation import fragment_link_last_frame_enabled


def _project(link):
    return SimpleNamespace(params={} if link is None else {"linkLastFrame": link})


def _fragment(params):
    return SimpleNamespace(params=params)


def test_follows_project_by_default():
    assert fragment_link_last_frame_enabled(_project(None), _fragment({}))
    assert fragment_link_last_frame_enabled(_project(True), _fragment(None))
    assert fragment_link_last_frame_enabled(_project(True), None)


def test_fragment_can_opt_out():
    assert not fragment_link_last_frame_enabled(_project(True), _fragment({"linkLastFrame": False}))


def test_fragment_cannot_override_project_off():
    assert not fragment_link_last_frame_enabled(_project(False), _fragment({"linkLastFrame": True}))
    assert not fragment_link_last_frame_enabled(_project(False), _fragment({}))
