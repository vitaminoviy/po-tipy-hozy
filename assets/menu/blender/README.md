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

## Overgrown room — 2026-10-25

Current artistic review: `quiet-home-overgrown-review.png`, **1920×1080**,
Cycles / OptiX, 160 samples. Editable scene: `quiet-home-overgrown-review.blend`.
The `.blend1` beside it preserves the preceding light study.

This continues `quiet-home-workshop-review.blend`: 863 existing root objects,
including the cottage, its 312 roof tiles, joinery, window boxes and desk props,
are retained and transformed together onto a separate tilted table. Previous
masters and renders are untouched. The room is an original Quiet Home design;
the user's reference was used only for mood, with no imported pixels, characters,
scene assets, typography or recognizable props from the referenced game.

The new room has aged floorboards, exposed masonry and plaster, a damaged tall
window, a partly open table drawer, an abandoned chair, hanging ivy, floor ferns,
moss and creeping plants. A cool garden, natural window light and thin volumetric
air contrast with warm miniature windows. The left wall remains quiet for UI;
the cottage occupies approximately x=55–77% of the frame. No text is baked in.

```powershell
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b -t 8 --python scripts/blender/create_overgrown_menu.py
```

Optional `-- --preview` renders only a 960×540 / 32-sample study into
`artifacts/menu/blender/overgrown-preview.png`; the saved blend still has the final
1920×1080 / 160-sample settings. The script always starts from the existing review
master, so repeated runs do not accumulate additions. It renders frame 1 only.

Validation: PNG dimensions checked; final blend reopened successfully; 7,524
objects and 312 original roof tiles confirmed; cottage projection clears the
left 40%. No broad visible geometry faults found in the reviewed camera view.
Animation, light changes across a loop and all-camera geometry are unverified.
New plant roots are organized for future sway, not yet animated. Wait for artistic
approval before animation or integration. Main and game code remain unchanged.
