#!/usr/bin/env python3
"""Render reproducible source/target rows with a visible ground plane.

The target armature is the armature that owns the exported action.  The x-bot
mesh is attached to it only for inspection; no action is copied to another
armature (Blender 5.x action slots make that unsafe).
"""
import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BLENDER = "/opt/homebrew/bin/blender"

def render_row(entry, output):
    source = repr(str(Path(entry["source"]).resolve()))
    target_action = repr(str(Path(entry["targetAction"]).resolve()))
    action_name = repr(entry["action"])
    source_kind = repr(entry["sourceKind"])
    frame = float(entry.get("frame", 0))
    source_output = output.with_name(output.stem + "-source.png")
    target_output = output.with_name(output.stem + "-target.png")
    source_script = f'''import bpy, sys
from mathutils import Vector
sys.path.insert(0, {str(ROOT / "scripts/director-assets").__repr__()})
from retarget_blender import source_file, import_source
bpy.ops.wm.read_factory_settings(use_empty=True)
src_path, temp = source_file({source}); source = import_source(src_path)
actions = {{a.name:a for a in bpy.data.actions}}; source.animation_data_create(); source.animation_data.action = actions[{action_name}]
bpy.context.scene.frame_set(int(round({frame}))); bpy.context.view_layer.update()
bpy.ops.mesh.primitive_plane_add(size=12, location=(0,0,0)); plane=bpy.context.object
bpy.ops.object.camera_add(location=(0,-8,2.8)); cam=bpy.context.object; bpy.context.scene.camera=cam; cam.rotation_euler=(Vector((0,0,1.0))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=48
bpy.ops.object.light_add(type='AREA', location=(0,-3,6)); bpy.context.object.data.energy=1300; bpy.context.object.data.size=5
bpy.context.scene.render.engine='BLENDER_EEVEE'; bpy.context.scene.render.resolution_x=500; bpy.context.scene.render.resolution_y=520; bpy.context.scene.render.resolution_percentage=100; bpy.context.scene.render.filepath={repr(str(source_output))}; bpy.ops.render.render(write_still=True)
'''
    target_script = f'''import bpy, sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
before=set(bpy.context.scene.objects)
if {target_action}.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath={target_action}, use_anim=True)
else: bpy.ops.import_scene.gltf(filepath={target_action})
target=[o for o in bpy.context.scene.objects if o not in before and o.type=='ARMATURE'][-1]; action=target.animation_data.action
for obj in bpy.context.scene.objects:
    if obj not in before: obj.hide_render=False; obj.hide_viewport=False
target_start,target_end=action.frame_range; target_frame=target_start+({frame}-action.frame_range[0])*(target_end-target_start)/max(1e-6,action.frame_range[1]-action.frame_range[0]); bpy.context.scene.frame_set(int(round(target_frame))); bpy.context.view_layer.update()
if {target_action}.lower().endswith('.fbx'):
    before_mesh=set(bpy.context.scene.objects); bpy.ops.import_scene.gltf(filepath={str(ROOT / 'src/assets/x-bot.glb').__repr__()})
    base=[o for o in bpy.context.scene.objects if o not in before_mesh and o.type=='ARMATURE']
    for arm in base: arm.hide_render=True; arm.hide_viewport=True
    for obj in [o for o in bpy.context.scene.objects if o not in before_mesh and o.type=='MESH']:
        for mod in obj.modifiers:
            if mod.type=='ARMATURE': mod.object=target
bpy.ops.mesh.primitive_plane_add(size=12, location=(0,0,0)); plane=bpy.context.object
bpy.ops.object.camera_add(location=(0,-8,2.8)); cam=bpy.context.object; bpy.context.scene.camera=cam; cam.rotation_euler=(Vector((0,0,1.0))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=48
bpy.ops.object.light_add(type='AREA', location=(0,-3,6)); bpy.context.object.data.energy=1300; bpy.context.object.data.size=5
bpy.context.scene.render.engine='BLENDER_EEVEE'; bpy.context.scene.render.resolution_x=500; bpy.context.scene.render.resolution_y=520; bpy.context.scene.render.resolution_percentage=100; bpy.context.scene.render.filepath={repr(str(target_output))}; bpy.ops.render.render(write_still=True)
'''
    scripts = [source_script, target_script]
    outputs = [source_output, target_output]
    for script, row_output in zip(scripts, outputs):
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as handle:
            handle.write(script)
            script_path = handle.name
        try:
            completed = subprocess.run([BLENDER, "-b", "--python", script_path], check=False, text=True, capture_output=True)
            if completed.returncode != 0 or not row_output.exists():
                raise RuntimeError(completed.stdout[-4000:] + completed.stderr[-4000:])
        finally:
            os.unlink(script_path)
    left = Image.open(source_output).convert("RGB"); right = Image.open(target_output).convert("RGB")
    pair = Image.new("RGB", (left.width + right.width, max(left.height, right.height)))
    pair.paste(left, (0, 0)); pair.paste(right, (left.width, 0)); pair.save(output)
    return
    script = f'''import bpy, sys, math
from mathutils import Vector
sys.path.insert(0, {str(ROOT / "scripts/director-assets").__repr__()})
from retarget_blender import source_file, import_source
bpy.ops.wm.read_factory_settings(use_empty=True)
src_path, temp = source_file({source})
source = import_source(src_path)
source_actions = {{a.name:a for a in bpy.data.actions}}
source.animation_data_create(); source.animation_data.action = source_actions[{action_name}]
bpy.context.scene.frame_set(int(round({frame}))); bpy.context.view_layer.update()
before = set(bpy.context.scene.objects)
if {target_action}.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath={target_action}, use_anim=True)
else:
    bpy.ops.import_scene.gltf(filepath={target_action})
target_arms = [o for o in bpy.context.scene.objects if o not in before and o.type == 'ARMATURE']
target = target_arms[-1]; target_action_data = target.animation_data.action
target.animation_data_create(); target.animation_data.action = target_action_data
target_start, target_end = target_action_data.frame_range
target_frame = target_start + ({frame} - source_actions[{action_name}].frame_range[0]) * (target_end-target_start) / max(1e-6, source_actions[{action_name}].frame_range[1]-source_actions[{action_name}].frame_range[0])
bpy.context.scene.frame_set(int(round(target_frame))); bpy.context.view_layer.update()
# Add the x-bot mesh and bind its armature modifiers to the action-owning armature.
before_mesh = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath={str(ROOT / 'src/assets/x-bot.glb').__repr__()})
base_arms = [o for o in bpy.context.scene.objects if o not in before_mesh and o.type == 'ARMATURE']
for obj in base_arms: obj.hide_render = True; obj.hide_viewport = True
for obj in [o for o in bpy.context.scene.objects if o not in before_mesh and o.type == 'MESH']:
    for mod in obj.modifiers:
        if mod.type == 'ARMATURE': mod.object = target
    obj.location.x += 1.6
target.location.x += 1.6
for obj in bpy.context.scene.objects:
    if obj == source or (obj.type == 'MESH' and obj not in base_arms and obj.location.x < 0.5): obj.location.x -= 1.6
plane_mat=bpy.data.materials.new('ground'); plane_mat.diffuse_color=(0.18,0.2,0.23,1)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0,0,0)); plane=bpy.context.object; plane.data.materials.append(plane_mat)
bpy.ops.object.camera_add(location=(0,-8,2.8)); cam=bpy.context.object; bpy.context.scene.camera=cam
cam.rotation_euler=(Vector((0,0,1.05))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=48
bpy.ops.object.light_add(type='AREA', location=(0,-3,6)); bpy.context.object.data.energy=1300; bpy.context.object.data.size=5
bpy.context.scene.render.engine='BLENDER_EEVEE'; bpy.context.scene.render.resolution_x=1000; bpy.context.scene.render.resolution_y=520; bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.render.filepath={repr(str(output))}; bpy.ops.render.render(write_still=True)
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as handle:
        handle.write(script)
        script_path = handle.name
    try:
        completed = subprocess.run([BLENDER, "-b", "--python", script_path], check=False, text=True, capture_output=True)
        if completed.returncode != 0:
            raise RuntimeError(completed.stdout[-4000:] + completed.stderr[-4000:])
        if not output.exists():
            raise RuntimeError(f"Blender completed without writing {output}: {completed.stdout[-2000:]} {completed.stderr[-2000:]}")
    finally:
        os.unlink(script_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entries-json", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    entries = json.loads(Path(args.entries_json).read_text())
    temp = Path(tempfile.mkdtemp(prefix="nomi-director-contact-"))
    rows = []
    for index, entry in enumerate(entries):
        row = temp / f"{index:02d}.png"
        render_row(entry, row)
        rows.append(Image.open(row).convert("RGB"))
    width = max(image.width for image in rows); label_h = 44
    canvas = Image.new("RGB", (width, sum(image.height + label_h for image in rows)), (19, 22, 27))
    draw = ImageDraw.Draw(canvas); y = 0
    for entry, image in zip(entries, rows):
        draw.rectangle((0, y, width, y + label_h), fill=(30, 35, 42))
        draw.text((14, y + 12), f"{entry['id']}  |  t={entry.get('frame', 0):.2f}  |  left source / right Nomi mannequin", fill=(235, 240, 245))
        y += label_h; canvas.paste(image, (0, y)); y += image.height
    Path(args.output).parent.mkdir(parents=True, exist_ok=True); canvas.save(args.output)
    print(args.output)

if __name__ == "__main__": main()
