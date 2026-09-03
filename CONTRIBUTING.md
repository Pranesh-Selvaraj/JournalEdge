# Contributing to JournalEdge

## Product identity

The product name is written exactly as **JournalEdge**: one word, capital `J` and capital `E`. The top-bar logo must preserve this representation. Do not write `Journal Edge`, `Journaledge`, or `Journal EDGE`.

The canonical visual asset is [`journaledge-wordmark.svg`](./apps/frontend/public/journaledge-wordmark.svg). It renders **Journal** in `#f1f5f2` and **Edge** in `#34d399` using a bold Manrope wordmark. Use the asset rather than recreating the logo with alternate text, spacing, or colors.

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Use Node.js 20+ and pnpm 9.5.0. Keep changes focused and add or update unit tests for business logic.

## Validation

Run the same checks used by CI before opening a pull request:

```bash
pnpm build
pnpm test
```

## Pull requests

Pull requests must explain the behavior change, include validation results, and avoid secrets or real trading data. At least one maintainer review and all required checks are required before merge.

## Branch protection

For `main`, repository administrators should enable:

1. Require a pull request before merging.
2. Require at least one approving review and dismiss stale approvals.
3. Require the `validate` and `analyze` checks to pass.
4. Require branches to be up to date before merging.
5. Block force pushes and branch deletion.
6. Restrict direct pushes to maintainers and require signed commits where practical.
