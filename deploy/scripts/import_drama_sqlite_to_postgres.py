#!/usr/bin/env python3
"""
从 sqlite（本地 backend/ai_movie.db）导入漫剧模块数据到 Postgres。

导入范围：drama_projects / drama_scripts / drama_assets / drama_episodes /
drama_episode_fragments / drama_fragment_asset_refs / drama_asset_episodes
（含 project.content 里的 canvas_nodes / canvas_edges）。

用户映射：按 owner email 对齐目标 users.id；缺失用户默认跳过该项目。

--replace：先清空目标库全部漫剧表，再按源表主键原样写入（画布 assetId 才能对上）。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sqlite3
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, text

from app.database import AsyncSessionLocal
from app.models import User
from app.models_drama import (
    DramaAsset,
    DramaAssetEpisode,
    DramaEpisode,
    DramaEpisodeFragment,
    DramaFragmentAssetRef,
    DramaProject,
    DramaScript,
)

# 清空 / 重置序号时的表顺序（子表在前）
DRAMA_TABLES = (
    "drama_fragment_asset_refs",
    "drama_asset_episodes",
    "drama_episode_fragments",
    "drama_assets",
    "drama_scripts",
    "drama_episodes",
    "drama_projects",
)

_ASSET_MENTION = re.compile(r"@asset:(\d+)")
_ASSET_NODE = re.compile(r"^asset-(\d+)$")


def _parse_dt(raw: Any) -> Optional[datetime]:
    # 把 sqlite 时间字段转成 datetime
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw)
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _jload(raw: Any) -> Any:
    # sqlite JSON 文本 → dict/list
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return None
    return None


def _rewrite_json(
    obj: Any,
    asset_map: dict[int, int],
    episode_map: dict[int, int],
    project_map: dict[int, int],
) -> Any:
    """把嵌套 JSON 里的资产/分集/项目 id（含画布 assetId、@asset:n）改成目标库 id。"""
    if isinstance(obj, list):
        return [_rewrite_json(x, asset_map, episode_map, project_map) for x in obj]
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for key, val in obj.items():
            if key in {"assetId", "asset_id"} and isinstance(val, int):
                out[key] = asset_map.get(val, val)
            elif key in {"episodeId", "episode_id"} and isinstance(val, int):
                out[key] = episode_map.get(val, val)
            elif key in {"projectId", "project_id"} and isinstance(val, int):
                out[key] = project_map.get(val, val)
            elif key in {"id", "canvas_node_id"} and isinstance(val, str):
                matched = _ASSET_NODE.match(val)
                if matched:
                    new_id = asset_map.get(int(matched.group(1)))
                    out[key] = f"asset-{new_id}" if new_id else val
                else:
                    out[key] = _rewrite_json(val, asset_map, episode_map, project_map)
            else:
                out[key] = _rewrite_json(val, asset_map, episode_map, project_map)
        return out
    if isinstance(obj, str):

        def _sub(match: re.Match[str]) -> str:
            old = int(match.group(1))
            return f"@asset:{asset_map.get(old, old)}"

        return _ASSET_MENTION.sub(_sub, obj)
    return obj


async def _wipe_drama_tables(session: Any) -> None:
    # 清空漫剧表；用量记录只断开关联，不删账本
    await session.execute(
        text("UPDATE usage_events SET drama_project_id = NULL WHERE drama_project_id IS NOT NULL")
    )
    await session.execute(
        text(
            "TRUNCATE TABLE "
            + ", ".join(DRAMA_TABLES)
            + " RESTART IDENTITY CASCADE"
        )
    )


async def _reset_id_sequences(session: Any) -> None:
    # 显式写入主键后，把 serial 拨到当前 MAX(id)
    for table in DRAMA_TABLES:
        await session.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
            )
        )


async def import_one(
    source_sqlite: str,
    dry_run: bool,
    project_ids: list[int] | None,
    import_missing_users: bool,
    replace: bool,
) -> None:
    con = sqlite3.connect(source_sqlite)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    cur.execute("select id as user_id, email from users")
    src_users = cur.fetchall()
    user_email_by_id = {int(r["user_id"]): r["email"] for r in src_users if r["email"]}

    cur.execute(
        "select id, user_id, title, description, content, params, created_at, updated_at "
        "from drama_projects order by id"
    )
    src_projects_all = cur.fetchall()
    src_projects = src_projects_all
    if project_ids:
        project_id_set = set(project_ids)
        src_projects = [r for r in src_projects_all if int(r["id"]) in project_id_set]
    if not src_projects:
        print("No drama_projects found in source sqlite.")
        return

    src_owner_emails = sorted({user_email_by_id.get(int(r["user_id"])) for r in src_projects})
    src_owner_emails = [e for e in src_owner_emails if e]

    async with AsyncSessionLocal() as session:
        dest_users = await session.execute(
            select(User).where(User.email.in_(src_owner_emails)) if src_owner_emails else select(User).where(False)
        )
        dest_users_list = dest_users.scalars().all()
        dest_user_id_by_email = {u.email: u.id for u in dest_users_list}

        print(f"[users] source owners: {src_owner_emails}")
        print(f"[users] destination found: {len(dest_user_id_by_email)}")

        missing_emails = [e for e in src_owner_emails if e not in dest_user_id_by_email]
        if missing_emails:
            print(f"[users] missing in destination: {missing_emails}")
            if import_missing_users and not dry_run:
                cur.execute(
                    "select id, email, nickname, hashed_password, quota_left, balance_fen, frozen_fen, plan, billing_unlimited, role, created_at "
                    "from users"
                )
                src_users_full = cur.fetchall()
                src_user_rows_by_email = {r["email"]: r for r in src_users_full if r["email"]}

                for email in missing_emails:
                    row = src_user_rows_by_email.get(email)
                    if not row:
                        continue
                    u = User(
                        email=email,
                        nickname=row["nickname"] or "创作者",
                        hashed_password=row["hashed_password"] or "",
                        quota_left=int(row["quota_left"] or 0),
                        balance_fen=int(row["balance_fen"] or 0),
                        frozen_fen=int(row["frozen_fen"] or 0),
                        plan=row["plan"] or "free",
                        billing_unlimited=bool(row["billing_unlimited"] or False),
                        role=row["role"] or "user",
                        created_at=_parse_dt(row["created_at"]),
                    )
                    session.add(u)
                    await session.flush()
                    dest_user_id_by_email[email] = int(u.id)
                print(f"[users] inserted missing users: {len(missing_emails)}")
            else:
                print("[users] import-missing-users disabled or dry-run; projects for these owners will be skipped.")

        project_id_map: dict[int, int] = {}
        asset_id_map: dict[int, int] = {}
        episode_id_map: dict[int, int] = {}
        fragment_id_map: dict[int, int] = {}
        preserve_ids = bool(replace)

        try:
            if replace:
                print("[replace] wipe all drama_* tables on destination")
                if not dry_run:
                    await _wipe_drama_tables(session)
                    await session.flush()

            inserted_projects = 0
            skipped_projects = 0
            pending_project_json: list[tuple[int, Any, Any]] = []
            for r in src_projects:
                old_pid = int(r["id"])
                old_uid = int(r["user_id"])
                email = user_email_by_id.get(old_uid)
                new_uid = dest_user_id_by_email.get(email or "")
                if new_uid is None:
                    skipped_projects += 1
                    print(f"[skip] project old_id={old_pid} owner_email={email!r} not found in destination users")
                    continue

                if dry_run:
                    project_id_map[old_pid] = old_pid if preserve_ids else -1
                    inserted_projects += 1
                    continue

                content = _jload(r["content"])
                params = _jload(r["params"])
                proj = DramaProject(
                    user_id=new_uid,
                    title=r["title"] or "未命名漫剧",
                    description=r["description"],
                    content=content,
                    params=params,
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                if preserve_ids:
                    proj.id = old_pid
                session.add(proj)
                await session.flush()
                project_id_map[old_pid] = int(proj.id)
                pending_project_json.append((int(proj.id), content, params))
                inserted_projects += 1

            print(f"[projects] inserted={inserted_projects} skipped={skipped_projects}")

            cur.execute(
                "select id, project_id, episode_id, name, source, summary, episode_content, params, created_at, updated_at "
                "from drama_scripts order by id"
            )
            src_scripts = cur.fetchall()
            inserted_scripts = 0
            pending_script_rows: list[tuple[DramaScript, Any, Any, Any]] = []
            for r in src_scripts:
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue
                if dry_run:
                    inserted_scripts += 1
                    continue

                summary = _jload(r["summary"])
                episode_content = _jload(r["episode_content"])
                params = _jload(r["params"])
                scr = DramaScript(
                    project_id=new_pid,
                    episode_id=int(r["episode_id"]) if r["episode_id"] is not None else None,
                    name=r["name"] or "剧本",
                    source=r["source"],
                    summary=summary,
                    episode_content=episode_content,
                    params=params,
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                if preserve_ids:
                    scr.id = int(r["id"])
                session.add(scr)
                await session.flush()
                pending_script_rows.append((scr, summary, episode_content, params))
                inserted_scripts += 1
            print(f"[scripts] inserted={inserted_scripts}")

            cur.execute(
                "select id, project_id, name, params, created_at, updated_at "
                "from drama_episodes order by id"
            )
            src_episodes = cur.fetchall()
            pending_episode_json: list[tuple[DramaEpisode, Any]] = []
            for r in src_episodes:
                old_eid = int(r["id"])
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue

                if dry_run:
                    episode_id_map[old_eid] = old_eid if preserve_ids else -1
                    continue

                params = _jload(r["params"])
                ep = DramaEpisode(
                    project_id=new_pid,
                    name=r["name"] or "",
                    params=params,
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                if preserve_ids:
                    ep.id = old_eid
                session.add(ep)
                await session.flush()
                episode_id_map[old_eid] = int(ep.id)
                pending_episode_json.append((ep, params))

            print(f"[episodes] mapped={len(episode_id_map)}")

            if not dry_run:
                for scr, _summary, _ec, _params in pending_script_rows:
                    if scr.episode_id is not None:
                        scr.episode_id = episode_id_map.get(int(scr.episode_id), scr.episode_id)

            cur.execute(
                "select id, project_id, type, asset_type, name, cover, url, params, derive_id, created_at, updated_at "
                "from drama_assets order by id"
            )
            src_assets = cur.fetchall()
            pending_assets: list[tuple[DramaAsset, Any]] = []
            for r in src_assets:
                old_aid = int(r["id"])
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue

                if dry_run:
                    asset_id_map[old_aid] = old_aid if preserve_ids else -1
                    continue

                params = _jload(r["params"])
                asset = DramaAsset(
                    project_id=new_pid,
                    type=r["type"] or "none",
                    asset_type=r["asset_type"] or "image",
                    name=r["name"],
                    cover=r["cover"],
                    url=r["url"],
                    params=params,
                    derive_id=r["derive_id"],
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                if preserve_ids:
                    asset.id = old_aid
                session.add(asset)
                await session.flush()
                asset_id_map[old_aid] = int(asset.id)
                pending_assets.append((asset, params))

            print(f"[assets] mapped={len(asset_id_map)}")

            cur.execute(
                "select id, episode_id, sort_order, content, cover, video, duration_sec, params, created_at, updated_at "
                "from drama_episode_fragments order by id"
            )
            src_fragments = cur.fetchall()
            pending_frags: list[tuple[DramaEpisodeFragment, Any]] = []
            for r in src_fragments:
                old_fid = int(r["id"])
                old_eid = int(r["episode_id"])
                new_eid = episode_id_map.get(old_eid)
                if new_eid is None:
                    continue

                if dry_run:
                    fragment_id_map[old_fid] = old_fid if preserve_ids else -1
                    continue

                params = _jload(r["params"])
                frag = DramaEpisodeFragment(
                    episode_id=new_eid,
                    sort_order=int(r["sort_order"] or 0),
                    content=r["content"] or "",
                    cover=r["cover"] or "",
                    video=r["video"] or "",
                    duration_sec=r["duration_sec"],
                    params=params,
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                if preserve_ids:
                    frag.id = old_fid
                session.add(frag)
                await session.flush()
                fragment_id_map[old_fid] = int(frag.id)
                pending_frags.append((frag, params))

            print(f"[fragments] mapped={len(fragment_id_map)}")

            if not dry_run:
                for pid, content, params in pending_project_json:
                    proj = await session.get(DramaProject, pid)
                    if proj is None:
                        continue
                    proj.content = _rewrite_json(content, asset_id_map, episode_id_map, project_id_map)
                    proj.params = _rewrite_json(params, asset_id_map, episode_id_map, project_id_map)
                for scr, summary, episode_content, params in pending_script_rows:
                    scr.summary = _rewrite_json(summary, asset_id_map, episode_id_map, project_id_map)
                    scr.episode_content = _rewrite_json(
                        episode_content, asset_id_map, episode_id_map, project_id_map
                    )
                    scr.params = _rewrite_json(params, asset_id_map, episode_id_map, project_id_map)
                for ep, params in pending_episode_json:
                    ep.params = _rewrite_json(params, asset_id_map, episode_id_map, project_id_map)
                for asset, params in pending_assets:
                    asset.params = _rewrite_json(params, asset_id_map, episode_id_map, project_id_map)
                for frag, params in pending_frags:
                    frag.params = _rewrite_json(params, asset_id_map, episode_id_map, project_id_map)

            cur.execute("select id, asset_id, episode_id, created_at from drama_asset_episodes order by id")
            src_asset_episodes = cur.fetchall()
            inserted_asset_episodes = 0
            for r in src_asset_episodes:
                old_aid = int(r["asset_id"])
                old_eid = int(r["episode_id"])
                new_aid = asset_id_map.get(old_aid)
                new_eid = episode_id_map.get(old_eid)
                if new_aid is None or new_eid is None:
                    continue
                if dry_run:
                    inserted_asset_episodes += 1
                    continue
                row = DramaAssetEpisode(
                    asset_id=new_aid,
                    episode_id=new_eid,
                    created_at=_parse_dt(r["created_at"]),
                )
                if preserve_ids:
                    row.id = int(r["id"])
                session.add(row)
                inserted_asset_episodes += 1
            print(f"[drama_asset_episodes] inserted={inserted_asset_episodes}")

            cur.execute("select id, fragment_id, asset_id from drama_fragment_asset_refs order by id")
            src_frag_refs = cur.fetchall()
            inserted_frag_refs = 0
            for r in src_frag_refs:
                old_fid = int(r["fragment_id"])
                old_aid = int(r["asset_id"])
                new_fid = fragment_id_map.get(old_fid)
                new_aid = asset_id_map.get(old_aid)
                if new_fid is None or new_aid is None:
                    continue
                if dry_run:
                    inserted_frag_refs += 1
                    continue
                row = DramaFragmentAssetRef(fragment_id=new_fid, asset_id=new_aid)
                if preserve_ids:
                    row.id = int(r["id"])
                session.add(row)
                inserted_frag_refs += 1
            print(f"[drama_fragment_asset_refs] inserted={inserted_frag_refs}")

            if not dry_run:
                await session.flush()
                await _reset_id_sequences(session)
                await session.commit()
            print("Import done.")
        except Exception:
            if not dry_run:
                await session.rollback()
            raise

    con.close()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--source-sqlite", required=True, help="Path to source sqlite file (drama data).")
    p.add_argument("--dry-run", action="store_true", help="Only calculate mapping, do not insert.")
    p.add_argument(
        "--project-ids",
        default="",
        help="仅导入指定 drama_projects 的 id（逗号分隔），例如：--project-ids 7,8",
    )
    p.add_argument(
        "--import-missing-users",
        action="store_true",
        help="目标库 users 表中缺失的 owner email：从源 sqlite 插入（会同步 hashed_password）",
    )
    p.add_argument(
        "--replace",
        action="store_true",
        help="先清空目标 drama_* 表，再按源主键原样写入（含画布节点 assetId）",
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    project_ids = None
    if args.project_ids:
        project_ids = [int(x.strip()) for x in args.project_ids.split(",") if x.strip()]
    asyncio.run(
        import_one(
            source_sqlite=args.source_sqlite,
            dry_run=bool(args.dry_run),
            project_ids=project_ids,
            import_missing_users=bool(args.import_missing_users),
            replace=bool(args.replace),
        )
    )


if __name__ == "__main__":
    main()
