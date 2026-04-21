"""Post structured celebration messages to the Snippd #wins Slack channel.

This is the Python sibling of `scripts/post_win.mjs` — same payload shape so
wins from the Vertex ADK agents look identical to wins from GitHub Actions
and Stripe webhooks.

Env:
    SLACK_WINS_WEBHOOK_URL — Slack Incoming Webhook bound to #wins.

Why a dedicated tool: any agent can now celebrate a milestone end-to-end
(detect → compose → post) without the founder touching Slack manually.
Examples:
    - Retailer_Policy_Curator: "Publix rebate_compat policy refreshed."
    - Stack_Architect: "200th stack_candidate verified and live."
    - Data_Auditor: "48 hours crash-free on agent side."
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib import request as urlreq
from urllib.error import HTTPError, URLError

logger = logging.getLogger(__name__)

_KIND_EMOJI = {
    "launch": ":rocket:",
    "ship": ":package:",
    "milestone": ":trophy:",
    "revenue": ":moneybag:",
    "crash_free": ":shield:",
    "agent": ":robot_face:",
    "press": ":newspaper:",
    "default": ":sparkles:",
}


def _build_blocks(
    title: str,
    body: str,
    kind: str,
    url: Optional[str],
    source: Optional[str],
) -> list[dict]:
    emoji = _KIND_EMOJI.get(kind, _KIND_EMOJI["default"])
    footer_bits: list[str] = []
    if source:
        footer_bits.append(source)
    footer_bits.append(
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    )

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{emoji} {title}", "emoji": True},
        },
        {"type": "section", "text": {"type": "mrkdwn", "text": body}},
    ]
    if url:
        blocks.append(
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Open"},
                        "url": url,
                    }
                ],
            }
        )
    blocks.append(
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"_{' · '.join(footer_bits)}_"}],
        }
    )
    return blocks


def post_win(
    title: str,
    body: str = "",
    kind: str = "default",
    url: Optional[str] = None,
    source: Optional[str] = None,
    webhook_url: Optional[str] = None,
) -> str:
    """Post a win to #wins. Returns a JSON string describing the outcome.

    Args:
        title: Short headline used as the Slack header.
        body: Markdown body (1-3 sentences).
        kind: One of launch, ship, milestone, revenue, crash_free, agent,
            press, default.
        url: Optional "Open" button target.
        source: Attribution (e.g. "Retailer_Policy_Curator", "Stripe").
        webhook_url: Override env var SLACK_WINS_WEBHOOK_URL.
    """
    hook = webhook_url or os.environ.get("SLACK_WINS_WEBHOOK_URL")
    if not hook:
        reason = "SLACK_WINS_WEBHOOK_URL is not set — skipping (nothing posted)."
        logger.warning("[post_win] %s", reason)
        return json.dumps({"status": "skipped", "reason": reason})
    if not title:
        return json.dumps({"status": "error", "reason": "title is required"})

    payload = {
        "text": f"{title} — {body}"[:300],
        "blocks": _build_blocks(title, body, kind, url, source),
    }

    data = json.dumps(payload).encode("utf-8")
    req = urlreq.Request(
        hook,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlreq.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                return json.dumps({"status": "posted"})
            body_txt = resp.read().decode("utf-8", errors="replace")[:200]
            return json.dumps(
                {"status": "error", "reason": f"Slack {resp.status}: {body_txt}"}
            )
    except HTTPError as exc:
        body_txt = exc.read().decode("utf-8", errors="replace")[:200]
        return json.dumps(
            {"status": "error", "reason": f"Slack {exc.code}: {body_txt}"}
        )
    except URLError as exc:
        return json.dumps({"status": "error", "reason": f"Slack URLError: {exc}"})
