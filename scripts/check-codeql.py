#!/usr/bin/env python3
"""Fail validation on high/critical security or error-level CodeQL findings."""

import json
import sys
from pathlib import Path


def blocking_findings(report):
    findings = []
    for run in report["runs"]:
        rules = {rule["id"]: rule for rule in run["tool"]["driver"].get("rules", [])}
        for result in run.get("results", []):
            rule = rules[result["ruleId"]]
            severity = float(rule.get("properties", {}).get("security-severity", 0))
            level = result.get("level", rule.get("defaultConfiguration", {}).get("level", "warning"))
            if severity >= 7 or level == "error":
                findings.append(f"{rule['id']}: {result['message']['text']}")
    return findings


def main():
    directory = Path(sys.argv[1] if len(sys.argv) > 1 else ".artifacts/codeql")
    files = sorted(directory.glob("*.sarif"))
    if not files:
        raise SystemExit(f"No CodeQL SARIF reports found in {directory}; refusing to pass.")
    findings = []
    for source in files:
        report = json.loads(source.read_text())
        if not report["runs"]:
            raise SystemExit(f"Empty CodeQL report: {source}")
        findings.extend(blocking_findings(report))
    for finding in findings:
        print(finding, file=sys.stderr)
    print(f"Checked {len(files)} CodeQL reports; {len(findings)} blocking findings.")
    return bool(findings)


if __name__ == "__main__":
    sys.exit(main())
