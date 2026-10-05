# CRISPR Perturbation Explorer

A static Next.js dashboard for the completed Norman 2019 CRISPR-activation experiment. Visitors can explore 20 saved test pairs, compare measured expression with additive and GEARS predictions, and download the results. Selecting genes reads saved outputs; it does not run a model.

The frontend uses Next.js, React, TypeScript, Tailwind CSS, Recharts, `react-force-graph-2d`, and accessible Radix controls. Experiment preparation and training remain in the parent project; see the [project README](../README.md) and [training audit](../AUDIT.md).

## Run locally

Use Node.js 20.9 or newer and npm. From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open the address printed by the development server, normally `http://127.0.0.1:3000`. The checked-in compact export is enough to run the dashboard; no Python environment, raw dataset, GPU, or model checkpoint is needed for viewing it.

## Build and preview

```bash
npm run typecheck
npm run build
npm run preview
```

`next.config.ts` sets `output: "export"`. A successful build writes deployable HTML, JavaScript, CSS, and public data to `out/`. The preview command serves those static files at `http://127.0.0.1:3017` by default. Use `PORT=3016 npm run preview` to match the browser tests' default port. Next.js server mode (`next start`) is incompatible with this export configuration.

You can also serve a root-path build explicitly for local preview or browser tests:

```bash
python3 -m http.server 3016 --bind 127.0.0.1 --directory out
```

Keep that terminal running and visit `http://127.0.0.1:3016`. Use an HTTP server rather than opening `out/index.html` directly, because the dashboard fetches its JSON data.

### Repository subpath versus root hosting

For GitHub Pages under this repository's name, set the path **at build time**:

```bash
NEXT_PUBLIC_BASE_PATH=/RISPR-perturbations-in-human-K562-leukemia-cells npm run build
```

The host must serve the contents of `out/` under that same repository subpath. Both Next.js assets and browser-facing data/download paths use the configured prefix. This command describes a deployment configuration; it does not publish a site or establish a live URL.

For hosting at a domain's root, leave the variable unset:

```bash
env -u NEXT_PUBLIC_BASE_PATH npm run build
```

Ensure a local `.env` file does not reintroduce a repository prefix. Changing the build-time path requires rebuilding. The simple local server above serves a root-path build; a prefixed build requires mounting its files beneath the matching subpath.

## Data source and scientific meaning

The displayed experiment trained the corrected GEARS runtime on **29,766 sampled outcome cells**, capped at 128 per original training label. Validation selected epoch 2 from seven completed epochs. On the same 20 held-out gene pairs:

| Model | Mean top-20 DE MSE ↓ |
| --- | ---: |
| Control | 0.538783 |
| Additive | **0.060234** |
| GEARS | 0.163833 |

GEARS had lower error than additive on **3 of 20 pairs**. This result supports the displayed comparison, rather than a general claim that either architecture is superior.

The biological experiment used **CRISPR activation in K562 cells**. Charts show condition-mean expression changes relative to the training-control mean, on the existing processed expression scale. Above/below zero means greater/lower expression than control. These values do not measure cell health, mutation damage, clinical effects, or synthetic lethality.

The split holds out whole pairs while keeping equivalent guide labels together, and tests new combinations of genes observed individually during training. The top 20 differentially expressed genes are outcome-derived evaluation lists, used for scoring rather than prediction features. Pair averages receive equal weight.

The additive baseline uses all 54,931 training single-gene/control observations; GEARS uses capped outcome observations. Its input control pool and reference mean still use all training controls. Different sample sizes, one seed, one split, a previously inspected test set, and dependent gene pairs limit interpretation. Bootstrap intervals are descriptive across these pairs, not biological-replicate uncertainty.

The constellation is an **evaluated pair map**. Its edges are saved test pairs; positions and distances are decorative and do not represent a regulatory network or UMAP. Unsupported combinations show an explicit no-result state.

## Regenerate or verify the export

From the repository root, using the project's Python environment:

```bash
python3 export_dashboard_data.py
python3 export_dashboard_data.py --check
```

The exporter reads the completed `results/gears_medium/` run plus saved split, DE genes, additive predictions, and reference means. These binary source artifacts are intentionally excluded from Git; regenerate them through the parent workflow before exporting on a fresh clone.

