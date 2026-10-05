# Deploy the constellation dashboard

The current public dashboard is available at [CRISPR Perturbation Explorer](https://crispr-perturbation-explorer.ryan-m-zheng07.chatgpt.site). The instructions below create a separate Vercel deployment connected to the existing GitHub repository.

## Vercel: import the existing repository

1. Sign in at [Vercel New Project](https://vercel.com/new) using GitHub. Import `zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells`. If it is missing, grant the Vercel GitHub integration access to this repository.
2. Set **Root Directory** to **`web`**. Use the project name `crispr-constellation` or another available name.
3. Confirm the settings below, then select **Deploy**.

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Next.js |
| Install Command | `npm ci` — supplied by `vercel.json` |
| Build Command | `npm run build -- --webpack` — supplied by `vercel.json` |
| Output Directory | Leave the framework default; Next.js detects `output: "export"` |
| Environment Variables | None required; leave `NEXT_PUBLIC_BASE_PATH` unset |
| Production Branch | `main` |

The configuration lives in [vercel.json](vercel.json). Root Directory is a Vercel project setting and must be selected during import; the Python repository root is not the frontend. The build uses the committed npm lockfile and Webpack, matching the locally verified production build.

The site serves saved results from `public/data/`. It does not run Python or train GEARS on Vercel. The deployment requires no raw dataset, weights, API keys, or secrets.

After Vercel reports a successful deployment, open the production address it assigns. Check the entry zoom, Explorer/Scientist switch, a saved pair, and the CSV download. Share the project's production domain rather than a temporary preview URL. In Project Settings, check deployment protection if visitors are asked to sign in.

Connected GitHub pushes to `main` create production deployments; pull requests receive preview deployments. Vercel handles this integration without a separate GitHub Actions workflow. See [Vercel's Git deployment guide](https://vercel.com/docs/git) and [build settings](https://vercel.com/docs/builds/configure-a-build).

## Verify the build locally

From the repository root:

```bash
cd web
npm ci
npm run typecheck
env -u NEXT_PUBLIC_BASE_PATH npm run build -- --webpack
npm run preview
```

Open `http://127.0.0.1:3017`. The build writes `web/out/`; that directory is generated and excluded from Git. See the [frontend README](README.md) for browser checks and repository-subpath hosting.

## Common import problems

| Symptom | Check |
| --- | --- |
| Python installs or missing `package.json` | Set Root Directory to `web` and redeploy. |
| Asset/data requests include the repository name | Remove `NEXT_PUBLIC_BASE_PATH` from Vercel environment settings and rebuild. |
| The scene cannot load | Try a WebGL-capable browser; the saved-pair controls remain an alternative. |
| Changes are absent | Confirm the production deployment's commit and branch in Vercel. |

Vercel account sign-in and GitHub integration authorization belong to the account owner. Do not commit tokens or paste them into project files. If using the Vercel CLI later, authenticate with `vercel login`; local `.vercel/` project state is ignored by Git.
