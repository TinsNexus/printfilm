"""科普镜间衔接：后镜出图参考上一镜静帧，出视频参考上一镜尾帧。"""

from __future__ import annotations

import time
from typing import Any

from app.services.style_lock import seedream_ref_urls


def previous_shot(shots: list[Any], shot_no: int) -> Any | None:
    """按 shot_no 取上一镜（不含本镜）。"""
    prev = None
    for shot in sorted(shots, key=lambda item: int(getattr(item, "shot_no", 0) or 0)):
        no = int(getattr(shot, "shot_no", 0) or 0)
        if no >= int(shot_no):
            break
        prev = shot
    return prev


def previous_usable_shot(shots: list[Any], shot_no: int) -> Any | None:
    """向前找到最近一镜有静帧或尾帧的镜头。"""
    prev = None
    for shot in sorted(shots, key=lambda item: int(getattr(item, "shot_no", 0) or 0)):
        no = int(getattr(shot, "shot_no", 0) or 0)
        if no >= int(shot_no):
            break
        if shot_image_ref(shot) or shot_last_frame_ref(shot):
            prev = shot
    return prev


def _usable_seedream_url(raw: str | None, *, allow_republish: bool = False) -> str | None:
    """只返回 Seedream 能拉的公网地址；TokenFree 产物地址不可作参考。"""
    url = str(raw or "").strip()
    if not url:
        return None
    from app.services.tokenfree_image import is_tokenfree_image_url

    if is_tokenfree_image_url(url):
        return None
    if allow_republish and not (url.startswith("http://") or url.startswith("https://")):
        from app.services import storage

        url = str(storage.republish_url(url, sync=True) or "").strip()
        if is_tokenfree_image_url(url):
            return None
    ok = seedream_ref_urls(url)
    return ok[0] if ok else None


def shot_image_ref(shot: Any | None) -> str | None:
    """优先已是公网的 image_url，其次 ark CDN；本地 /static 尝试同步上 OSS。"""
    if shot is None:
        return None
    candidates = (getattr(shot, "image_url", None), getattr(shot, "image_ark_url", None))
    for raw in candidates:
        url = _usable_seedream_url(raw, allow_republish=False)
        if url:
            return url
    for raw in candidates:
        url = _usable_seedream_url(raw, allow_republish=True)
        if url:
            return url
    return None


def _any_shot_image(shot: Any) -> str | None:
    """静帧任意可用地址（含本地 /static，交给下游 resolve）。"""
    for raw in (getattr(shot, "image_ark_url", None), getattr(shot, "image_url", None)):
        url = str(raw or "").strip()
        if url:
            return url
    return None


def shot_last_frame_ref(shot: Any | None) -> str | None:
    """上一镜尾帧；没有则退回该镜静帧。本地路径由 Seedance resolve 再上公网。"""
    if shot is None:
        return None
    last = str(getattr(shot, "last_frame_url", None) or "").strip()
    if last:
        return last
    return shot_image_ref(shot) or _any_shot_image(shot)


def image_refs_for_shot(prev: Any | None, base_refs: list[str] | None = None) -> list[str]:
    """本镜 Seedream 参考：上一镜静帧 + 模板底图。"""
    bases = list(base_refs or [])
    prev_url = shot_image_ref(prev)
    if prev_url:
        return seedream_ref_urls(prev_url, *bases)
    return seedream_ref_urls(*bases)


def video_extra_refs_for_shot(prev: Any | None) -> list[str]:
    """本镜视频额外参考：上一镜尾帧（或静帧）。"""
    url = shot_last_frame_ref(prev)
    return [url] if url else []


def persist_last_frame_from_video(
    project_id: int,
    shot_no: int,
    video_url: str,
    preferred_url: str | None = None,
) -> str | None:
    """优先落盘/公网尾帧；没有再用 ffmpeg 从成片抽。"""
    from app.services import storage
    from app.services.ffmpeg_compose import extract_video_last_frame

    pref = str(preferred_url or "").strip()
    if pref:
        from app.services.tokenfree_image import is_tokenfree_image_url

        if (pref.startswith("http://") or pref.startswith("https://")) and not is_tokenfree_image_url(pref):
            return pref
        https = storage.republish_url(pref, sync=True)
        if https and str(https).startswith("http") and not is_tokenfree_image_url(str(https)):
            return str(https)
        if pref.startswith("/static/"):
            return pref
    path = storage.local_path_from_url(video_url)
    if path and path.exists():
        dest = storage.project_dir(int(project_id)) / f"shot_{int(shot_no):03d}_{int(time.time())}_last.jpg"
        if extract_video_last_frame(path, dest):
            published = storage.publish_local(dest, sync=True)
            https = storage.republish_url(published, sync=True)
            return https or published
    return None
