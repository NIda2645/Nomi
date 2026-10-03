"""Deterministic offline retargeter for the Director asset batch.

Run through Blender, for example:
  blender -b --python scripts/director-assets/retarget_blender.py -- \
    --source /tmp/nomi-3dbox-assets-dl/universal_animation_librarystandard.zip \
    --source-kind ual --target src/assets/x-bot.glb \
    --output-dir src/assets/director/actions --format fbx

The source archive is read but never copied into the repository. Pose matrices
are converted from source-rest-relative deltas to target-rest-relative deltas;
copying source local quaternions directly is intentionally not used.
"""
import argparse
import json
import os
import shutil
import tempfile
import zipfile

import bpy
from mathutils import Matrix, Vector

SEMANTIC = {
    "hips": "Hips", "spine": "Spine", "chest": "Spine1", "neck": "Neck", "head": "Head",
    "leftShoulder": "LeftShoulder", "leftUpperArm": "LeftArm", "leftLowerArm": "LeftForeArm", "leftHand": "LeftHand",
    "rightShoulder": "RightShoulder", "rightUpperArm": "RightArm", "rightLowerArm": "RightForeArm", "rightHand": "RightHand",
    "leftUpperLeg": "LeftUpLeg", "leftLowerLeg": "LeftLeg", "leftFoot": "LeftFoot",
    "rightUpperLeg": "RightUpLeg", "rightLowerLeg": "RightLeg", "rightFoot": "RightFoot",
}
TARGET_PREFIX = "mixamorig:"
UAL_SOURCE = {
    "hips": "DEF-hips", "spine": "DEF-spine.001", "chest": "DEF-spine.002", "neck": "DEF-neck", "head": "DEF-head",
    "leftShoulder": "DEF-shoulder.L", "leftUpperArm": "DEF-upper_arm.L", "leftLowerArm": "DEF-forearm.L", "leftHand": "DEF-hand.L",
    "rightShoulder": "DEF-shoulder.R", "rightUpperArm": "DEF-upper_arm.R", "rightLowerArm": "DEF-forearm.R", "rightHand": "DEF-hand.R",
    "leftUpperLeg": "DEF-thigh.L", "leftLowerLeg": "DEF-shin.L", "leftFoot": "DEF-foot.L",
    "rightUpperLeg": "DEF-thigh.R", "rightLowerLeg": "DEF-shin.R", "rightFoot": "DEF-foot.R",
}
MIXAMO_SOURCE = {key: f"mixamorig:{value}" for key, value in {
    "hips": "Hips", "spine": "Spine", "chest": "Spine1", "neck": "Neck", "head": "Head",
    "leftShoulder": "LeftShoulder", "leftUpperArm": "LeftArm", "leftLowerArm": "LeftForeArm", "leftHand": "LeftHand",
    "rightShoulder": "RightShoulder", "rightUpperArm": "RightArm", "rightLowerArm": "RightForeArm", "rightHand": "RightHand",
    "leftUpperLeg": "LeftUpLeg", "leftLowerLeg": "LeftLeg", "leftFoot": "LeftFoot",
    "rightUpperLeg": "RightUpLeg", "rightLowerLeg": "RightLeg", "rightFoot": "RightFoot",
}.items()}

def parse_args():
    argv = os.sys.argv[os.sys.argv.index("--") + 1:] if "--" in os.sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-kind", choices=("ual", "historical"), required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--format", choices=("fbx", "glb"), required=True)
    parser.add_argument("--actions", default="")
    parser.add_argument("--manifest", default="")
    return parser.parse_args(argv)

