from __future__ import annotations

import json
import os
import re
import traceback
from typing import Any, Optional
from .db import AsyncSessionLocal
from .models import Extraction, TranscriptVersion, ExtractedItem
from .extractors.hf_structured import extract_structured


AUTO_APPROVE_THRESHOLD = float(os.getenv("AUTO_APPROVE_THRESHOLD", "0.78"))


def _as_list(x: Any):
    return x if isinstance(x, list) else []


def _as_str(x: Any):
    return x if isinstance(x, str) else None


def _clean_str(x: Any):
    if not isinstance(x, str):
        return None
    s = x.strip()
    return s if s else None


def _as_contexts(d: Any):
    """Accept either a dict with 'contexts' or a list directly."""
    if isinstance(d, list):
        out: list[str] = []
        for v in d:
            vs = _clean_str(v)
            if vs:
                out.append(vs)
        return out[:3]

    if not isinstance(d, dict):
        return []

    c = d.get("contexts")
    if isinstance(c, list):
        out: list[str] = []
        for v in c:
            vs = _clean_str(v)
            if vs:
                out.append(vs)
        return out[:3]
    return []


_TS_RE = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


def _clean_timestamp(v: Any):
    """Store timestamps as strings like 'MM:SS' or 'HH:MM:SS' when present."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            secs = int(v)
            if secs < 0:
                return None
            h = secs // 3600
            m = (secs % 3600) // 60
            s = secs % 60
            if h > 0:
                return f"{h:02d}:{m:02d}:{s:02d}"
            return f"{m:02d}:{s:02d}"
        except Exception:
            return None

    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if _TS_RE.match(s):
            return s
        s2 = re.sub(r"[^0-9:]", "", s)
        return s2 if _TS_RE.match(s2) else None

    return None


def _append_evidence(details: Optional[str], contexts: list[str]):
    if not contexts:
        return details
    ev = "\n".join([f"Evidence: {c}" if i == 0 else f"- {c}" for i, c in enumerate(contexts)])
    if details and details.strip():
        return details.strip() + "\n" + ev
    return ev


def _score_item(
    *,
    item_type: str,
    title: str,
    details: Optional[str],
    speaker: Optional[str],
    ts_start: Optional[str],
    contexts: list[str],
    has_owner: bool = False,
    has_due: bool = False,
    has_rationale: bool = False,
):
    """Heuristic confidence + review gating (works even without model-provided scores)."""
    reasons: list[str] = []
    field_conf: dict[str, float] = {}

    score = 0.45

    if title.strip():
        score += 0.15
        field_conf["title"] = 0.9
    else:
        reasons.append("missing_title")
        field_conf["title"] = 0.2

    if details and details.strip():
        score += 0.08
        field_conf["details"] = 0.75
    else:
        field_conf["details"] = 0.45

    if speaker:
        score += 0.08
        field_conf["speaker"] = 0.8
    else:
        field_conf["speaker"] = 0.45
        reasons.append("missing_speaker")

    if ts_start:
        score += 0.08
        field_conf["timestamp_start"] = 0.8
    else:
        field_conf["timestamp_start"] = 0.45
        reasons.append("missing_timestamp")

    if contexts:
        score += 0.06
        field_conf["evidence"] = 0.75
    else:
        field_conf["evidence"] = 0.4

    if item_type == "action_item":
        if not has_owner:
            reasons.append("missing_owner")
            score -= 0.08
        if not has_due:
            reasons.append("missing_due_date")
            score -= 0.03

    if item_type == "decision":
        if not has_rationale:
            reasons.append("missing_rationale")
            score -= 0.06

    if item_type == "estimate":
        if not re.search(r"\b(\d+\.?\d*)\b", title + " " + (details or "")):
            reasons.append("estimate_not_specific")
            score -= 0.06

    score = max(0.05, min(0.95, score))

    needs_review = score < AUTO_APPROVE_THRESHOLD
    return score, field_conf, needs_review, reasons


def _mk_item(**kwargs: Any) -> ExtractedItem:
    """Create ExtractedItem with only valid mapped columns (avoids constructor keyword errors)."""
    allowed = set(ExtractedItem.__table__.columns.keys())
    safe = {k: v for k, v in kwargs.items() if k in allowed}
    return ExtractedItem(**safe)


async def run_extraction_job(extraction_id: int) -> None:
    """Background job:
      1) load extraction + transcript
      2) call HF
      3) save extracted items
    """

    async with AsyncSessionLocal() as db:
        extraction = await db.get(Extraction, extraction_id)
        if not extraction:
            return

        tv = await db.get(TranscriptVersion, extraction.transcript_version_id)
        if not tv:
            extraction.status = "failed"
            extraction.error = "Transcript version not found"
            await db.commit()
            return

        transcript_text = tv.raw_text or ""
        model_override = (extraction.model or "").strip()
        if model_override.lower() in {"", "default", "hf_structured", "hf-structured"}:
            model_override = ""

    try:
        result = await extract_structured(transcript_text, model_id=model_override or None)
    except Exception as e:
        async with AsyncSessionLocal() as db:
            extraction = await db.get(Extraction, extraction_id)
            if extraction:
                extraction.status = "failed"
                extraction.error = f"Extractor error: {e}"
                await db.commit()
        return

    async with AsyncSessionLocal() as db:
        extraction = await db.get(Extraction, extraction_id)
        if not extraction:
            return

        try:
            try:
                extraction.raw_output = json.dumps(result, ensure_ascii=False)
            except Exception:
                extraction.raw_output = None

            items: list[ExtractedItem] = []

            for s in _as_list(result.get("summary")):
                ss = _clean_str(s)
                if not ss:
                    continue
                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="summary",
                    title=ss,
                    details=None,
                    speaker=None,
                    ts_start=None,
                    contexts=[],
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="summary",
                        title=ss,
                        details=None,
                        speaker=None,
                        timestamp_start=None,
                        timestamp_end=None,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            for d in _as_list(result.get("decisions")):
                if not isinstance(d, dict):
                    continue
                title = _clean_str(d.get("title"))
                if not title:
                    continue
                rationale = _clean_str(d.get("rationale"))
                details = _clean_str(d.get("details"))
                owner = _clean_str(d.get("owner"))
                due = _clean_str(d.get("due"))
                speaker = _clean_str(d.get("speaker"))
                ts_start = _clean_timestamp(d.get("timestamp_start"))
                ts_end = _clean_timestamp(d.get("timestamp_end"))
                contexts = _as_contexts(d)

                extra_bits = []
                if rationale:
                    extra_bits.append(f"Rationale: {rationale}")
                if owner:
                    extra_bits.append(f"Owner: {owner}")
                if due:
                    extra_bits.append(f"Due: {due}")
                merged_details = "\n".join([x for x in [details, " | ".join(extra_bits) if extra_bits else None] if x])
                merged_details = _append_evidence(merged_details, contexts)

                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="decision",
                    title=title,
                    details=merged_details,
                    speaker=speaker,
                    ts_start=ts_start,
                    contexts=contexts,
                    has_owner=bool(owner),
                    has_due=bool(due),
                    has_rationale=bool(rationale),
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="decision",
                        title=title,
                        details=merged_details,
                        speaker=speaker,
                        timestamp_start=ts_start,
                        timestamp_end=ts_end,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            for a in _as_list(result.get("action_items")):
                if not isinstance(a, dict):
                    continue
                title = _clean_str(a.get("title"))
                if not title:
                    continue
                details = _clean_str(a.get("details"))
                assignee = _clean_str(a.get("assignee"))
                due = _clean_str(a.get("due"))
                speaker = _clean_str(a.get("speaker"))
                ts_start = _clean_timestamp(a.get("timestamp_start"))
                ts_end = _clean_timestamp(a.get("timestamp_end"))
                contexts = _as_contexts(a)

                extra_bits = []
                if assignee:
                    extra_bits.append(f"Owner: {assignee}")
                if due:
                    extra_bits.append(f"Due: {due}")
                merged_details = "\n".join([x for x in [details, " | ".join(extra_bits) if extra_bits else None] if x])
                merged_details = _append_evidence(merged_details, contexts)

                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="action_item",
                    title=title,
                    details=merged_details,
                    speaker=speaker,
                    ts_start=ts_start,
                    contexts=contexts,
                    has_owner=bool(assignee),
                    has_due=bool(due),
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="action_item",
                        title=title,
                        details=merged_details,
                        speaker=speaker,
                        timestamp_start=ts_start,
                        timestamp_end=ts_end,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            for q in _as_list(result.get("open_questions")):
                if not isinstance(q, dict):
                    continue
                title = _clean_str(q.get("title")) or _clean_str(q.get("question"))
                if not title:
                    continue
                owner = _clean_str(q.get("owner"))
                speaker = _clean_str(q.get("speaker"))
                ts_start = _clean_timestamp(q.get("timestamp_start"))
                ts_end = _clean_timestamp(q.get("timestamp_end"))
                contexts = _as_contexts(q)

                merged_details = None
                if owner:
                    merged_details = f"Owner: {owner}"
                merged_details = _append_evidence(merged_details, contexts)

                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="open_question",
                    title=title,
                    details=merged_details,
                    speaker=speaker,
                    ts_start=ts_start,
                    contexts=contexts,
                    has_owner=bool(owner),
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="open_question",
                        title=title,
                        details=merged_details,
                        speaker=speaker,
                        timestamp_start=ts_start,
                        timestamp_end=ts_end,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            for est in _as_list(result.get("estimates")):
                if not isinstance(est, dict):
                    continue
                title = _clean_str(est.get("title")) or _clean_str(est.get("estimate"))
                if not title:
                    continue
                owner = _clean_str(est.get("owner"))
                details = _clean_str(est.get("details"))
                speaker = _clean_str(est.get("speaker"))
                ts_start = _clean_timestamp(est.get("timestamp_start"))
                ts_end = _clean_timestamp(est.get("timestamp_end"))
                contexts = _as_contexts(est)

                extra_bits = []
                if owner:
                    extra_bits.append(f"Owner: {owner}")
                merged_details = "\n".join([x for x in [details, " | ".join(extra_bits) if extra_bits else None] if x])
                merged_details = _append_evidence(merged_details, contexts)

                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="estimate",
                    title=title,
                    details=merged_details,
                    speaker=speaker,
                    ts_start=ts_start,
                    contexts=contexts,
                    has_owner=bool(owner),
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="estimate",
                        title=title,
                        details=merged_details,
                        speaker=speaker,
                        timestamp_start=ts_start,
                        timestamp_end=ts_end,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            for r in _as_list(result.get("risks")):
                if not isinstance(r, dict):
                    continue
                title = _clean_str(r.get("title")) or _clean_str(r.get("risk"))
                if not title:
                    continue
                mitigation = _clean_str(r.get("mitigation"))
                owner = _clean_str(r.get("owner"))
                speaker = _clean_str(r.get("speaker"))
                ts_start = _clean_timestamp(r.get("timestamp_start"))
                ts_end = _clean_timestamp(r.get("timestamp_end"))
                contexts = _as_contexts(r)

                extra_bits = []
                if mitigation:
                    extra_bits.append(f"Mitigation: {mitigation}")
                if owner:
                    extra_bits.append(f"Owner: {owner}")
                merged_details = " | ".join(extra_bits) if extra_bits else None
                merged_details = _append_evidence(merged_details, contexts)

                conf, field_conf, needs_review, reasons = _score_item(
                    item_type="risk",
                    title=title,
                    details=merged_details,
                    speaker=speaker,
                    ts_start=ts_start,
                    contexts=contexts,
                    has_owner=bool(owner),
                )
                status = "approved" if conf >= AUTO_APPROVE_THRESHOLD else "pending"
                items.append(
                    _mk_item(
                        extraction_id=extraction_id,
                        item_type="risk",
                        title=title,
                        details=merged_details,
                        speaker=speaker,
                        timestamp_start=ts_start,
                        timestamp_end=ts_end,
                        confidence=conf,
                        field_confidence=field_conf,
                        needs_review=status != "approved",
                        review_reasons=reasons or None,
                        status=status,
                    )
                )

            if items:
                db.add_all(items)

            extraction.status = "ready"
            extraction.error = None
            await db.commit()

        except Exception:
            extraction.status = "failed"
            extraction.error = traceback.format_exc()
            await db.commit()
