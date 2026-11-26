#!/usr/bin/env python3
"""Check the static site's local assets, anchors, and accessible references."""

import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        self.elements.append((tag, dict(attributes), self.getpos()[0]))


def validate():
    document = Document((ROOT / "index.html").read_text())
    counts = Counter(attrs["id"] for _, attrs, _ in document.elements if "id" in attrs)
    errors = [f"Duplicate id: {value}" for value, count in counts.items() if count > 1]

    def check_reference(value, origin, line):
        url = urlsplit(value)
        if url.scheme or url.netloc:
            if url.scheme != "https":
                errors.append(f"{origin}:{line}: expected HTTPS: {value}")
            return
        path = (origin.parent / unquote(url.path)).resolve() if url.path else origin
        if not path.is_relative_to(ROOT) or not path.is_file():
            errors.append(f"{origin.relative_to(ROOT)}:{line}: missing local file: {value}")
            return
        if url.fragment:
            fragment = unquote(url.fragment)
            if path.suffix == ".svg":
                ids = {node.get("id") for node in ElementTree.parse(path).iter()}
            elif path.name == "index.html":
                ids = counts
            else:
                errors.append(f"{origin}:{line}: unsupported fragment target: {value}")
                return
            if fragment not in ids:
                errors.append(f"{origin.relative_to(ROOT)}:{line}: missing fragment: {value}")

    for tag, attrs, line in document.elements:
        for attribute in ("href", "src"):
            if attribute in attrs:
                check_reference(attrs[attribute], ROOT / "index.html", line)
        for attribute in ("aria-labelledby", "aria-describedby"):
            for target in attrs.get(attribute, "").split():
                if target not in counts:
                    errors.append(f"index.html:{line}: missing {attribute} target: {target}")
        if tag == "img" and "alt" not in attrs:
            errors.append(f"index.html:{line}: image needs an alt attribute")

    if sum(tag == "h1" for tag, _, _ in document.elements) != 1:
        errors.append("index.html must have exactly one h1")
    for css in (ROOT / "assets").glob("*.css"):
        for match in re.finditer(r"url\(\s*['\"]?([^'\"\s)]+)['\"]?\s*\)", css.read_text()):
            check_reference(match[1], css, css.read_text()[:match.start()].count("\n") + 1)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Static content OK: {len(counts)} unique IDs; local assets and references resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(validate())
