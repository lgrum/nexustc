# Domain Docs

This repository uses a single-context domain-doc layout.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read relevant decisions under `docs/adr/` when they exist.
- If these files do not exist, proceed silently. Domain-modeling skills create them only when needed.

## Layout

- `CONTEXT.md` contains the shared domain glossary and model.
- `docs/adr/` contains repository-wide architectural decisions.

## Vocabulary

Use terms defined in `CONTEXT.md` consistently. If a needed concept is absent, reconsider whether it belongs or note the gap for domain modeling.

## ADR conflicts

Explicitly identify output that contradicts an existing ADR rather than silently overriding it.