def source_file(path):
    if not path.lower().endswith(".zip"):
        return path, None
    temp = tempfile.mkdtemp(prefix="nomi-director-retarget-")
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        candidates = [name for name in names if name.lower().endswith(".glb") and "godot" in name.lower()]
        if not candidates:
            candidates = [name for name in names if name.lower().endswith(".fbx") and "unity" in name.lower()]
        if not candidates:
            raise RuntimeError("registered archive contains no supported UAL GLB/FBX")
        name = sorted(candidates)[0]
        output = os.path.join(temp, os.path.basename(name))
        with archive.open(name) as src, open(output, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return output, temp

def import_source(path):
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError(f"no armature in {path}")
    return armatures[-1]

def rest_local(armature, bone):
    return bone.parent.matrix_local.inverted() @ bone.matrix_local if bone.parent else bone.matrix_local.copy()

def pose_local(pose_bone):
    return pose_bone.parent.matrix.inverted() @ pose_bone.matrix if pose_bone.parent else pose_bone.matrix.copy()

def clear_action(armature):
    if armature.animation_data:
        armature.animation_data.action = None

def map_bones(source, target, source_kind):
    source_names = UAL_SOURCE if source_kind == "ual" else MIXAMO_SOURCE
    pairs = []
    for semantic, target_suffix in SEMANTIC.items():
        source_name = source_names[semantic]
        target_name = TARGET_PREFIX + target_suffix
        if source_name not in source.pose.bones or target_name not in target.pose.bones:
            raise RuntimeError(f"missing mapped bone {semantic}: {source_name} -> {target_name}")
        pairs.append((semantic, target_name, source_name))
    return pairs

def apply_retarget_frame(source, target, pairs, frame):
    bpy.context.scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()
    for _semantic, target_name, source_name in pairs:
        source_bone = source.data.bones[source_name]
        source_pose = source.pose.bones[source_name]
        target_bone = target.data.bones[target_name]
        target_pose = target.pose.bones[target_name]
        delta = rest_local(source, source_bone).inverted() @ pose_local(source_pose)
        # Bone translations belong to the source rig's scale. Keep target bind
        # locations and transfer rotations; hips motion is normalized later by
        # the metric checker and must never make a target float.
        delta.translation = Vector((0.0, 0.0, 0.0))
        target_local = rest_local(target, target_bone) @ delta
        target_pose.matrix = target_pose.parent.matrix @ target_local if target_pose.parent else target_local
        target_pose.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()

def new_target_action(target, name):
    clear_action(target)
    action = bpy.data.actions.new(name)
    target.animation_data_create()
    target.animation_data.action = action
    return action

def bake_action(source, target, pairs, source_action, output_name):
    source.animation_data_create()
    source.animation_data.action = source_action
    target_action = new_target_action(target, output_name)
    start, end = source_action.frame_range
    for frame in range(int(round(start)), int(round(end)) + 1):
        apply_retarget_frame(source, target, pairs, frame)
        for _semantic, target_name, _source_name in pairs:
            pb = target.pose.bones[target_name]
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=target_name)
    return target_action

def select_target(target, target_objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in target_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target

def export_target(target, target_objects, path, output_format):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_target(target, target_objects)
    if output_format == "fbx":
        bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE"}, add_leaf_bones=False, bake_anim=False, axis_forward="-Z", axis_up="Y")
    else:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_animations=True, export_animation_mode="ACTIVE_ACTIONS", export_frame_range=True, export_nla_strips=False, export_def_bones=False, export_skins=True)

def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src_path, temp_dir = source_file(args.source)
    source = import_source(src_path)
    source_actions = {action.name: action for action in bpy.data.actions}
    objects_before_target = set(bpy.context.scene.objects)
    target = import_source(args.target)
    target_objects = [obj for obj in bpy.context.scene.objects if obj not in objects_before_target and (obj.type in {"ARMATURE", "MESH"})]
    clear_action(target)
    pairs = map_bones(source, target, args.source_kind)
    requested = [item for item in args.actions.split(",") if item] if args.actions else sorted(source_actions)
    outputs = []
    for source_name in requested:
        if source_name not in source_actions:
            raise RuntimeError(f"source action not found: {source_name}")
        output_name = source_name
        bake_action(source, target, pairs, source_actions[source_name], output_name)
        source.animation_data.action = None
        extension = ".fbx" if args.format == "fbx" else ".glb"
        output_path = os.path.join(args.output_dir, output_name + extension)
        export_target(target, target_objects, output_path, args.format)
        outputs.append({"sourceAction": source_name, "output": output_path, "frameRange": list(source_actions[source_name].frame_range), "mappedBones": [item[0] for item in pairs]})
        clear_action(target)
    manifest = {"source": os.path.abspath(args.source), "sourceKind": args.source_kind, "target": os.path.abspath(args.target), "format": args.format, "outputs": outputs}
    manifest_path = args.manifest or os.path.join(args.output_dir, "retarget-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)
    print(json.dumps(manifest, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
