"""Pure benchmark decision logic for the Scrapling experiment."""

from __future__ import annotations

import statistics
from typing import Any

DEFAULT_GATE = {
    "min_sources": 5,
    "min_success_rate": 0.95,
    "min_mean_completeness": 0.80,
    "min_http_success_rate": 0.70,
}


def _mean(values: list[float]) -> float | None:
    return round(statistics.mean(values), 3) if values else None


def evaluate_rows(rows: list[dict[str, Any]], gate: dict[str, float] | None = None) -> dict[str, Any]:
    criteria = {**DEFAULT_GATE, **(gate or {})}
    sources = {row.get("source_url") for row in rows if row.get("source_url")}
    completed = [row for row in rows if "error" not in row]
    completeness = [float(row["completeness"]) for row in completed if isinstance(row.get("completeness"), (int, float))]
    http_rows = [row for row in rows if row.get("scraper_mode") == "http"]
    http_successes = [row for row in http_rows if "error" not in row]

    success_rate = len(completed) / len(rows) if rows else 0.0
    http_success_rate = len(http_successes) / len(http_rows) if http_rows else 0.0
    mean_completeness = _mean(completeness) or 0.0
    json_ld_rows = [row for row in completed if row.get("extraction_strategy") == "json-ld"]
    json_ld_rate = len(json_ld_rows) / len(completed) if completed else 0.0

    checks = {
        "representative_sample": len(sources) >= int(criteria["min_sources"]),
        "fetch_reliability": success_rate >= criteria["min_success_rate"],
        "field_completeness": mean_completeness >= criteria["min_mean_completeness"],
        "http_first_coverage": http_success_rate >= criteria["min_http_success_rate"],
    }

    if not checks["representative_sample"]:
        verdict = "insufficient_sample"
    elif all(checks.values()):
        verdict = "promote_candidate"
    else:
        verdict = "keep_experimental"

    return {
        "verdict": verdict,
        "checks": checks,
        "metrics": {
            "sources": len(sources),
            "rows": len(rows),
            "success_rate": round(success_rate, 3),
            "mean_completeness": round(mean_completeness, 3),
            "http_success_rate": round(http_success_rate, 3),
            "json_ld_rate": round(json_ld_rate, 3),
        },
        "gate": criteria,
        "note": "A promote_candidate verdict means benchmark quality is strong enough to design a production ingestion service; it does not authorize scraping or replace JSearch automatically.",
    }
