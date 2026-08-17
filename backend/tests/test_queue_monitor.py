"""队列监控解析单测。"""

import json

from app.services.queue_monitor import parse_broker_message, task_label


def test_task_label_known():
    assert task_label("drama.script_summary") == "漫剧·剧本摘要"


def test_parse_broker_message_minimal():
    msg = {
        "headers": {
            "id": "abc-123",
            "task": "drama.script_summary",
            "argsrepr": "(9,)",
        },
        "properties": {"delivery_info": {"routing_key": "drama"}},
        "body": __import__("base64").b64encode(json.dumps([[9], {}, {}]).encode()).decode(),
    }
    row = parse_broker_message(json.dumps(msg), queue="drama", position=1)
    assert row is not None
    assert row["task_id"] == "abc-123"
    assert row["queue"] == "drama"
    assert row["ref_id"] == 9
    assert row["state"] == "pending"
