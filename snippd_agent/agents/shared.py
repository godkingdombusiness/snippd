"""Shared constants and model config for Snippd ADK agents."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Final, Optional

from google.adk.tools.google_search_tool import GoogleSearchTool

try:
    from google.genai import types as genai_types
except ImportError:  # pragma: no cover
    genai_types = None  # type: ignore[assignment]

DEFAULT_MODEL: Final[str] = os.environ.get("VERTEX_AGENT_MODEL", "gemini-2.5-flash")

CANONICAL_STORES: Final[tuple[dict[str, str], ...]] = (
    {"id": "walmart", "name": "Walmart", "origin": "https://www.walmart.com"},
    {"id": "aldi", "name": "Aldi", "origin": "https://www.aldi.us"},
    {"id": "target", "name": "Target", "origin": "https://www.target.com"},
)

# Pair Google Search with other tools (ADK requires bypass when combining tools).
GoogleSearchToolDiscovery = GoogleSearchTool(bypass_multi_tools_limit=True)

_COMPLIANCE_BLOCK = """
## Compliance (non-negotiable)
- Use **Google Search only** for discovery (prices, availability, public rebate pages).
- **Never** scrape HTML, automate browsers, or log into user retailer or rebate **accounts**.
- **No** bulk page fetch beyond what the Search tool returns as discovery snippets/links.
- Provide **official deep links** only (retailer domains, Ibotta.com, Fetch.com, Checkout51.com).
- Do not fabricate SKUs, prices, or clip links. If uncertain, omit the field.
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def gen_content_config() -> Optional[Any]:
    if genai_types is None:
        return None
    return genai_types.GenerateContentConfig(
        temperature=0.15,
        top_p=0.9,
        max_output_tokens=8192,
    )


def agent_extra_kwargs() -> dict[str, Any]:
    gc = gen_content_config()
    return {} if gc is None else {"generate_content_config": gc}
