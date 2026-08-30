from pathlib import Path

from scrapling.parser import Selector

from scrape_job import extract_job


def test_extracts_jobposting_jsonld():
    fixture = Path(__file__).parent / "fixtures" / "jobposting.html"
    page = Selector(fixture.read_text(encoding="utf-8"), url="https://example.com/jobs/senior-ai-engineer")

    job, strategy = extract_job(page, "https://example.com/jobs/senior-ai-engineer")

    assert strategy == "json-ld"
    assert job.title == "Senior AI Engineer"
    assert job.company == "Example Labs"
    assert job.location == "Bengaluru, Karnataka, IN"
    assert job.description == "Build reliable AI systems and developer tooling."
    assert job.employment_type == "FULL_TIME"
    assert job.salary == "INR 1800000-2600000 YEAR"
    assert job.apply_url == "https://example.com/jobs/senior-ai-engineer"
