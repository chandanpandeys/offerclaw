#!/usr/bin/env python3
"""Scrapling experiment: fetch a public job page and normalize it to OfferClaw-shaped JSON."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from scrapling.fetchers import DynamicFetcher, Fetcher, StealthyFetcher


@dataclass
class JobRecord:
    title: str | None = None
    company: str | None = None
    location: str | None = None
    description: str | None = None
    date_posted: str | None = None
    employment_type: str | None = None
    salary: str | None = None
    apply_url: str | None = None


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    text = html.unescape(str(value))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def walk_json(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_json(child)


def jobposting_jsonld(page: Any) -> dict[str, Any] | None:
    for node in page.css('script[type="application/ld+json"]'):
        raw = str(node.text or "").strip()
        if not raw:
            raw = str(node.get_all_text(ignore_tags=(), strip=True)).strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for item in walk_json(payload):
            item_type = item.get("@type")
            types = item_type if isinstance(item_type, list) else [item_type]
            if "JobPosting" in types:
                return item
    return None


def location_from_jsonld(value: Any) -> str | None:
    if isinstance(value, list):
        parts = [location_from_jsonld(item) for item in value]
        return clean_text(" | ".join(part for part in parts if part))
    if not isinstance(value, dict):
        return clean_text(value)

    address = value.get("address", value)
    if isinstance(address, dict):
        parts = [
            address.get("streetAddress"),
            address.get("addressLocality"),
            address.get("addressRegion"),
            address.get("postalCode"),
            address.get("addressCountry"),
        ]
        return clean_text(", ".join(str(part) for part in parts if part))
    return clean_text(address)


def salary_from_jsonld(value: Any) -> str | None:
    if not isinstance(value, dict):
        return clean_text(value)
    currency = value.get("currency") or ""
    inner = value.get("value", value)
    if isinstance(inner, dict):
        unit = inner.get("unitText") or ""
        if inner.get("minValue") is not None or inner.get("maxValue") is not None:
            low = inner.get("minValue", "?")
            high = inner.get("maxValue", "?")
            return clean_text(f"{currency} {low}-{high} {unit}")
        if inner.get("value") is not None:
            return clean_text(f"{currency} {inner['value']} {unit}")
    return clean_text(inner)


def first_dom_text(page: Any, selectors: list[str]) -> str | None:
    for selector in selectors:
        match = page.css(selector).first
        if match is None:
            continue
        value = clean_text(match.get_all_text(separator=" ", strip=True))
        if value:
            return value
    return None


def extract_job(page: Any, source_url: str) -> tuple[JobRecord, str]:
    data = jobposting_jsonld(page)
    if data:
        company = data.get("hiringOrganization")
        if isinstance(company, dict):
            company = company.get("name")
        record = JobRecord(
            title=clean_text(data.get("title")),
            company=clean_text(company),
            location=location_from_jsonld(data.get("jobLocation") or data.get("applicantLocationRequirements")),
            description=clean_text(data.get("description")),
            date_posted=clean_text(data.get("datePosted")),
            employment_type=clean_text(data.get("employmentType")),
            salary=salary_from_jsonld(data.get("baseSalary") or data.get("estimatedSalary")),
            apply_url=clean_text(data.get("url") or source_url),
        )
        return record, "json-ld"

    record = JobRecord(
        title=first_dom_text(page, ["h1", '[itemprop="title"]', '[class*="job-title"]', '[class*="jobTitle"]']),
        company=first_dom_text(page, ['[itemprop="hiringOrganization"]', '[class*="company-name"]', '[class*="companyName"]', ".company"]),
        location=first_dom_text(page, ['[itemprop="jobLocation"]', '[class*="location"]']),
        description=first_dom_text(page, ['[itemprop="description"]', '[class*="job-description"]', '[class*="description"]', "main"]),
        apply_url=source_url,
    )
    return record, "dom-fallback"


def fetch(url: str, mode: str, show_browser: bool, solve_cloudflare: bool) -> Any:
    if mode == "http":
        return Fetcher.get(url, impersonate="chrome", stealthy_headers=True)
    if mode == "dynamic":
        return DynamicFetcher.fetch(url, headless=not show_browser, network_idle=True)
    return StealthyFetcher.fetch(
        url,
        headless=not show_browser,
        network_idle=True,
        solve_cloudflare=solve_cloudflare,
    )


def completeness(record: JobRecord) -> float:
    values = asdict(record)
    important = ["title", "company", "location", "description", "apply_url"]
    present = sum(bool(values[key]) for key in important)
    return round(present / len(important), 2)


def run(url: str, mode: str, show_browser: bool = False, solve_cloudflare: bool = False) -> dict[str, Any]:
    started = time.perf_counter()
    page = fetch(url, mode, show_browser, solve_cloudflare)
    fetch_ms = round((time.perf_counter() - started) * 1000, 1)

    job, strategy = extract_job(page, url)
    return {
        "experiment": "scrapling",
        "scraper_mode": mode,
        "source_url": url,
        "source_host": urlparse(url).netloc,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "fetch_ms": fetch_ms,
        "http_status": getattr(page, "status", None),
        "extraction_strategy": strategy,
        "completeness": completeness(job),
        "job": asdict(job),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Public job-posting URL")
    parser.add_argument("--mode", choices=("http", "dynamic", "stealth"), default="http")
    parser.add_argument("--show-browser", action="store_true", help="Show the browser in dynamic/stealth mode")
    parser.add_argument(
        "--solve-cloudflare",
        action="store_true",
        help="Enable Scrapling's Cloudflare solver in stealth mode; use only where permitted",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON output path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = run(args.url, args.mode, args.show_browser, args.solve_cloudflare)
    except Exception as exc:  # Experiment CLI: surface errors in a machine-readable form.
        error = {"experiment": "scrapling", "source_url": args.url, "mode": args.mode, "error": str(exc)}
        print(json.dumps(error, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1

    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
