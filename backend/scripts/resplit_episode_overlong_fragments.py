"""将指定分集中 @duration 合计 >30s 的分镜按软/硬上限拆开并写回库。"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from app.services.drama.build_fragments import (
    FRAGMENT_TOTAL_MAX,
    split_overlong_fragment_content,
)

DB = Path(__file__).resolve().parents[1] / "ai_movie.db"
ASSET_RE = re.compile(r"@asset:(\d+)")
DURATION_RE = re.compile(r"@duration:(\d+)")


def sum_duration(content: str) -> int:
    return sum(int(m) for m in DURATION_RE.findall(content or ""))


def extract_asset_ids(content: str) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for m in ASSET_RE.finditer(content or ""):
        aid = int(m.group(1))
        if aid and aid not in seen:
            seen.add(aid)
            out.append(aid)
    return out


def find_episode_id(conn: sqlite3.Connection, episode_number: int = 2) -> int:
    rows = conn.execute(
        "SELECT id, name, params FROM drama_episodes ORDER BY id"
    ).fetchall()
    for row in rows:
        try:
            params = json.loads(row["params"] or "{}")
        except Exception:
            params = {}
        if int(params.get("episodeNumber") or params.get("episode_number") or 0) == episode_number:
            return int(row["id"])
    raise SystemExit(f"未找到第 {episode_number} 集")


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    episode_id = find_episode_id(conn, 2)
    frags = conn.execute(
        """
        SELECT id, sort_order, duration_sec, content, cover, video, params
        FROM drama_episode_fragments
        WHERE episode_id=?
        ORDER BY sort_order, id
        """,
        (episode_id,),
    ).fetchall()

    # old_id -> asset_ids
    ref_map: dict[int, list[int]] = {}
    for f in frags:
        rows = conn.execute(
            "SELECT asset_id FROM drama_fragment_asset_refs WHERE fragment_id=? ORDER BY id",
            (f["id"],),
        ).fetchall()
        ref_map[int(f["id"])] = [int(r["asset_id"]) for r in rows]

    rebuilt: list[dict] = []
    split_count = 0
    for f in frags:
        content = f["content"] or ""
        total = sum_duration(content)
        params = {}
        try:
            params = json.loads(f["params"] or "{}") if f["params"] else {}
        except Exception:
            params = {}
        if not isinstance(params, dict):
            params = {}

        if total <= FRAGMENT_TOTAL_MAX:
            rebuilt.append(
                {
                    "content": content,
                    "cover": f["cover"] or "",
                    "video": f["video"] or "",
                    "duration_sec": int(f["duration_sec"] or total or 8),
                    "params": params,
                    "asset_ids": ref_map.get(int(f["id"])) or extract_asset_ids(content),
                }
            )
            continue

        chunks = split_overlong_fragment_content(content)
        if len(chunks) <= 1:
            rebuilt.append(
                {
                    "content": content,
                    "cover": f["cover"] or "",
                    "video": f["video"] or "",
                    "duration_sec": min(FRAGMENT_TOTAL_MAX, total),
                    "params": params,
                    "asset_ids": ref_map.get(int(f["id"])) or extract_asset_ids(content),
                }
            )
            continue

        split_count += 1
        print(
            f"split frag sort={f['sort_order']} id={f['id']} {total}s -> "
            f"{[d for _, d in chunks]}"
        )
        for idx, (chunk_content, chunk_dur) in enumerate(chunks):
            chunk_params = {
                **params,
                "user_edited": True,
                "resplit_from": int(f["id"]),
                "resplit_index": idx,
            }
            # 拆开后旧成片不再对应，清空 video；封面仅保留首块
            chunk_cover = (f["cover"] or "") if idx == 0 else ""
            asset_ids = extract_asset_ids(chunk_content)
            if not asset_ids:
                asset_ids = list(ref_map.get(int(f["id"])) or [])
            rebuilt.append(
                {
                    "content": chunk_content,
                    "cover": chunk_cover,
                    "video": "",
                    "duration_sec": chunk_dur,
                    "params": chunk_params,
                    "asset_ids": asset_ids,
                }
            )

    if split_count == 0:
        print("没有需要拆分的超长分镜")
        return

    # 事务：删旧分镜（级联删 refs）再插入
    cur = conn.cursor()
    cur.execute("BEGIN")
    try:
        cur.execute(
            "DELETE FROM drama_episode_fragments WHERE episode_id=?",
            (episode_id,),
        )
        for order, item in enumerate(rebuilt):
            cur.execute(
                """
                INSERT INTO drama_episode_fragments
                (episode_id, sort_order, content, cover, video, duration_sec, params)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    episode_id,
                    order,
                    item["content"],
                    item["cover"],
                    item["video"],
                    item["duration_sec"],
                    json.dumps(item["params"], ensure_ascii=False),
                ),
            )
            frag_id = cur.lastrowid
            for aid in item["asset_ids"]:
                cur.execute(
                    """
                    INSERT OR IGNORE INTO drama_fragment_asset_refs (fragment_id, asset_id)
                    VALUES (?, ?)
                    """,
                    (frag_id, aid),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    print(f"done episode_id={episode_id} fragments={len(rebuilt)} split_sources={split_count}")
    for order, item in enumerate(rebuilt):
        print(f"  #{order} duration={item['duration_sec']}s assets={item['asset_ids']}")


if __name__ == "__main__":
    main()
