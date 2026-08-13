#!/usr/bin/env python3
"""
从 sqlite（本地开发的 backend/ai_movie.db）导入漫剧模块数据到线上 Postgres。

导入范围：drama_projects / drama_scripts / drama_assets / drama_episodes /
drama_episode_fragments / drama_fragment_asset_refs / drama_asset_episodes

用户映射策略：
- 依据源 sqlite 中 drama_projects.owner 对应 users.email
- 在目标 Postgres 的 users 表里按 email 查找 user_id
- 若目标不存在该 email：跳过该项目（不会创建用户，以避免密钥/密码缺失）
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select

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


def _parse_dt(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, (int, float)):
        # sqlite timestamp fallback
        return datetime.fromtimestamp(raw)
    s = str(raw)
    s = s.strip()
    if not s:
        return None
    # 默认匹配 sqlite 常见：YYYY-MM-DD HH:MM:SS
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _jload(raw: Any) -> Any:
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


async def import_one(
    source_sqlite: str,
    dry_run: bool,
    project_ids: list[int] | None,
    import_missing_users: bool,
) -> None:
    con = sqlite3.connect(source_sqlite)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # 1) 取源 users email 映射
    cur.execute("select id as user_id, email from users")
    src_users = cur.fetchall()
    user_email_by_id = {int(r["user_id"]): r["email"] for r in src_users if r["email"]}

    # 2) 取源 drama_projects
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

    # 3) 依据源项目 owner email 查目标 users
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
                # 直接拷贝源 users（包含 hashed_password），确保后续项目归属可见
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

        # 映射表
        project_id_map: dict[int, int] = {}
        asset_id_map: dict[int, int] = {}
        episode_id_map: dict[int, int] = {}
        fragment_id_map: dict[int, int] = {}

        # 用事务包住插入，便于回滚
        try:
            # 4) projects
            inserted_projects = 0
            skipped_projects = 0
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
                    project_id_map[old_pid] = -1
                    inserted_projects += 1
                    continue

                proj = DramaProject(
                    user_id=new_uid,
                    title=r["title"] or "未命名漫剧",
                    description=r["description"],
                    content=_jload(r["content"]),
                    params=_jload(r["params"]),
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                session.add(proj)
                await session.flush()
                project_id_map[old_pid] = int(proj.id)
                inserted_projects += 1

            print(f"[projects] inserted={inserted_projects} skipped={skipped_projects}")

            # 5) scripts（按项目注入）
            cur.execute(
                "select id, project_id, episode_id, name, source, summary, episode_content, params, created_at, updated_at "
                "from drama_scripts order by id"
            )
            src_scripts = cur.fetchall()
            inserted_scripts = 0
            for r in src_scripts:
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue
                if dry_run:
                    inserted_scripts += 1
                    continue

                scr = DramaScript(
                    project_id=new_pid,
                    episode_id=int(r["episode_id"]) if r["episode_id"] is not None else None,
                    name=r["name"] or "剧本",
                    source=r["source"],
                    summary=_jload(r["summary"]),
                    episode_content=_jload(r["episode_content"]),
                    params=_jload(r["params"]),
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                session.add(scr)
                await session.flush()
                inserted_scripts += 1
            print(f"[scripts] inserted={inserted_scripts}")

            # 6) episodes
            cur.execute(
                "select id, project_id, name, params, created_at, updated_at "
                "from drama_episodes order by id"
            )
            src_episodes = cur.fetchall()
            for r in src_episodes:
                old_eid = int(r["id"])
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue

                if dry_run:
                    episode_id_map[old_eid] = -1
                    continue

                ep = DramaEpisode(
                    project_id=new_pid,
                    name=r["name"] or "",
                    params=_jload(r["params"]),
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                session.add(ep)
                await session.flush()
                episode_id_map[old_eid] = int(ep.id)

            print(f"[episodes] mapped={len(episode_id_map)}")

            # 7) assets
            cur.execute(
                "select id, project_id, type, asset_type, name, cover, url, params, derive_id, created_at, updated_at "
                "from drama_assets order by id"
            )
            src_assets = cur.fetchall()
            for r in src_assets:
                old_aid = int(r["id"])
                old_pid = int(r["project_id"])
                new_pid = project_id_map.get(old_pid)
                if new_pid is None:
                    continue

                if dry_run:
                    asset_id_map[old_aid] = -1
                    continue

                asset = DramaAsset(
                    project_id=new_pid,
                    type=r["type"] or "none",
                    asset_type=r["asset_type"] or "image",
                    name=r["name"],
                    cover=r["cover"],
                    url=r["url"],
                    params=_jload(r["params"]),
                    derive_id=r["derive_id"],
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                session.add(asset)
                await session.flush()
                asset_id_map[old_aid] = int(asset.id)

            print(f"[assets] mapped={len(asset_id_map)}")

            # 8) fragments
            cur.execute(
                "select id, episode_id, sort_order, content, cover, video, duration_sec, params, created_at, updated_at "
                "from drama_episode_fragments order by id"
            )
            src_fragments = cur.fetchall()
            for r in src_fragments:
                old_fid = int(r["id"])
                old_eid = int(r["episode_id"])
                new_eid = episode_id_map.get(old_eid)
                if new_eid is None:
                    continue

                if dry_run:
                    fragment_id_map[old_fid] = -1
                    continue

                frag = DramaEpisodeFragment(
                    episode_id=new_eid,
                    sort_order=int(r["sort_order"] or 0),
                    content=r["content"] or "",
                    cover=r["cover"] or "",
                    video=r["video"] or "",
                    duration_sec=r["duration_sec"],
                    params=_jload(r["params"]),
                    created_at=_parse_dt(r["created_at"]),
                    updated_at=_parse_dt(r["updated_at"]),
                )
                session.add(frag)
                await session.flush()
                fragment_id_map[old_fid] = int(frag.id)

            print(f"[fragments] mapped={len(fragment_id_map)}")

            # 9) join tables
            # drama_asset_episodes
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
                session.add(
                    DramaAssetEpisode(
                        asset_id=new_aid,
                        episode_id=new_eid,
                        created_at=_parse_dt(r["created_at"]),
                    )
                )
                inserted_asset_episodes += 1
            print(f"[drama_asset_episodes] inserted={inserted_asset_episodes}")

            # drama_fragment_asset_refs
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
                session.add(DramaFragmentAssetRef(fragment_id=new_fid, asset_id=new_aid))
                inserted_frag_refs += 1
            print(f"[drama_fragment_asset_refs] inserted={inserted_frag_refs}")

            print("Import done.")
            if not dry_run:
                await session.commit()
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
        )
    )


if __name__ == "__main__":
    main()

