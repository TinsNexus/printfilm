"""TokenFree 音频路由检测。"""

from app.services.tokenfree_audio import uses_tokenfree_audio
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL, TOKENFREE_CHANNEL_ID


def test_uses_tokenfree_audio():
    assert uses_tokenfree_audio(base_url=TOKENFREE_BASE_URL, channel_id=TOKENFREE_CHANNEL_ID)
    assert uses_tokenfree_audio(base_url="https://www.tokenfree.com/v1") is True
    assert uses_tokenfree_audio(base_url="https://ark.cn-beijing.volces.com/api/v3") is False
