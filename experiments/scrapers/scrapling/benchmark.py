#!/usr/bin/env python3
"""Benchmark Scrapling fetch modes against one or more public job URLs."""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path
from typing import Any

from decision import evaluate_rows
from scrape_job import run


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="+", help="Public job-posting URLs you are permitted to fetch")
    parser.add_argument("--modes", nargs="+", choices=("http", "dynamic", "stealth"), default=["http"])
    parser.add_argument("--runs", type=int, default=1, help="Runs per URL/mode; browser modes can be expensive")
    parser.add_argument("--cooldown", type=float, default=1.0, help="Seconds between requests")
    parser.add_argument("--output", type=Path, default=Path("results.json"))
    parser.add_argument("--solve-cloudflare", action="store_true")
    return parser.parse_args()


def summarize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault((row["source_url"], row.get("scraper_mode") or row.get("mode") or "unknown"), []).append(row)

    summary = []
    for (url, mode), values in groups.items():
        fetch_times = [row["fetch_ms"] for row in values if isinstance(row.get("fetch_ms"), (int, float))]
        completeness = [row["completeness"] for row in values if isinstance(row.get("completeness"), (int, float))]
        summary.append(
            {
                "source_url": url,
                "mode": mode,
                "runs": len(values),
                "successes": sum("error" not in row for row in values),
                "median_fetch_ms": round(statistics.median(fetch_times), 1) if fetch_times else None,
                "mean_completeness": round(statistics.mean(completeness), 2) if completeness else None,
                "strategies": sorted({row.get("extraction_strategy") for row in values if row.get("extraction_strategy")}),
            }
        )
    return summary


def main() -> int:
    args = parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be >= 1")

    rows: list[dict[str, Any]] = []
    for url in args.urls:
        for mode in args.modes:
            for attempt in range(1, args.runs + 1):
                try:
                    row = run(url, mode, solve_cloudflare=args.solve_cloudflare)
                    row["attempt"] = attempt
                except Exception as exc:
                    row = {
                        "experiment": "scrapling",
                        "source_url": url,
                        "scraper_mode": mode,
                        "attempt": attempt,
                        "error": str(exc),
                    }
                rows.append(row)
                print(json.dumps(row, ensure_ascii=False))
                if args.cooldown > 0:
                    time.sleep(args.cooldown)

    report = {
        "rows": rows,
        "summary": summarize(rows),
        "decision": evaluate_rows(rows),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote benchmark report to {args.output}")
    print(f"Decision gate: {report['decision']['verdict']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
