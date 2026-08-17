"""Celery 队列名：按任务类型拆分，避免漫剧 LLM 被科普成片 pipeline 堵住。"""

from __future__ import annotations

# pipeline：科普/Studio 多阶段成片（耗时长）
PIPELINE_QUEUE = "pipeline"
# drama：漫剧 LLM 与资产生图（用户交互敏感）
DRAMA_QUEUE = "drama"
# video：所有视频生成（Seedance 等）
VIDEO_QUEUE = "video"
# oss：异步 OSS 上传回填
OSS_QUEUE = "oss"

# Worker 应消费的全部队列（顺序：优先处理短任务）
DEFAULT_WORKER_QUEUES = (DRAMA_QUEUE, OSS_QUEUE, VIDEO_QUEUE, PIPELINE_QUEUE)


def parse_worker_queues(raw: str | None) -> tuple[str, ...]:
    # 解析逗号分隔队列配置，过滤空项
    if not raw or not str(raw).strip():
        return DEFAULT_WORKER_QUEUES
    parts = [q.strip() for q in str(raw).split(",") if q.strip()]
    return tuple(parts) if parts else DEFAULT_WORKER_QUEUES


def worker_queues_csv(raw: str | None = None) -> str:
    # 返回 Celery -Q 参数字符串
    if raw is None:
        return ",".join(DEFAULT_WORKER_QUEUES)
    return ",".join(parse_worker_queues(raw))
