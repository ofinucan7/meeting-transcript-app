import json
import os
import re
from __future__ import annotations
from typing import Any, Dict, Optional
from huggingface_hub import InferenceClient

# try to load .env
try:
    from dotenv import load_dotenv 
    load_dotenv()
except Exception:
    pass


SYSTEM_PROMPT = """You extract structured information from meeting transcripts.

Return ONLY valid JSON (no markdown, no backticks, no commentary).

========================
GUARDRAILS (NO GUESSING)
========================
1) EVIDENCE-BACKED FIELDS ONLY
- You MUST NOT infer or invent owners/assignees, due dates, rationales, estimates, timestamps, or names.
- Only fill a field if it is explicitly present in the transcript text.
- If not explicitly present, output null (or [] for lists).

Hard rule: If a field is non-null, it must be directly supported by the item’s contexts quotes.
- Example: If due != null, at least one context string must contain the due date phrase (e.g., "Due: 2025-12-23" or "by Friday").
- Example: If assignee/owner != null, at least one context must contain that person’s name tied to responsibility (e.g., "Priya will ..." or "Action: Priya ...").

2) SPEAKER/TIMESTAMP MUST COME FROM CONTEXT
- Speaker is ONLY the person speaking in the transcript line.
- Timestamp_start / timestamp_end must be copied EXACTLY from the transcript (HH:MM:SS or MM:SS).
- If you cannot quote a line that includes the timestamp and speaker label, set speaker=null and timestamp_start=null (do NOT guess).
- Prefer contexts that include the full original transcript line with timestamp + speaker label.

3) HIGH PRECISION OVER HIGH RECALL
- Prefer fewer, correct items over many items.
- If you are uncertain whether something qualifies, DO NOT output it.
- Every item MUST include contexts: 1–3 exact quotes copied verbatim from the transcript.
  If you cannot provide supporting verbatim quotes, omit the item entirely.

========================
CATEGORY DEFINITIONS
========================
- decision: a committed choice (e.g., "Decision:", "We will do X", "Let's go with X").
  Do NOT include due/owner unless explicitly assigned for that decision.
- action_item: a task with explicit responsibility (e.g., "Action:", "Alex will...", "Priya to...").
  assignee MUST be explicit; do not use the speaker as assignee unless the text assigns it.
- open_question: an unresolved question (e.g., "Should we...?", "How do we...?", "Do we need...?")
- estimate: a numeric or concrete estimate (e.g., "5 story points", "2 hours", "~3 days").

========================
OUTPUT RULES
========================
- Keep titles short and specific.
- details may be a short paraphrase, but MUST NOT add new facts.
- contexts must be exact quotes (verbatim) from the transcript.
"""


