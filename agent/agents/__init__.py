"""
agents/ — Gemini-powered agent layer.

Public surface:
    from agents.architect import run_architect, ShoppingHaul, ArchitectError
    from agents.shared import Neo4jDriver, get_gemini_client
"""

try:
    from agents.architect import ArchitectError, ShoppingHaul, run_architect
except ModuleNotFoundError:
    ArchitectError = None
    ShoppingHaul = None
    run_architect = None

try:
    from agents.shared import Neo4jDriver, get_gemini_client
except ModuleNotFoundError:
    Neo4jDriver = None
    get_gemini_client = None

__all__ = [
    "run_architect",
    "ShoppingHaul",
    "ArchitectError",
    "Neo4jDriver",
    "get_gemini_client",
]
