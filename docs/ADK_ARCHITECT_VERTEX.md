# ADK Stack Architect

The additive Vertex/ADK entrypoint is:

`agent/agents/adk_architect.py`

It does not replace the current async `agent/agents/architect.py` yet.

## Runtime Environment

Inject these from Google Secret Manager:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `ADK_MODEL` optional, defaults to `gemini-2.5-flash`

## Deploy Shape

```python
import vertexai
from vertexai.preview import reasoning_engines
from agent.agents.adk_architect import StackArchitect

vertexai.init(
    project="gen-lang-client-0848527535",
    location="us-central1",
    staging_bucket="gs://titan-staging-0848527535",
)

remote_app = reasoning_engines.ReasoningEngine.create(
    StackArchitect(),
    display_name="ADK_Stack_Architect_Universal",
    env_vars={
        "NEO4J_URI": "projects/PROJECT_ID/secrets/NEO4J_URI/versions/latest",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "projects/PROJECT_ID/secrets/NEO4J_PASSWORD/versions/latest",
        "SUPABASE_URL": "projects/PROJECT_ID/secrets/SUPABASE_URL/versions/latest",
        "SUPABASE_SERVICE_ROLE_KEY": "projects/PROJECT_ID/secrets/SUPABASE_SERVICE_ROLE_KEY/versions/latest",
    },
)
```

The architect proposes and assembles. Cloud Run `checkout-math` remains the funding/math authority.