def _build_user_prompt(transcript: str) -> str:
    return (
        "Extract ONLY information that is explicitly stated in the transcript.\n"
        "Do NOT guess. If a field is not explicitly present, use null.\n\n"

        "IMPORTANT VALIDATION RULE:\n"
        "- Any non-null field (owner/assignee/due/rationale/speaker/timestamp) must be supported by the contexts quotes.\n"
        "- If you cannot find a verbatim quote that contains the value, set that field to null.\n"
        "- Every item MUST include 1-3 verbatim contexts quotes, otherwise omit the item.\n\n"

        "Transcript:\n"
        f"{transcript}\n\n"

        "Return JSON with EXACTLY these top-level keys:\n"
        "{\n"
        "  \"summary\": [string],\n"
        "  \"decisions\": [object],\n"
        "  \"action_items\": [object],\n"
        "  \"open_questions\": [object],\n"
        "  \"estimates\": [object]\n"
        "}\n\n"

        "SCHEMA (do not add extra keys):\n"
        "1) summary: 5-10 bullet points (string array). Only major topics that appear in transcript.\n\n"

        "2) decisions: list of objects with keys:\n"
        "   {\"title\": str,\n"
        "    \"rationale\": str|null,\n"
        "    \"details\": str|null,\n"
        "    \"owner\": str|null,\n"
        "    \"due\": str|null,\n"
        "    \"speaker\": str|null,\n"
        "    \"timestamp_start\": str|null,\n"
        "    \"timestamp_end\": str|null,\n"
        "    \"contexts\": [str]}\n"
        "   Rules:\n"
        "   - Only include if an explicit decision is stated.\n"
        "   - owner/due MUST be null unless explicitly assigned for the decision.\n"
        "   - rationale MUST be null unless explicitly stated (e.g., 'because ...', 'to avoid ...').\n\n"

        "3) action_items: list of objects with keys:\n"
        "   {\"title\": str,\n"
        "    \"details\": str|null,\n"
        "    \"assignee\": str|null,\n"
        "    \"due\": str|null,\n"
        "    \"speaker\": str|null,\n"
        "    \"timestamp_start\": str|null,\n"
        "    \"timestamp_end\": str|null,\n"
        "    \"contexts\": [str]}\n"
        "   Rules:\n"
        "   - Only include if the transcript explicitly assigns responsibility.\n"
        "   - assignee MUST be explicitly named in a context quote; otherwise assignee=null.\n"
        "   - due MUST be explicitly stated in a context quote; otherwise due=null.\n\n"

        "4) open_questions: list of objects with keys:\n"
        "   {\"title\": str,\n"
        "    \"owner\": str|null,\n"
        "    \"speaker\": str|null,\n"
        "    \"timestamp_start\": str|null,\n"
        "    \"timestamp_end\": str|null,\n"
        "    \"contexts\": [str]}\n"
        "   Rules:\n"
        "   - Include only unresolved questions.\n"
        "   - owner MUST be null unless someone is explicitly assigned to resolve the question.\n\n"

        "5) estimates: list of objects with keys:\n"
        "   {\"title\": str,\n"
        "    \"owner\": str|null,\n"
        "    \"details\": str|null,\n"
        "    \"speaker\": str|null,\n"
        "    \"timestamp_start\": str|null,\n"
        "    \"timestamp_end\": str|null,\n"
        "    \"contexts\": [str]}\n"
        "   Rules:\n"
        "   - Only include if a numeric/time/points estimate is explicitly stated.\n"
        "   - owner MUST be null unless explicitly tied to a person in the quote.\n\n"

        "Timestamp/Speaker rule reminder:\n"
        "- If transcript includes lines like '00:05:22 Priya: ...', include that full line (or a verbatim portion containing the timestamp + speaker) in contexts.\n"
        "- Then set speaker and timestamp_start from that same quoted line.\n"
        "- If you cannot quote timestamp+speaker, set them to null.\n"
    )


_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _strip_code_fences(s: str):
    return re.sub(_CODE_FENCE_RE, "", s).strip()


def _extract_json_fragment(s: str):
    start_obj = s.find("{")
    start_arr = s.find("[")
    if start_obj == -1 and start_arr == -1:
        return None

    if start_obj != -1 and (start_arr == -1 or start_obj < start_arr):
        start = start_obj
        end = s.rfind("}")
    else:
        start = start_arr
        end = s.rfind("]")
    if end == -1 or end <= start:
        return None
    return s[start : end + 1]


def _coerce_json(content: str):
    if not content:
        return {}
    txt = _strip_code_fences(content)

    try:
        data = json.loads(txt)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass

    frag = _extract_json_fragment(txt)
    if frag:
        try:
            data = json.loads(frag)
            return data if isinstance(data, dict) else {}
        except Exception:
            pass

    return {}


def _normalize(data: Dict[str, Any]):
    data.setdefault("summary", [])
    data.setdefault("decisions", [])
    data.setdefault("action_items", [])
    data.setdefault("open_questions", [])
    data.setdefault("estimates", [])
    data.setdefault("risks", [])
    return data


def _get_env(name: str, fallback: Optional[str] = None):
    v = os.getenv(name)
    return v if v and v.strip() else fallback


async def extract_structured(transcript: str, model_id: Optional[str] = None):
    """Calls Hugging Face Inference Providers (router.huggingface.co) via huggingface_hub.

    Env vars:
      - HF_TOKEN (required)
      - HF_MODEL_ID (required unless model_id passed)
      - HF_PROVIDER (optional) default: "auto"
    """
    token = _get_env("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is not set")

    provider = _get_env("HF_PROVIDER", "auto")

    override = (model_id or "").strip()
    if override.lower() in {"", "default", "hf_structured", "hf-structured"}:
        override = ""

    model = override or _get_env("HF_MODEL_ID")
    if not model:
        raise RuntimeError("HF_MODEL_ID is not set")

    max_chars = 30_000
    clipped = transcript if len(transcript) <= max_chars else transcript[:max_chars]

    client = InferenceClient(api_key=token, provider=provider)

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(clipped)},
        ],
        max_tokens=1800,
        temperature=0,
    )

    content = completion.choices[0].message.content or ""
    data = _coerce_json(content)
    return _normalize(data)
