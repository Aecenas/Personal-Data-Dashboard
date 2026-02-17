# Agent Notes

## Version Sync Rule

- `version.ts` is the single source of truth for app version.
- If `APP_VERSION` in `version.ts` changes, you MUST run:
  - `npm run sync:readme-version`
- Include the resulting `README.md` update in the same commit.
