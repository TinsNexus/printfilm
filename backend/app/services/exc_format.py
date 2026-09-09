"""将异常格式化为可展示、非空的错误文案。"""

from __future__ import annotations

# httpx / 网络类异常名（str(exc) 经常为空）
_NETWORK_EXC_NAMES = frozenset(
    {
        "ConnectError",
        "ConnectTimeout",
        "ReadTimeout",
        "WriteTimeout",
        "PoolTimeout",
        "TimeoutException",
        "NetworkError",
        "ProxyError",
    }
)


def format_exception_message(
    exc: BaseException,
    *,
    fallback: str = "未知错误",
    limit: int = 500,
) -> str:
    """生成带类型名的错误文案；ConnectError 等空 message 时补上可读说明。"""
    name = type(exc).__name__
    detail = str(exc).strip()
    if name in _NETWORK_EXC_NAMES:
        tip = detail or "无法连接上游服务（请检查网络、代理或 api.kie.ai / 方舟是否可达）"
        return f"网络错误（{name}）：{tip}"[:limit]
    if not detail:
        return f"{name}：{fallback}"[:limit]
    if detail.startswith(name):
        return detail[:limit]
    return f"{name}: {detail}"[:limit]
