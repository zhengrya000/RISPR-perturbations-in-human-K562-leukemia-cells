# Change notes

These entries describe the changes in the published commits. GitHub's file list shows the last commit that touched each file, so older titles remain beside unchanged files.

## Deployment setup — October 5, 2026

- Add version-controlled Vercel build settings for the frontend in `web/`.
- Document repository import, automatic deployments, and the static export.
- Collect the scientific and interface changes below with links to their commits.

## Centered camera entry

[`75b53c3`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/75b53c3) · Center the constellation and keep entry on one camera axis

- Center the intro constellation and keep the entry camera on the same axis, moving forward in Z.
- Reduce label crowding at narrower widths while retaining labels for selected, related, and hovered genes.

## Constellation and atmosphere motion

[`347de07`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/347de07) · Move intro constellation and pause atmosphere over the gene volume

- Move the connected intro constellation with the mouse; preserve its position through the entry zoom.
- Pause background parallax inside the gene constellation's 3D bounds and during orbit drags; resume outside.
- Add more moving DNA helices and brighten their strands.

## Persistent starfield

[`3fd48be`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/3fd48be) · Keep dense parallax stars visible across explorer modes

- Keep layered stars visible on the intro and main screen, with stronger mouse movement.
- Match intro and Explorer star colors; change the background palette in Scientist mode.

## Interactive DNA introduction

[`19600bf`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/19600bf) · Add interactive DNA intro and deepen the constellation scene

- Add decorative DNA helices, a DNA cursor, and mouse-responsive background motion.
- Brighten pair connections and increase the constellation's depth for orbiting.
- Revise the short introduction around predicting cellular responses with machine learning.

## Typography and scientific diagnostics

[`3cc1563`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/3cc1563) · Refine constellation intro and add purple Scientist diagnostics

- Use locally hosted Noto Serif JP and Space Mono fonts.
- Show the actual constellation at a distance on the intro; retain yellow Explorer accents and add a purple Scientist palette.
- Add derived RMSE, relative MSE comparison, signed residuals, and the largest gene-level errors.

## Smooth contextual views

[`9573e53`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/9573e53) · Add intro hub and smooth contextual constellation views

- Add a compact intro hub and short metric definitions.
- Transition pairs, methods, genes, and instructions within an unframed side area, with back navigation.
- Highlight compatible saved partners after selecting a gene; add faint grain and the project signature.

## Full-screen 3D explorer

[`a662101`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/a662101) · Rebuild explorer as a full-screen 3D constellation

- Replace the earlier layout with an orbitable 3D scene and camera entry.
- Keep pair selection, saved results, and keyboard alternatives available in the full-screen interface.

## Measured dashboard and data export

[`0140a0b`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/0140a0b662f0fc763fdc28197f3a73e05c0f483f) · Add measured CRISPR perturbation dashboard

- Add the Next.js dashboard, Explorer/Scientist controls, and measured results for 20 held-out pairs.
- Export compact expression profiles, model errors, provenance, and downloadable CSV from the completed experiment.
- Compare control, additive, and GEARS predictions; disclose unsupported combinations and evaluation limitations.
- Add static hosting configuration and browser checks.

## Audited experiment workflow

[`21c2b79`](https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells/commit/21c2b79) · Add audited GEARS workflow and sampled K562 experiment

- Add reproducible preparation, training, checkpoint verification, reporting, notebooks, and audit notes.
- Complete the sampled 29,766-cell GEARS run on Norman 2019 K562 **CRISPR activation** data.
- Evaluate 20 held-out combinations with alias-safe splits: additive mean top-20 DE MSE **0.060234**, GEARS **0.163833**; GEARS wins **3/20** pairs.

See [AUDIT.md](AUDIT.md) for runtime corrections and limitations, and [README.md](README.md) for the experiment commands.
