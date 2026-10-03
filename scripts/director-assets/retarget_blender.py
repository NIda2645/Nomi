"""Deterministic offline retargeter for the Director asset batch.

Run through Blender, for example:
  blender -b --python scripts/director-assets/retarget_blender.py -- \
    --source /tmp/nomi-3dbox-assets-dl/universal_animation_librarystandard.zip \
    --source-kind ual --target src/assets/x-bot.glb \
    --output-dir src/assets/director/actions --format fbx

The source archive is read but never copied into the repository. Pose matrices
are solved from source playback world-space joint directions in the target's
current root frame; copying source local quaternions directly is reserved for
the intentional ``--disable-bind-correction`` red test.
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
CHILD = {
    "hips": "spine", "spine": "chest", "chest": "neck", "neck": "head", "head": "headTop",
    "leftShoulder": "leftUpperArm", "leftUpperArm": "leftLowerArm", "leftLowerArm": "leftHand", "leftHand": "leftIndex",
    "rightShoulder": "rightUpperArm", "rightUpperArm": "rightLowerArm", "rightLowerArm": "rightHand", "rightHand": "rightIndex",
    "leftUpperLeg": "leftLowerLeg", "leftLowerLeg": "leftFoot", "leftFoot": "leftToe",
    "rightUpperLeg": "rightLowerLeg", "rightLowerLeg": "rightFoot", "rightFoot": "rightToe",
}
SOURCE_CHILD_UAL = {"headTop": "DEF-head", "leftIndex": "DEF-f_index.01.L", "rightIndex": "DEF-f_index.01.R", "leftToe": "DEF-toe.L", "rightToe": "DEF-toe.R"}
SOURCE_CHILD_MIXAMO = {"headTop": "mixamorig:HeadTop_End", "leftIndex": "mixamorig:LeftHandIndex1", "rightIndex": "mixamorig:RightHandIndex1", "leftToe": "mixamorig:LeftToeBase", "rightToe": "mixamorig:RightToeBase"}
TARGET_CHILD = {"headTop": "mixamorig:HeadTop_End", "leftIndex": "mixamorig:LeftHandIndex1", "rightIndex": "mixamorig:RightHandIndex1", "leftToe": "mixamorig:LeftToeBase", "rightToe": "mixamorig:RightToeBase"}

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
    parser.add_argument("--disable-bind-correction", action="store_true")
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

def _world_point(armature, bone_name):
    return armature.matrix_world @ armature.pose.bones[bone_name].head

def _direction(armature, parent_name, child_name):
    parent = armature.pose.bones[parent_name]
    if child_name == parent_name:
        return (armature.matrix_world @ parent.tail - armature.matrix_world @ parent.head).normalized()
    return (_world_point(armature, child_name) - _world_point(armature, parent_name)).normalized()

def _root_frame(armature, mapping):
    hips = _world_point(armature, mapping["hips"])
    up = (_world_point(armature, mapping["head"]) - hips).normalized()
    side = (_world_point(armature, mapping["leftUpperLeg"]) - hips).normalized()
    forward = side.cross(up).normalized(); side = up.cross(forward).normalized()
    return Matrix(((side.x, forward.x, up.x), (side.y, forward.y, up.y), (side.z, forward.z, up.z)))

def apply_world_direction_frame(source, target, pairs, frame, source_kind):
    bpy.context.scene.frame_set(int(round(frame))); bpy.context.view_layer.update()
    source_map = UAL_SOURCE if source_kind == "ual" else MIXAMO_SOURCE
    source_child = {**source_map, **(SOURCE_CHILD_UAL if source_kind == "ual" else SOURCE_CHILD_MIXAMO)}
    target_map = {key: TARGET_PREFIX + value for key, value in SEMANTIC.items()}
    target_child = {**target_map, **TARGET_CHILD}
    # Start each sample from the target bind pose, then aim each mapped bone at
    # the source's current world direction in the target's root frame.  Reset
    # matrix_basis rather than assigning matrix_local in arbitrary bone order;
    # the latter leaves children in the previous parent's pose.
    for pose_bone in target.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    source_root = _root_frame(source, source_map); target_root = _root_frame(target, target_map)
    for semantic, _target_name, _source_name in pairs:
        source_dir = source_root.transposed() @ _direction(source, source_map[semantic], source_child[CHILD[semantic]])
        desired = (target_root.to_3x3() @ source_dir).normalized()
        target_name = target_map[semantic]; target_pose = target.pose.bones[target_name]
        current = _direction(target, target_name, target_child[CHILD[semantic]])
        rotation = current.rotation_difference(desired).to_matrix().to_4x4()
        # The target armature carries a non-unit object scale.  Apply the
        # correction in world space, then convert the result back to the
        # armature space expected by PoseBone.matrix; mixing local pivots with
        # world vectors rotates the child joint around the wrong point.
        armature_world = target.matrix_world.copy()
        armature_inverse = armature_world.inverted()
        pivot = armature_world @ target_pose.head
        pose_world = armature_world @ target_pose.matrix
        pose_world = Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-pivot) @ pose_world
        target_pose.rotation_mode = "QUATERNION"
        target_pose.matrix = armature_inverse @ pose_world
        bpy.context.view_layer.update()

def apply_retarget_frame(source, target, pairs, frame, bind_correction=True, source_kind="ual"):
    if bind_correction:
        apply_world_direction_frame(source, target, pairs, frame, source_kind)
        return
    bpy.context.scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()
    for _semantic, target_name, source_name in pairs:
        source_bone = source.data.bones[source_name]
        source_pose = source.pose.bones[source_name]
        target_bone = target.data.bones[target_name]
        target_pose = target.pose.bones[target_name]
        delta = rest_local(source, source_bone).inverted() @ pose_local(source_pose) if bind_correction else pose_local(source_pose)
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

def bake_action(source, target, pairs, source_action, output_name, bind_correction=True, source_kind="ual"):
    source.animation_data_create()
    source.animation_data.action = source_action
    target_action = new_target_action(target, output_name)
    start, end = source_action.frame_range
    for frame in range(int(round(start)), int(round(end)) + 1):
        apply_retarget_frame(source, target, pairs, frame, bind_correction=bind_correction, source_kind=source_kind)
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
        active = target.animation_data.action if target.animation_data else None
        if active:
            bpy.context.scene.frame_start = int(round(active.frame_range[0])); bpy.context.scene.frame_end = int(round(active.frame_range[1]))
        bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE"}, add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, bake_anim_step=1.0, bake_anim_simplify_factor=0.0, axis_forward="-Z", axis_up="Y")
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
        bake_action(source, target, pairs, source_actions[source_name], output_name, bind_correction=not args.disable_bind_correction, source_kind=args.source_kind)
        source.animation_data.action = None
        extension = ".fbx" if args.format == "fbx" else ".glb"
        output_path = os.path.join(args.output_dir, output_name + extension)
        export_target(target, target_objects, output_path, args.format)
        outputs.append({"sourceAction": source_name, "output": output_path, "frameRange": list(source_actions[source_name].frame_range), "mappedBones": [item[0] for item in pairs]})
        clear_action(target)
    manifest = {"source": os.path.abspath(args.source), "sourceKind": args.source_kind, "target": os.path.abspath(args.target), "format": args.format, "bindCorrection": not args.disable_bind_correction, "outputs": outputs}
    manifest_path = args.manifest or os.path.join(args.output_dir, "retarget-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)
    print(json.dumps(manifest, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
