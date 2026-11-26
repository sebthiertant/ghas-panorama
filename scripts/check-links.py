#!/usr/bin/env python3
"""Audit the public source URLs collected from the rendered page."""

import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urldefrag, urlsplit


def check(url):
    if urlsplit(url).scheme != "https":
        return {"url": url, "status": "invalid", "detail": "Expected a public HTTPS source"}
    for attempt in range(2):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "GHAS-Panorama-Link-Check/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                return {"url": url, "status": "ok", "detail": str(response.status)}
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(2)
                continue
            status = "broken" if error.code in (404, 410) else "unverified"
            return {"url": url, "status": status, "detail": f"HTTP {error.code}"}
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 0:
                time.sleep(2)
                continue
            return {"url": url, "status": "unverified", "detail": str(error)}


def main():
    if sys.version_info < (3, 11):
        raise SystemExit("Source-link auditing requires Python 3.11+ for HTTP 308 redirect support.")
    source = Path(sys.argv[1] if len(sys.argv) > 1 else ".artifacts/source-links.json")
    urls = sorted({urldefrag(url)[0] for url in json.loads(source.read_text())})
    if not urls:
        raise ValueError("No public source links were collected")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(check, urls))
    report = source.with_name("link-report.json")
    report.write_text(json.dumps(results, indent=2) + "\n")
    problems = [result for result in results if result["status"] != "ok"]
    for result in problems:
        print(f"{result['status']}: {result['url']} ({result['detail']})", file=sys.stderr)
    print(f"Checked {len(urls)} source URLs; {len(problems)} need review. Report: {report}")
    return bool(problems)


if __name__ == "__main__":
    sys.exit(main())
