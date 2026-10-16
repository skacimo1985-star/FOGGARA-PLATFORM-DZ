"""Offline unit tests using fictional inputs, not live client tests."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from response_checks import check_response


class ResponseChecksTests(unittest.TestCase):
    def test_valid_200_with_expected_key(self):
        r = check_response(status=200, expected_status=200,
                           body=json.dumps({"args": {"name": "demo"}}),
                           required_keys=("args",), elapsed_ms=120)
        self.assertTrue(r["passed"])

    def test_wrong_status_identified(self):
        r = check_response(status=500, expected_status=200, body="{}")
        self.assertFalse(r["passed"])
        self.assertIn("Expected HTTP 200, observed 500", r["errors"])

    def test_missing_key_detected(self):
        r = check_response(status=200, expected_status=200,
                           body='{"ok":true}', required_keys=("data",))
        self.assertFalse(r["passed"])
        self.assertIn("Missing JSON keys: data", r["errors"])

    def test_malformed_json_identified(self):
        r = check_response(status=200, expected_status=200,
                           body="broken", required_keys=("args",))
        self.assertFalse(r["passed"])
        self.assertIn("Body is not valid JSON", r["errors"])

    def test_expected_404_can_pass(self):
        r = check_response(status=404, expected_status=404, body="")
        self.assertTrue(r["passed"])

    def test_json_array_does_not_satisfy_object_requirement(self):
        r = check_response(status=200, expected_status=200,
                           body="[1,2]", required_keys=("id",))
        self.assertFalse(r["passed"])
        self.assertIn("JSON body must be an object", r["errors"])

    def test_negative_duration_is_invalid(self):
        r = check_response(status=200, expected_status=200,
                           body="{}", elapsed_ms=-1)
        self.assertFalse(r["passed"])
        self.assertIn("Elapsed time cannot be negative", r["errors"])


if __name__ == "__main__":
    unittest.main()
