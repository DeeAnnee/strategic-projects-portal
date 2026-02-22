# AGENTS Instructions

## Project Scope
- Build and maintain the Strategic Projects Portal under this directory.
- Follow `PLANS.md` milestone order unless user explicitly reprioritizes.

## Engineering Rules
- Keep changes small and milestone-oriented.
- Update `PLANS.md` status and acceptance notes at each milestone.
- Record architectural or security choices in `docs/DECISIONS.md`.
- Enforce server-side authorization for all privileged paths/actions.
- Avoid introducing external credentials; use `.env.example` placeholders.

## Validation
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before milestone close when dependencies are available.
- If environment/network constraints block checks, document that clearly in milestone summary.
