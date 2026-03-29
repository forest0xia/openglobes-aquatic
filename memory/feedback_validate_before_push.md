---
name: Validate before pushing
description: Always test/validate changes locally before pushing to remote. Never push blindly.
type: feedback
---

Always test/validate before pushing. Do not push unless we know it will succeed.

**Why:** User wants to avoid broken CI/CD deployments. Test builds locally, check workflows logic, verify data paths before pushing.

**How to apply:** Run `pnpm build` locally, check workflow YAML logic, verify file paths and assumptions before any `git push`.
