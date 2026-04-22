"""Founder Action Queue helpers for ADK agents.

The canonical queue lives at ``.snippd/founder-actions.json`` in the repo and
is rendered to Slack by ``scripts/sync_founder_actions.mjs``.  From inside a
running ADK agent we don't have repo write-access, so this module exposes two
narrow surfaces:

- ``load_backlog()`` — read the queue for inspection / prompt grounding.
- ``queue_action_item(...)`` — append a proposed item to a local staging file
  (``.snippd/pending-actions.local.json``, gitignored).  A human agent (in a
  Cursor session) later promotes staged items into the canonical JSON via PR.

This keeps production agents from silently mutating the backlog while still
letting them surface concerns ("I just got three 429s from Stripe — founder
should check API quota") that won't be forgotten.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal, Optional

Category = Literal["security", "ship", "verify", "polish"]
Priority = Literal["critical", "high", "medium", "low"]

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKLOG_PATH = _REPO_ROOT / ".snippd" / "founder-actions.json"
_STAGING_PATH = _REPO_ROOT / ".snippd" / "pending-actions.local.json"

_VALID_CATEGORIES: tuple[Category, ...] = ("security", "ship", "verify", "polish")
_VALID_PRIORITIES: tuple[Priority, ...] = ("critical", "high", "medium", "low")


@dataclass
class ActionItem:
    """Strongly-typed representation of a single founder action.

    Mirrors the JSON schema in ``.snippd/founder-actions.json``.  Fields that
    don't map cleanly to ``dataclass`` defaults (``blockedBy`` specifically)
    are kept list-typed to make JSON round-tripping painless.
    """

    id: str
    title: str
    category: Category
    priority: Priority
    why: str
    where: str
    addedBy: str
    addedAt: str = field(
        default_factory=lambda: datetime.now(timezone.utc).date().isoformat()
    )
    blockedBy: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.category not in _VALID_CATEGORIES:
            raise ValueError(
                f"category must be one of {_VALID_CATEGORIES}, got {self.category!r}"
            )
        if self.priority not in _VALID_PRIORITIES:
            raise ValueError(
                f"priority must be one of {_VALID_PRIORITIES}, got {self.priority!r}"
            )
        if not self.id or not self.title or not self.why:
            raise ValueError("id, title, and why are all required")


def load_backlog() -> dict:
    """Return the parsed canonical backlog.

    Raises FileNotFoundError if the queue file has been deleted — that's a
    catastrophic repo state and should surface loudly, not be silently
    swallowed.
    """
    with _BACKLOG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_staged() -> list[dict]:
    """Return the list of locally-staged items awaiting human promotion."""
    if not _STAGING_PATH.exists():
        return []
    try:
        with _STAGING_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        # Corrupt staging file is a local-dev concern, not a production one;
        # return empty and let the next write overwrite cleanly.
        return []


def queue_action_item(
    *,
    id: str,
    title: str,
    category: Category,
    priority: Priority,
    why: str,
    where: str,
    added_by: str,
    blocked_by: Optional[Iterable[str]] = None,
) -> dict:
    """Stage a new action item for later promotion into the canonical queue.

    Returns the serialized item.  Idempotent on ``id``: a second call with
    the same id updates the existing staged row rather than duplicating it.
    """
    item = ActionItem(
        id=id,
        title=title,
        category=category,
        priority=priority,
        why=why,
        where=where,
        addedBy=added_by,
        blockedBy=list(blocked_by or []),
    )
    serialized = asdict(item)

    staged = load_staged()
    for i, existing in enumerate(staged):
        if existing.get("id") == id:
            staged[i] = serialized
            break
    else:
        staged.append(serialized)

    _STAGING_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _STAGING_PATH.open("w", encoding="utf-8") as fh:
        json.dump(staged, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    return serialized


def clear_staged(ids: Optional[Iterable[str]] = None) -> int:
    """Drop staged items (all, or those matching ``ids``).  Returns removed count.

    Used by the human-side promotion flow once items land in the canonical
    JSON via PR — avoids the staging file growing unbounded.
    """
    staged = load_staged()
    if not staged:
        return 0

    if ids is None:
        removed = len(staged)
        try:
            _STAGING_PATH.unlink()
        except FileNotFoundError:
            pass
        return removed

    drop = set(ids)
    kept = [item for item in staged if item.get("id") not in drop]
    removed = len(staged) - len(kept)

    if kept:
        with _STAGING_PATH.open("w", encoding="utf-8") as fh:
            json.dump(kept, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    else:
        try:
            _STAGING_PATH.unlink()
        except FileNotFoundError:
            pass

    return removed


__all__ = [
    "ActionItem",
    "load_backlog",
    "load_staged",
    "queue_action_item",
    "clear_staged",
]
