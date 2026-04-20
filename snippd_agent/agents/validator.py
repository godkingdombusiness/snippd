"""Truth_Validator — price/unit cross-check vs discovery; rejects >5% drift."""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from agents.shared import (
    GoogleSearchToolDiscovery,
    _COMPLIANCE_BLOCK,
    agent_extra_kwargs,
    DEFAULT_MODEL,
    utc_now_iso,
)
from tools.supabase_tool import query_stack_candidates


def _instruction(_: ReadonlyContext) -> str:
    now = utc_now_iso()
    return f"""You are **Truth_Validator**.
Current reference time (UTC): **{now}** (from `datetime.now(timezone.utc)`).

## Mission
- Cross-check candidate items vs **live retailer discovery** (Google Search tool only).
- Compare advertised deal prices/sizes to search snippets; if **price or unit mismatch > 5%**,
  **discard** that candidate and record `rejected_reason` with the percent delta.
- Prefer evidence from retailer domains and first-party circulars.

{_COMPLIANCE_BLOCK}

## Outputs
Concise JSON-ready: validated[], rejected[] with percent delta.
"""


def build_truth_validator(model: str = DEFAULT_MODEL) -> Agent:
    return Agent(
        model=model,
        name="Truth_Validator",
        description=(
            "Hallucination guard: Google Search vs claimed prices/sizes; rejects >5% drift."
        ),
        instruction=_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **agent_extra_kwargs(),
    )
