"""
Vertex ADK agent module: exports `root_agent` and `app` (AdkApp) for Agent Engine.

`adk deploy agent_engine` generates `agent_engine_app.py` that imports `app`
from this module.
"""

from __future__ import annotations

import warnings

# Quieter logs: Authlib uses AuthlibDeprecationWarning (not always DeprecationWarning).
warnings.filterwarnings("ignore", message=r".*authlib\.jose module is deprecated.*")
warnings.filterwarnings("ignore", message=r".*PLUGGABLE_AUTH.*")

# Initialize Sentry BEFORE building the agent graph so tool imports that crash
# at module load are captured. This is a no-op if SENTRY_DSN is not set.
from tools.sentry_hook import init_agent_sentry  # noqa: E402

init_agent_sentry()

from agents.architect import build_root_agent  # noqa: E402
from vertexai.agent_engines import AdkApp  # noqa: E402

root_agent = build_root_agent()
app = AdkApp(agent=root_agent)

__all__ = ["app", "root_agent"]
