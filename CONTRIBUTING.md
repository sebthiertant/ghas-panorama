# Updating GHAS Panorama

## Branches and releases

`feature/fix branch -> pull request -> develop -> release pull request -> main -> GitHub Pages`

- `develop` is the integration branch. Start work from its latest commit and target it with feature, content, fix and Dependabot pull requests.
- `main` is production. The release-policy check accepts only release PRs from this repository's `develop` branch.
- Require a PR, a current branch, and the `Validation` check on both branches. Keep force pushes and deletion blocked. Do not bypass these rules for routine updates.
- Review changes yourself if you are the sole maintainer. A second person's review is useful for product claims, but is not a mandatory approval that would prevent a solo maintainer from merging.
- Merge release PRs with a **merge commit**, not squash or rebase. This preserves the ancestry of the permanent `develop` branch.
- Only `main` may deploy to the `github-pages` environment. Successful integration checks do not publish `develop` or PR branches.
- There is no publicly deployed staging site. Run locally or download the PR's browser screenshots to review integration changes.

Example:

```sh
git fetch origin
git switch -c update/feature-name origin/develop
# Edit the public source-backed content and run the checks below.
git add <changed-files>
git commit -m "Update feature-name"
git push -u origin HEAD
```

Open a PR into `develop`, review its checks and screenshots, then merge it. When a batch is ready, open a release PR with base `main` and head `develop`. Review the complete release diff and merge only after its checks pass. After a release, merge `main` back into `develop` if it is behind; do not reset or force-push either branch.

## Automated gates

| Check | What it covers |
| --- | --- |
| Static checks | Missing assets, anchors, SVG symbols and ARIA references; duplicate IDs; HTTPS source references; JavaScript syntax; whitespace errors |
| Browser checks | Every feature dialog and its sources, deep links, keyboard navigation, focus restoration, QR rendering, theme persistence, responsive layouts and presentation mode |
| CodeQL | Extended JavaScript, Python tooling and Actions security analysis; blocks high/critical security and error-level findings; runs on PRs, integration/production pushes and weekly |
| Dependency review | Blocks high/critical known vulnerabilities introduced through tracked dependencies in PRs, including recognized Action dependencies |
| Release policy | Rejects production PRs not coming from this repository's `develop` |
| Validation | One required aggregate check; fails if any applicable check fails or is cancelled |
| Publish production | Runs only after validation on `main`; deploys `index.html`, `.nojekyll` and `assets/`, not tests or tooling |

CodeQL's completed analysis is not the same as zero findings. The workflow additionally checks its SARIF reports and fails on high/critical security or error-level results, including existing findings. Missing or malformed reports fail rather than passing silently. Lower-severity findings remain visible in the Security tab and `codeql-evidence` artifact; review those too. Do not dismiss an alert without documenting why it is safe.

Secret scanning and push protection must remain enabled in repository settings. Never commit a real secret to test them. Use the repository's security alerts to resolve existing findings; dependency review only examines changes.

The site has no package manifest or runtime package installation. The copied `assets/qrcode.js` is **not covered by package-manager vulnerability alerts**. Review its upstream security notices, source provenance and MIT license manually before replacing it. Dependabot proposes SHA-pinned Action updates into `develop`, with a seven-day cooldown.

The tests use Node's built-in runner and Chrome's DevTools protocol, without npm/Python packages. GitHub-hosted Ubuntu runners include Chrome. Local package tooling added in the future must use the approved package-download route; never put employee package-feed credentials into CI.

### Local checks

Use Node 24, Python 3.11+ and an installed Google Chrome:

```sh
python3 scripts/validate.py
python3 -m unittest discover -s tests -p '*_test.py'
node --check assets/app.js
node --check assets/qrcode.js
node --test tests/ui.test.mjs
git diff --check
```

Set `CHROME_PATH` if Chrome is installed somewhere other than the standard macOS/Linux location. Tests start their own loopback server under `/ghas-panorama/`, use a temporary browser profile, and remove it when finished.

Screenshots in `.artifacts/` cover desktop (1440px), tablet (768px), mobile (390px) and narrow mobile (320px), both themes, dialogs and every presentation slide. CI uploads them as `browser-evidence` for 14 days. Review these for intentional and accidental design changes. They are **review evidence, not pixel-diff baselines**; the automated layout checks catch overflow, while a human checks appearance. Chrome is covered; Safari/Firefox, real-device touch and OS fullscreen behavior still need manual checks when changed.

## Keeping product information current

The **Content maintenance** workflow runs each Monday at 07:15 UTC or on demand from Actions, on the default branch. It audits rendered source links, saves screenshots and `link-report.json` for 30 days, and opens one content-review issue if none is already open.

1. Review the report and GitHub's public changelog, then read the linked documentation. HTTP success does not prove a feature description is still accurate.
2. Verify included versus paid features, plan and repository-visibility limits, GHEC/GHES support, GA/preview status, and workflow-specific AI credits/Copilot access. Review `index.html` **and** the usage notes in `assets/app.js`.
3. Check public customer proof points against their sources. Never add internal-only links or private customer information.
4. Make a focused content PR into `develop`. Include source links and describe the claims you verified. Preserve existing tile IDs so shared deep links keep working.
5. Update the displayed "Status as of" date and the README date only after completing the corresponding factual review. Do not advance it merely because CI passed.
6. Review browser evidence, release through `develop -> main`, and close the review issue after verification.

To audit source URLs locally after the browser tests:

```sh
python3 scripts/check-links.py
```

404/410 responses are marked broken. Authentication, rate limits, other HTTP errors and network failures are marked unverified, never silently accepted. Both require review and fail the maintenance run. External checks are deliberately separate from required PR checks so transient source-site outages do not block unrelated fixes. URL fragments on external websites and the factual truth of claims require human review.

Schedules and Dependabot start only after their configuration reaches the default branch. GitHub may delay scheduled runs, and public-repository schedules can be disabled after prolonged inactivity; check Actions periodically.

## After publishing and rollback

Open the live Pages URL, check a feature deep link, both themes, the QR dialog and a presentation section. Verify the Pages deployment corresponds to the release commit.

If a release breaks production, revert the release merge with `git revert -m 1 <release-merge-sha>` on a new branch based on `develop`, then use the same checked feature-to-develop and develop-to-main PR path. Keep required validation/deployment workflows in place if the release also introduced those workflows; reverting them would remove the checks needed to merge the recovery PR. Do not force-push or deploy unvalidated files. For an urgent outage, the owner can explicitly authorize a documented temporary protection change; restore the rule immediately afterward.

## Initial activation

The `develop` branch, required-PR/`Validation` protections and merge-commit-only production releases are configured. Pages uses **GitHub Actions**, and the `github-pages` environment permits only `main`. Dependency graph, Dependabot alerts/security updates, secret scanning and push protection are enabled. Existing owner-only production updates and history protections remain in place.

The setup PR targets `develop`. Merge it there after its checks pass, then open a release PR from `develop` to `main` using a merge commit. The old published site remains available during the transition. Deployment, schedules and the repository's Dependabot configuration become active after that release reaches `main`; merging the setup PR into `develop` alone does not publish it.
