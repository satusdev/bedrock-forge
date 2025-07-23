# General Cline Rules

## Code Practices

- DRY, KISS, YAGNI, Single Responsibility.
- No inline comments – use self-explanatory names.
- Always use Prettier + ESLint formatting.
- Strict TypeScript rules, avoid `any`, use explicit return types.
- Write unit/integration tests for logic.

## Git & Commits

- Use Conventional Commits (feat/fix/chore etc.).
- Commit atomically after every task.
- Split files by domain after each task completion.

## Nx Specific

- Use `libs/`, respect boundaries.
- Use Nx generators and `nx affected`.

## MCPs

- Always use MCPs (Context7, Serena etc.) if stuck or complex.
- Apply sequential thinking and breakdowns (task → subtask → steps).
