"""Package the public site files for production or for the develop preview."""

import argparse
import shutil
from pathlib import Path

PRODUCTION_URL = "https://sebthiertant.github.io/ghas-panorama/"
PREVIEW_URL = "https://sebthiertant.github.io/ghas-panorama-preview/"
PUBLIC_FILES = ("index.html", ".nojekyll")
PUBLIC_DIRS = ("assets",)


def preview_html(html, revision):
    if PRODUCTION_URL not in html or "<title>" not in html or "</head>" not in html:
        raise ValueError("index.html no longer has the expected production URL, title and head")
    html = html.replace(PRODUCTION_URL, PREVIEW_URL)
    html = html.replace("<title>", "<title>[Preview] ", 1)
    marker = (
        '  <meta name="robots" content="noindex, nofollow">\n'
        f'  <meta name="ghas-panorama-preview" content="{revision}">\n'
    )
    return html.replace("</head>", marker + "</head>", 1)


def package(source, output, preview_revision=None):
    source, output = Path(source), Path(output)
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name in PUBLIC_FILES:
        shutil.copy2(source / name, output / name)
    for name in PUBLIC_DIRS:
        shutil.copytree(source / name, output / name)
    if preview_revision:
        index = output / "index.html"
        index.write_text(preview_html(index.read_text(encoding="utf-8"), preview_revision), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output")
    parser.add_argument("--preview-revision", help="build the noindex develop preview for this commit")
    args = parser.parse_args()
    package(Path(__file__).resolve().parents[1], args.output, args.preview_revision)


if __name__ == "__main__":
    main()
