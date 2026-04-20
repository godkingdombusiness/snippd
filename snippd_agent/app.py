"""
Optional entry alias. Primary deploy surface is `agent.py` (`app` + `root_agent`).

`adk deploy` defaults to generating `agent_engine_app.py` which imports from `agent`, not this file.
"""

from __future__ import annotations

from agent import app, root_agent

__all__ = ["app", "root_agent"]
