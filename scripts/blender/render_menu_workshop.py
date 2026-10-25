"""Render/resume Blender menu loop sequentially. Invoke with saved blend open.
-- --start 1 --end 240; a present nonempty frame is retained for resume.
"""
import bpy,sys,time,json,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--start',type=int,default=1);parser.add_argument('--end',type=int,default=240)
a=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
s=bpy.context.scene
OUT=ROOT/'artifacts/menu/blender/frames';OUT.mkdir(parents=True,exist_ok=True)
s.render.resolution_percentage=100;s.eevee.taa_render_samples=32
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.render.use_persistent_data=True
# Verify actual animation drivers at both sides of the intended loop.
def sample(frame):
 s.frame_set(frame);bpy.context.view_layer.update()
 values=[]
 for o in s.objects:
  if o.animation_data:values.extend(v for row in o.matrix_world for v in row)
  if o.type=='LIGHT' and o.data.animation_data:values.append(o.data.energy)
 return values
first,last=sample(1),sample(241)
assert first and len(first)==len(last)
delta=max(abs(x-y) for x,y in zip(first,last));assert delta<.0001,delta
(ROOT/'assets/menu/blender/loop-check.json').write_text(json.dumps({'frames':240,'fps':24,'duration_seconds':10,'endpoint_max_delta':delta,'animated_values':len(first)},indent=2))
for frame in range(a.start,a.end+1):
 path=OUT/f'{frame:04}.png'
 if path.exists() and path.stat().st_size>10000:continue
 start=time.monotonic();s.frame_set(frame);s.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 print('MENU_FRAME',frame,round(time.monotonic()-start,2),flush=True)
print('MENU_RENDER_COMPLETE',a.start,a.end,flush=True)