It writes:

- `web/public/data/results.json`: expression profiles, pair/summary errors, scope, and provenance.
- `web/public/data/pair-results.csv`: downloadable pair-level comparison.

The exporter checks split fingerprints, gene order, counts, and recomputed errors with absolute tolerance `1e-6`, and records the saved checkpoint-verification result. `--check` compares existing exports with those source artifacts without changing files. The web bundle contains only 20 evaluation genes for each test pair, not the full matrix, individual-cell records, or weights. Commit the compact JSON/CSV when publishing an updated experiment and rebuild `out/`.

## Schema version 1 and replacing data

The authoritative TypeScript contract is [src/lib/types.ts](src/lib/types.ts). The browser loader is [src/lib/data.ts](src/lib/data.ts).

| Field | Contract |
| --- | --- |
| `schemaVersion` | `1` |
| `dataStatus` | `"measured"` |
| `run` | Actual training/sample counts, seed, checkpoint, runtime variant, and split scope |
| `summary` | Pair-average control/additive/GEARS MSE, wins, total, mean improvement, descriptive bootstrap interval, and checkpoint verification |
| `nodes` | Unique perturbation-gene IDs and labels, covering each pair's two targets |
| `pairs` | The 20 evaluated pair records in the current export |
| `provenance` | Run/evaluation source paths, split SHA256, and training source hashes |

Each pair has a canonical sorted `id` such as `ETS2+MAPK1`, `genes: [geneA, geneB]`, its original `condition`, measured `cells`, `controlMse`, `additiveMse`, `gearsMse`, `improvement`, and 20 distinct `features`. A feature contains `geneId`, `geneName`, and numeric `control`, `observed`, `additive`, and `gears` values.

**Feature values are uncentered processed condition means.** The UI subtracts each feature's control value for plotting. Supplying already-centered values would subtract control twice. For each pair, MSE is the average squared prediction-minus-observed difference across its 20 features; `improvement = additiveMse − gearsMse`, so a positive value favors GEARS. Summary MSE averages pairs and `wins` counts positive improvements.

Use finite numeric values, real gene identifiers, consistent gene order, and matching provenance. The current exporter is intentionally tied to `gears_medium` and rejects pairs with multiple original labels unless an explicit alias policy is added. To present another run, adapt the exporter and provenance together, preserve version-1 semantics, then verify the regenerated files. Review the featured-pair links and Norman/K562 explanations in `Dashboard.tsx` when changing study or dataset. A compatible JSON shape alone does not validate scientific claims in the surrounding copy.

## Accessibility and browser checks

- Explorer and Scientist modes retain the selected pair and share the same underlying values.
- Use **Tab** to reach the saved-pair selector, mode switch, view controls, gene-selection buttons, results links, and gene-table disclosure; use **Enter/Space** on buttons. Native select controls support keyboard navigation.
- Open **Choose genes** for visible keyboard-accessible gene buttons, providing an alternative to the canvas. Select a saved pair directly through the dropdown or results table.
- Chart line patterns, labels, and the expandable 20-gene table complement colors. Errors and scope are also available as text.
- System **reduced motion** suppresses graph motion/smooth scrolling and decorative transitions. Expression/error charts have no animated data interpolation.
- Data-loading failures display a retry button; unsupported gene combinations have no fabricated prediction.

The Playwright configuration uses installed **Google Chrome** (`channel: "chrome"`) and an existing server; it does not automatically start one. After a root-path build, start the static server above, then run in another terminal from `web/`:

```bash
DASHBOARD_TEST_URL=http://127.0.0.1:3016 npm run test:e2e
```

If using the preview server's default port instead, set `DASHBOARD_TEST_URL=http://127.0.0.1:3017`. Install Google Chrome if it is unavailable. Tests cover actual summary values, selection/mode consistency, gene-table contents, unsupported pairs, mobile/reduced-motion layout, and failed-load recovery. They currently expect the saved medium experiment; update these scientific expectations deliberately when changing data. For a repository-subpath build, mount the preview at the matching prefix and include that trailing-slash path in `DASHBOARD_TEST_URL`; relative test navigation preserves it.
