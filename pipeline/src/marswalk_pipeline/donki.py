"""Convert the local DONKI cache to replayed scenario events (T21.05)."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Mapping

U44_WINDOW = ("2024-05-13", "2024-05-24")

_FIELDS = {
    "FLR": ("flrID", "beginTime"),
    "CME": ("activityID", "startTime"),
    "SEP": ("sepID", "eventTime"),
    "IPS": ("activityID", "eventTime"),
    "WSAEnlilSimulations": ("simulationID", "modelCompletionTime"),
}


def _utc(value: str) -> str:
    """Normalize a DONKI UTC timestamp to whole-second ISO format."""
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("DONKI time must be a UTC timestamp")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.microsecond:
        raise ValueError("DONKI time must have whole-second precision")
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _event(donki_type: str, record: Mapping[str, Any], source_id: str) -> dict[str, Any]:
    id_field, time_field = _FIELDS[donki_type]
    record_id = record.get(id_field)
    if not isinstance(record_id, str) or not record_id:
        raise ValueError(f"{donki_type} record requires {id_field}")
    timestamp = _utc(record.get(time_field))
    identity = json.dumps([donki_type, record_id], ensure_ascii=True, separators=(",", ":"))
    event_id = "donki-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()
    summary = record_id
    if donki_type == "FLR" and record.get("classType"):
        summary += f" ({record['classType']})"
    payload = {"donki_type": donki_type, "donki_id": record_id, "summary": summary}
    if donki_type == "WSAEnlilSimulations":
        for impact in record.get("impactList") or []:
            if impact.get("location") == "Mars" and impact.get("arrivalTime"):
                payload["predicted_mars_arrival_utc"] = _utc(impact["arrivalTime"])
                break
    return {
        "event_id": event_id,
        "t_utc": timestamp,
        "kind": "DONKI_RECORD",
        "provenance": "replayed",
        "source_id": source_id,
        "payload": payload,
    }


def donki_events(
    records: Mapping[str, list[dict[str, Any]]],
    source_id: str,
    window: tuple[str, str] = U44_WINDOW,
) -> list[dict[str, Any]]:
    """Extract events in the inclusive UTC date window, rejecting conflicting records."""
    start, end = (date.fromisoformat(day) for day in window)
    if start > end:
        raise ValueError("window start must not be after its end")
    events: dict[str, dict[str, Any]] = {}
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    for donki_type, entries in records.items():
        if donki_type == "CMEAnalysis":
            continue
        if donki_type not in _FIELDS:
            raise ValueError(f"unknown DONKI type: {donki_type}")
        for record in entries:
            event = _event(donki_type, record, source_id)
            record_id = event["payload"]["donki_id"]
            key = (donki_type, record_id)
            previous = seen.get(key)
            if previous is not None and previous != record:
                fields = sorted(
                    field
                    for field in previous.keys() | record.keys()
                    if field not in previous or field not in record or previous[field] != record[field]
                )
                raise ValueError(f"conflicting {donki_type} record {record_id}: differing fields {', '.join(fields)}")
            seen[key] = record
            event_day = date.fromisoformat(event["t_utc"][:10])
            if start <= event_day <= end:
                event_id = event["event_id"]
                events[event_id] = event
    return sorted(events.values(), key=lambda event: (event["t_utc"], event["event_id"]))


def load_cache(cache_dir: str | Path) -> dict[str, list[dict[str, Any]]]:
    """Read the local JSON arrays, keyed by filename stem."""
    result = {}
    for path in sorted(Path(cache_dir).glob("*.json")):
        with path.open(encoding="utf-8") as stream:
            records = json.load(stream)
        if not isinstance(records, list):
            raise ValueError(f"{path} must contain a JSON array")
        result[path.stem] = records
    return result
