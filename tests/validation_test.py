import contextlib
import importlib.util
import io
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


def load_script(name):
    source = Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validator = load_script("validate")
links = load_script("check-links")
codeql = load_script("check-codeql")


class StaticValidationTests(unittest.TestCase):
    def test_valid_local_assets_and_fragment_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "assets").mkdir()
            (root / "assets/icons.svg").write_text('<svg><symbol id="key"/></svg>')
            (root / "index.html").write_text(
                '<h1 id="title">Panorama</h1><a href="#title">Top</a>'
                '<svg><use href="assets/icons.svg#key"/></svg>'
            )
            with patch.object(validator, "ROOT", root), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(validator.validate(), 0)

    def test_broken_content_fails_with_actionable_errors(self):
        cases = [
            ('<a href="#missing">Link</a>', "missing fragment"),
            ('<script src="assets/missing.js"></script>', "missing local file"),
            ('<p id="title">Duplicate</p>', "Duplicate id"),
            ('<section aria-labelledby="missing"></section>', "missing aria-labelledby target"),
            ('<a href="http://example.com">Source</a>', "expected HTTPS"),
        ]
        for content, message in cases:
            with self.subTest(message=message), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                (root / "index.html").write_text(f'<h1 id="title">Panorama</h1>{content}')
                errors = io.StringIO()
                with patch.object(validator, "ROOT", root), contextlib.redirect_stderr(errors):
                    self.assertEqual(validator.validate(), 1)
                self.assertIn(message, errors.getvalue())


class SourceAuditTests(unittest.TestCase):
    def test_not_found_is_broken_but_forbidden_is_unverified(self):
        for code, expected in [(404, "broken"), (410, "broken"), (403, "unverified")]:
            error = urllib.error.HTTPError("https://example.com", code, "test", {}, None)
            with self.subTest(code=code), patch.object(links.urllib.request, "urlopen", side_effect=error):
                result = links.check("https://example.com")
                self.assertEqual(result["status"], expected)

    def test_rate_limit_is_retried_but_never_reported_as_success(self):
        error = urllib.error.HTTPError("https://example.com", 429, "test", {}, None)
        with patch.object(links.urllib.request, "urlopen", side_effect=error) as request, patch.object(links.time, "sleep"):
            self.assertEqual(links.check("https://example.com")["status"], "unverified")
            self.assertEqual(request.call_count, 2)

    def test_network_failure_is_unverified(self):
        with patch.object(links.urllib.request, "urlopen", side_effect=urllib.error.URLError("offline")), patch.object(links.time, "sleep"):
            self.assertEqual(links.check("https://example.com")["status"], "unverified")


class CodeQLGateTests(unittest.TestCase):
    def test_blocks_high_security_and_error_level_findings(self):
        for severity, level, blocks in [("9.8", "warning", True), ("7.0", "warning", True), ("6.9", "warning", False), ("0", "error", True)]:
            with self.subTest(severity=severity, level=level):
                rule = {"id": "test/rule", "properties": {"security-severity": severity}}
                result = {"ruleId": "test/rule", "level": level, "message": {"text": "Test finding"}}
                report = {"runs": [{"tool": {"driver": {"rules": [rule]}}, "results": [result]}]}
                self.assertEqual(bool(codeql.blocking_findings(report)), blocks)

    def test_missing_rule_metadata_does_not_silently_pass(self):
        report = {"runs": [{"tool": {"driver": {"rules": []}}, "results": [{"ruleId": "unknown"}]}]}
        with self.assertRaises(KeyError):
            codeql.blocking_findings(report)


if __name__ == "__main__":
    unittest.main()
