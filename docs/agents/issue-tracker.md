# Issue tracker: Local Markdown

Issues and specs (also known as PRDs) live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`—never a combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments and conversation history append under a `## Comments` heading

## Publishing to the issue tracker

Create a file under `.scratch/<feature-slug>/`, creating the directory when needed.

## Fetching a ticket

Read the referenced file. The user will normally provide its path or issue number.

## Wayfinding operations

The map is a file with one child file per ticket.

- **Map:** `.scratch/<effort>/map.md`
- **Child ticket:** `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`
- **Metadata:** `Type:` records `research`, `prototype`, `grilling`, or `task`; `Status:` records `claimed` or `resolved`
- **Blocking:** `Blocked by: NN, NN`; a ticket is unblocked when every listed ticket is resolved
- **Frontier:** Scan for open, unblocked, unclaimed tickets; lowest number wins
- **Claim:** Set `Status: claimed` before starting work
- **Resolve:** Append the result under `## Answer`, set `Status: resolved`, and add a context pointer to the map
