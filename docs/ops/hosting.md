# Bundle hosting and submission access (T16.07)

| | |
| --- | --- |
| **Owner** | Obidit Islam, team lead · R1 Data & GIS ([T16.07](../tasks/TASK-16_submission-package.md#t1607--implement-the-release-asset-fetch-route-and-decide-what-the-public-link-shows-test-the-link-in-a-private-window)) |
| **Date** | 2026-11-09 |
| **Status** | Decisions recorded; release and submission access pending |
| **Related** | [Feasibility](feasibility.md#large-tiles-in-the-repo) · [Task status](../tasks/status.md) · [Hosting choice](../specs/02_Technical_Requirements_Document.md#b-technology-choices) · [Static asset contract](../specs/02_Technical_Requirements_Document.md#e1-static-asset-contract) |

## Decisions

Decision (team confirmed 2026-11-03): distribute the site bundle (tiles, grid and images) as a GitHub release asset, not Git LFS. The same tarball serves as the release archive and clean-clone source. This closes the hosting half of [map open point 13](../tasks/_coordination.md#open-points): **release asset**. The other half, what the public link shows, is answered below. The decision and reason come from [feasibility.md](feasibility.md#large-tiles-in-the-repo).

Obidit Islam, data lead, decided on 2026-11-08 that the repository stays private. The Space Apps submission is a zip of the necessary files ([T30.01 status](../tasks/status.md)). There is no public repository link; the submission artefact is the zip. GitHub Pages remains a hosting option in [the technology choices](../specs/02_Technical_Requirements_Document.md#b-technology-choices), but it is not a published submission link.

`TODO(decision)`: Which link, if any, goes on the project page? Owner: T30.01 (data lead); [T16.06](../tasks/TASK-16_submission-package.md#t1606--fill-the-nasa-project-page-fields-complete-the-submission-checklist) uses the answer.

## Submission access

**A release asset on this private repository requires a signed-in GitHub account with repository access.** A judge or clean-checkout reader without that access cannot fetch it.

`TODO(decision)`: The data lead must choose how submission readers obtain the site bundle. The options are:

- Include the site bundle inside the submission zip. The bundle must respect NFR-09: site bundle ≤ 250 MB (v1), as recorded in [the nonfunctional requirements](../specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation).
- Attach the site bundle elsewhere. The location and access route remain undecided.

Neither option is selected here.

## Team download

No release exists yet. Bundle v1 belongs to [T03.19](../tasks/TASK-03_preprocessing-pipeline.md#t0319--run-the-pipeline-commit-bundle-v1-manifest-vectors-lock-file), which has no row in [the status record](../tasks/status.md) yet, so it has not started.

`TODO(decision)`: Release tag naming. Owner: data lead.

Once a release exists, a team member with repository access can use this route:

1. Sign in to GitHub CLI with the account that has repository access. Replace `<tag>` with the agreed release tag, then download from the team repository:

   ```sh
   gh release download <tag> --repo tashobi02/CheesySpace-NasaSpaceAppChallenge
   ```

2. Unpack the downloaded bundle in a temporary directory for verification. Compare its files with `data/sites/<site_id>/site-manifest.json`. The manifest's `assets` array lists the assets ([Site](../specs/05_Backend_and_Database_Schema.md#site)). For each file, resolve `path` relative to the site folder and compare its SHA-256 with `sha256`. For a tiles root, `sha256` is the hash of its index file ([Asset](../specs/05_Backend_and_Database_Schema.md#asset)). These fields verify asset files, not the tarball's own hash; the [site-manifest schema](../../schemas/site-manifest.schema.json) defines no archive-checksum field.
3. If the checks match, extract the bundle contents into `data/sites/<site_id>/`. Preserve `site-manifest.json` and the `tiles/`, `grid/`, `vectors/` and `images/` layout in [the static asset contract](../specs/02_Technical_Requirements_Document.md#e1-static-asset-contract). Stop if an asset is missing or a hash differs.

Obtain the bundle before running the application. NFR-01 requires no internet at runtime; NFR-08 requires LAN-only operation without third-party requests ([nonfunctional requirements](../specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation)). Keep downloaded datasets and large binaries out of Git ([data rule](../../CLAUDE.md#2-non-negotiables)); the existing [ignore rules](../../.gitignore) exclude site tiles, grid and images; `vectors/` and `site-manifest.json` are committed.

## Task hand-off

[T16.07 step 4](../tasks/TASK-16_submission-package.md#t1607--implement-the-release-asset-fetch-route-and-decide-what-the-public-link-shows-test-the-link-in-a-private-window) is **not done**: the repository was not made public, and the public-access private-window check was not performed. The T30.01 private-repository decision is the reason. This note does not mark that acceptance criterion as met.

Under T16.07 step 5, a release-asset fetch script, a `.gitignore` change or a deploy/release workflow change needs a new integration-lane subtask. Hand those changes to that lane under [the coordination rules](../tasks/_coordination.md#h5-changing-this-map). This document does not implement them.
