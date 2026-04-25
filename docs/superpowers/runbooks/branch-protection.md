# GitHub Branch Protection (main) — Manual Setup

**When to apply:** After Area 1 Phase E Layer 1 passes (all CI jobs green for at least 1 PR).

**Owner action required:** GitHub UI cannot be configured by code.

## Steps

1. Go to repo `Settings → Branches`
2. Click `Add branch protection rule`
3. Branch name pattern: `main`
4. Enable:
   - [x] Require a pull request before merging
     - [x] Require approvals: 1
   - [x] Require status checks to pass before merging
     - [x] Require branches to be up to date before merging
     - Status checks (search and add):
       - `Grep Guards`
       - `Backend pytest`
       - `Frontend lint + build + tests`
       - `Visual regression`
       - `Prod-like smoke`
   - [x] Require conversation resolution before merging
   - [x] Do not allow bypassing the above settings (no admin override)
5. Save changes

## Verify

Open a test PR with an obvious failure (e.g., add `<input type="number">` somewhere). Confirm:
- All 5 jobs run
- `Grep Guards` fails
- Merge button is grayed out

After verifying, close the test PR.

## Rollback

If branch protection blocks legitimate emergency hotfix:
- Admins can temporarily disable rule (uncheck "Do not allow bypassing")
- Re-enable immediately after merge
- Document the emergency in `docs/superpowers/retros/area-1.md`
