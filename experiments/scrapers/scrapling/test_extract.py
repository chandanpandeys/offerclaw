import unittest
from pathlib import Path

from scrapling.parser import Selector

from scrape_job import extract_job


class ExtractJobTests(unittest.TestCase):
    def test_extracts_jobposting_jsonld(self):
        fixture = Path(__file__).parent / "fixtures" / "jobposting.html"
        page = Selector(
            fixture.read_text(encoding="utf-8"),
            url="https://example.com/jobs/senior-ai-engineer",
        )

        job, strategy = extract_job(page, "https://example.com/jobs/senior-ai-engineer")

        self.assertEqual(strategy, "json-ld")
        self.assertEqual(job.title, "Senior AI Engineer")
        self.assertEqual(job.company, "Example Labs")
        self.assertEqual(job.location, "Bengaluru, Karnataka, IN")
        self.assertEqual(job.description, "Build reliable AI systems and developer tooling.")
        self.assertEqual(job.employment_type, "FULL_TIME")
        self.assertEqual(job.salary, "INR 1800000-2600000 YEAR")
        self.assertEqual(job.apply_url, "https://example.com/jobs/senior-ai-engineer")


if __name__ == "__main__":
    unittest.main()
