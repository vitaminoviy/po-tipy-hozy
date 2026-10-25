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

## Reclaimed-room realism pass — 2026-10-25

Continues the existing `quiet-home-overgrown-review.blend` from `4cf0a95`.
New editable file: `quiet-home-reclaimed-review.blend`. It contains two cameras:

- `Quiet Home review A - room and warmth`: lower oblique composition.
- `Quiet Home review B - floor and history`: slightly higher, more frontal view.

PNG outputs `quiet-home-reclaimed-A.png` and `quiet-home-reclaimed-B.png` are both
1920×1080. Blender **5.2.3 LTS**, Cycles/OptiX, adaptive sampling up to 192 samples,
threshold 0.025 and denoising. Both show frame 1; no animation sequence was rendered.

Actual structural changes include three floor openings cut through 23 existing
boards, splintered edges, visible joists and a lower subfloor. Part of the table's
left corner and apron is absent; central bearers and a timber support retain a
continuous surface under the miniature. The original house receives restrained
paint wear, minor slate chips and slight joinery irregularity rather than collapse.

The room adds layered worn plaster, dampness, fine angular cracks, an adjoining
doorway and soft light on the left wall. 3,695 leaf instances use smoother veined,
translucent blades. Added understory growth, roots and filament moss replace
uniform decorative plants and polygonal moss lumps. Reference-game assets were
not imported or copied. The miniature retains a visibly stylized design.

The old fast box helper had inward face winding. The current pass repairs 353
inherited closed meshes, including the atmosphere boundary; its helper is also
corrected to prevent recurrence. Earlier saved blend files remain untouched.

```powershell
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b -t 8 --python scripts/blender/refine_reclaimed_room.py
& 'D:/SteamLibrary/steamapps/common/Blender/blender.exe' -b assets/menu/blender/quiet-home-reclaimed-review.blend --python scripts/blender/validate_reclaimed_review.py
```

`-- --preview` on the first command makes two half-size studies in artifacts while
saving the blend with full-resolution settings. Each run opens the unchanged
overgrown source, so refinements never accumulate on repeated runs. The `.blend1`
is a previous local study, retained as a backup.

`reclaimed-validation.json`: three downward floor probes clear; intact-floor
control hits; five probes under the miniature hit the table surface; all 1,822
closed meshes checked have nonnegative winding; atmosphere signed volume positive.
The cottage stays within x≈55–78% in both cameras. These are selected geometric
checks plus visual inspection of both PNGs, not an exhaustive collision sweep.
Artistic approval and later animation checks remain pending. Main is unchanged.
