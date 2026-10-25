# Quiet Home — Blender workshop review

Work stays on `codex/workshop-menu-scene`. The approved `main` menu is preserved.
No video or replacement game background is produced by this review task.

## Recovered state, 2026-10-25

- Original branch HEAD: `8092e03`; original Blender work was untracked.
- `quiet-home-workshop.blend` and `.blend1` are the recovered editable originals.
- Generator: `scripts/blender/create_menu_workshop.py`.
- `loop-check.json` belongs to the original scene, not the refined scene.
- Original draft and three test frames remain in `artifacts/menu/blender/`.
- Pending UI edits (`MenuBlenderBackground.tsx`, MainMenu import and CSS) were
  already present on arrival and were preserved in recovery commit `7ad9be9`.
  They reference an unfinished video/poster pipeline. This task does not integrate it.

## Single-frame refinement

`scripts/blender/refine_menu_workshop.py` opens the recovered `.blend`, reuses the
original modeling helpers, and improves that scene. It never overwrites the original.

```powershell
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b -t 8 --python scripts/blender/refine_menu_workshop.py
```

Optional `-- --preview` produces a half-size, 24-sample study. Default output is
one 1920×1080 PNG with 96 Cycles samples, denoising and OptiX when available.
The editable output is `quiet-home-workshop-review.blend`.

For the final reviewed light/botanical pass, run the two stages in order:

```powershell
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b -t 8 --python scripts/blender/refine_menu_workshop.py -- --preview
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b -t 8 --python scripts/blender/polish_menu_review.py
```

The second stage produces `workshop-review.png`, 1920×1080, 128 Cycles samples,
and saves the final light, dense foliage and subtle lens bloom in the review blend.
Always rerun the first stage before the second to start from its fresh intermediate.
`review-check.json` records slate clearance and the driver endpoint comparison;
matching driver values is not proof of a visually seamless rendered animation.

Roof substrate, slate, verge and gutters now derive from one geometric slope.
Slate overlaps intentionally between rows. Fine shader relief replaces oversized
plaster/wood bump. Added shutters, joinery, stone detailing, door panels, glazing,
curtain folds, irregular botanical shoots with midribs, flowers, measured plans,
brushes, chisels, a mallet and workbench drawer hardware. Dusk skyline is replaced
with distant hills. Cycles provides indirect light and contact shadows.

Only frame 1 is rendered. The original 240-frame / 24fps plant and lighting drivers
remain a starting point. Artistic approval, refined-scene loop validation, motion
amplitudes, camera motion and render budget must be reviewed before animation.
No full animation has been rendered in this task.
