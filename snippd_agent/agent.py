"""
Vertex ADK agent module: exports `root_agent` and `app` (AdkApp) for Agent Engine.

`adk deploy agent_engine` generates `agent_engine_app.py` that imports `app` from this module.
"""

from __future__ import annotations

import warnings

# Quieter logs: Authlib uses AuthlibDeprecationWarning (not always DeprecationWarning).
warnings.filterwarnings("ignore", message=r".*authlib\.jose module is deprecated.*")
warnings.filterwarnings("ignore", message=r".*PLUGGABLE_AUTH.*")

from agents.architect import build_root_agent
from vertexai.agent_engines import AdkApp

root_agent = build_root_agent()
app = AdkApp(agent=root_agent)

__all__ = ["app", "root_agent"]
