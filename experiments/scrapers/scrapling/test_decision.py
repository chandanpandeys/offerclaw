import unittest

from decision import evaluate_rows


class DecisionGateTests(unittest.TestCase):
    def test_requires_representative_sample(self):
        rows = [
            {
                "source_url": "https://one.example/jobs/1",
                "scraper_mode": "http",
                "completeness": 1.0,
                "extraction_strategy": "json-ld",
            }
        ]
        self.assertEqual(evaluate_rows(rows)["verdict"], "insufficient_sample")

    def test_promote_candidate_when_hard_gates_clear(self):
        rows = []
        for index in range(5):
            rows.append(
                {
                    "source_url": f"https://company-{index}.example/jobs/1",
                    "scraper_mode": "http",
                    "completeness": 0.9,
                    "extraction_strategy": "json-ld",
                }
            )
        decision = evaluate_rows(rows)
        self.assertEqual(decision["verdict"], "promote_candidate")
        self.assertTrue(all(decision["checks"].values()))

    def test_keeps_experimental_when_reliability_is_weak(self):
        rows = []
        for index in range(5):
            rows.append(
                {
                    "source_url": f"https://company-{index}.example/jobs/1",
                    "scraper_mode": "http",
                    "error": "blocked",
                }
            )
        decision = evaluate_rows(rows)
        self.assertEqual(decision["verdict"], "keep_experimental")
        self.assertFalse(decision["checks"]["fetch_reliability"])


if __name__ == "__main__":
    unittest.main()
