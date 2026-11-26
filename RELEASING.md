# Releasing `dsh-infinite-canvas-bridge`

## Pre-release Checklist

1. Ensure `npm run check` passes cleanly (`client.js` rebuilt + all `test/*.test.mjs` passing).
2. Verify `npm pack --dry-run` includes:
   - `src/`
   - `client.js`
   - `cordis.patch.yml`
   - `locale/en.json` and `locale/zh.json`
   - `docs/DETAIL.md`, `docs/DETAIL.zh.md`, `docs/preview.svg`
   - `skills/infinite-canvas-bridge/SKILL.md`
   - `icon.svg`, `LICENSE`, `README.md`, `README.zh-CN.md`, `CHANGELOG.md`
3. Confirm no host-specific paths, personal secrets, or `.env` files appear in the pack output.
4. Update `version` in `package.json` and move items under `CHANGELOG.md` `[Unreleased]` to the new version section.

## Publishing

```bash
git tag v0.1.0
git push origin main --tags
npm publish --access public
```
