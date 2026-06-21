# Production Frontend Deployment

Every production frontend build must be followed immediately by a frontend
service restart. The running server can otherwise continue serving HTML from
the old server bundle after `dist/client` has been replaced. That old HTML
references hashed JavaScript and CSS files that the new build no longer
contains, leaving browsers with missing assets and a broken application shell.

Use `scripts/ops/deploy_frontend_safe.sh` before every production frontend
deployment. Run it from `/opt/it-knowledge-center/app` with `PUBLIC_BASE_URL`
set to the production frontend origin. The script verifies the deployment
source and required safeguards, builds and immediately restarts the frontend,
checks local and public routes, and confirms that every JavaScript and CSS asset
referenced by the current local HTML exists under `dist/client`.

GitHub `main` is protected. Pushing changes is a separate, controlled step and
is not performed by the deployment script.
