from __future__ import annotations

import json
import os
import sys
import warnings
from contextlib import redirect_stderr
from pathlib import Path


os.environ["PYTHONWARNINGS"] = "ignore"
warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

ROOT = Path(__file__).resolve().parent
AGENT_ROOT = ROOT / "agent"
for path in (ROOT, AGENT_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:
        print("python-dotenv not installed; using existing process environment.")
        return

    env_path = ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print("Loaded environment from .env")
    else:
        print(".env not found; using existing process environment.")


def require_env(names: list[str], label: str, *, fatal: bool) -> bool:
    missing = [name for name in names if not os.environ.get(name)]
    if not missing:
        print(f"{label}: OK")
        return True

    print(f"{label}: missing {', '.join(missing)}")
    if fatal:
        raise RuntimeError(f"Missing required {label} variables: {', '.join(missing)}")
    return False


def print_json(title: str, value: object) -> None:
    print(f"\n{title}")
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def import_architect():
    try:
        from agent.agents.adk_architect import StackArchitect, query_stack_candidates
        return StackArchitect, query_stack_candidates
    except ModuleNotFoundError as exc:
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        try:
            from agent.agents.adk_architect import StackArchitect, query_stack_candidates
            return StackArchitect, query_stack_candidates
        except ModuleNotFoundError:
            print(f"Import failed: {exc}")
            print(f"Project root on sys.path: {ROOT}")
            print(f"Agent root on sys.path: {AGENT_ROOT}")
            raise


def main() -> int:
    print("Snippd Titan MVP stack-first smoke test")
    load_env()

    try:
        require_env(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "Supabase env", fatal=True)
        require_env(["NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"], "Neo4j env", fatal=False)

        with open(os.devnull, "w", encoding="utf-8") as devnull, redirect_stderr(devnull):
            StackArchitect, query_stack_candidates = import_architect()
            agent = StackArchitect()
            agent.set_up()
            result = agent.query("Find today's best Snippd-generated coupon stacks for Florida")

        baskets = result.get("recommended_baskets", []) if isinstance(result, dict) else []
        if not baskets:
            with open(os.devnull, "w", encoding="utf-8") as devnull, redirect_stderr(devnull):
                raw_rows = query_stack_candidates()
            raw_count = len(raw_rows.get("candidates", [])) if isinstance(raw_rows, dict) else 0
            if raw_count == 0:
                print("stack_candidates returned 0 active row(s).")
            else:
                print(f"stack_candidates returned {raw_count} active row(s).")
            print("No qualifying Snippd stacks returned from live stack_candidates.")
            print("This can mean rows are inactive, expired, missing prices, or lack a verified savings mechanism.")

        print_json("Live StackArchitect result:", result)
        return 0

    except ModuleNotFoundError as exc:
        print(f"ModuleNotFoundError: {exc}")
        print("Install the missing dependency or run from the project root.")
        return 1
    except RuntimeError as exc:
        print(f"Configuration error: {exc}")
        return 1
    except Exception as exc:
        message = str(exc)
        lower_message = message.lower()
        if any(token in lower_message for token in ("connection", "connect", "timeout", "dns", "http", "postgrest")):
            print("Database connection failure while reading live stack_candidates.")
        else:
            print("Unexpected failure while running StackArchitect.")
        print(f"{type(exc).__name__}: {message}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
