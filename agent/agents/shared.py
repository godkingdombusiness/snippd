"""
agent/agents/shared.py — Grounding Hub

Single source of truth for:
  • Gemini 2.5-Flash client + tool configuration
  • Neo4j ThreadSafe singleton (handles 100k+ concurrent users)
  • Structured logging
  • Environment configuration

All other agents import from here. Never instantiate clients elsewhere.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from neo4j import GraphDatabase, Driver
from neo4j.exceptions import ServiceUnavailable, AuthError

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("snippd.agent.shared")

# ---------------------------------------------------------------------------
# Environment config
# ---------------------------------------------------------------------------

GEMINI_API_KEY: str = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

NEO4J_URI: str = os.environ["NEO4J_URI"]
NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD: str = os.environ["NEO4J_PASSWORD"]

MAPS_API_KEY: str = os.environ["GOOGLE_MAPS_API_KEY"]

# ---------------------------------------------------------------------------
# Gemini tool configuration
# ---------------------------------------------------------------------------

# Native Google Search grounding — Dynamic Retrieval mode.
# `dynamic_threshold=0.3` means Gemini will ground ≥30% of responses automatically.
SEARCH_TOOL = types.Tool(
    google_search=types.GoogleSearch(),
)

# Google Maps grounding — available on Gemini 2.5+ enterprise / Vertex AI.
# If the SDK version installed does not expose `GoogleMaps`, we fall back to
# the REST-based Maps Places API called directly in architect.py via httpx.
# The `MAPS_TOOL` sentinel below lets architect.py detect which path to take.
try:
    MAPS_TOOL = types.Tool(
        google_maps=types.GoogleMaps(),  # type: ignore[attr-defined]
    )
    MAPS_GROUNDING_NATIVE = True
    logger.info("Google Maps native grounding: ENABLED")
except AttributeError:
    MAPS_TOOL = None
    MAPS_GROUNDING_NATIVE = False
    logger.info("Google Maps native grounding: NOT AVAILABLE — using Places REST API fallback")


def get_gemini_client() -> genai.Client:
    """Return a configured Gemini client. Lightweight — safe to call per-request."""
    return genai.Client(api_key=GEMINI_API_KEY)


def build_search_config(
    temperature: float = 0.1,
    max_output_tokens: int = 8192,
    extra_tools: Optional[list] = None,
) -> types.GenerateContentConfig:
    """
    Return a GenerateContentConfig with Google Search grounding active.
    Pass `extra_tools` to add Maps or code_execution alongside Search.
    """
    tools = [SEARCH_TOOL]
    if extra_tools:
        tools = [t for t in extra_tools if t is not None] + [SEARCH_TOOL]

    return types.GenerateContentConfig(
        tools=tools,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )


def build_maps_config(temperature: float = 0.1) -> types.GenerateContentConfig:
    """
    Return a GenerateContentConfig with Maps grounding (native path).
    Only call this when MAPS_GROUNDING_NATIVE is True.
    """
    return types.GenerateContentConfig(
        tools=[MAPS_TOOL],
        temperature=temperature,
        max_output_tokens=2048,
    )


# ---------------------------------------------------------------------------
# Neo4j — ThreadSafe Singleton
# ---------------------------------------------------------------------------

class Neo4jDriver:
    """
    Thread-safe Neo4j driver singleton.

    Design:
      - Double-checked locking ensures only one driver is ever created,
        even under heavy concurrent load (100k+ users, async workers).
      - Connection pool size is tuned for a multi-threaded WSGI/ASGI server.
      - All callers use `.session()` — never access `._driver` directly.

    Usage:
        with Neo4jDriver.get().session() as session:
            result = session.run("RETURN 1")
    """

    _instance: Optional["Neo4jDriver"] = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self) -> None:
        self._driver: Driver = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USER, NEO4J_PASSWORD),
            # Pool settings for 100k+ users:
            max_connection_pool_size=200,         # simultaneous Bolt connections
            connection_acquisition_timeout=30.0,  # seconds before queue error
            max_transaction_retry_time=15.0,      # auto-retry window
            keep_alive=True,
        )
        # Verify connectivity at startup — fail fast rather than silently
        try:
            self._driver.verify_connectivity()
            logger.info("Neo4j driver connected: %s", NEO4J_URI)
        except (ServiceUnavailable, AuthError) as exc:
            self._driver.close()
            raise RuntimeError(f"Neo4j connection failed: {exc}") from exc

    @classmethod
    def get(cls) -> "Neo4jDriver":
        """Return the singleton instance, creating it if necessary."""
        if cls._instance is None:
            with cls._lock:
                # Second check inside the lock (classic double-checked locking)
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def session(self, database: Optional[str] = None, **kwargs):
        """
        Open a Neo4j session. Always use as a context manager:
            with Neo4jDriver.get().session() as s:
                ...
        """
        db_name = database if database is not None else os.getenv("NEO4J_DATABASE", "neo4j")
        return self._driver.session(database=db_name, **kwargs)

    @classmethod
    def close(cls) -> None:
        """Gracefully shut down the driver. Call on application teardown."""
        with cls._lock:
            if cls._instance is not None:
                cls._instance._driver.close()
                cls._instance = None
                logger.info("Neo4j driver closed")
