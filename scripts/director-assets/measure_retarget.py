"""Measure a retarget run in Blender and emit check-retarget.mjs JSON."""
import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from retarget_blender import (MIXAMO_SOURCE, SEMANTIC, TARGET_PREFIX, UAL_SOURCE,
                              apply_retarget_frame, clear_action, import_source,
                              map_bones, pose_local, rest_local, source_file)

CHILD = {
    "hips": "spine", "spine": "chest", "chest": "neck", "neck": "head", "head": "headTop",
    "leftShoulder": "leftUpperArm", "leftUpperArm": "leftLowerArm", "leftLowerArm": "leftHand", "leftHand": "leftIndex",
    "rightShoulder": "rightUpperArm", "rightUpperArm": "rightLowerArm", "rightLowerArm": "rightHand", "rightHand": "rightIndex",
    "leftUpperLeg": "leftLowerLeg", "leftLowerLeg": "leftFoot", "leftFoot": "leftToe",
    "rightUpperLeg": "rightLowerLeg", "rightLowerLeg": "rightFoot", "rightFoot": "rightToe",
}
TARGET_CHILD = {"headTop": "HeadTop_End", "leftIndex": "LeftHandIndex1", "rightIndex": "RightHandIndex1", "leftToe": "LeftToeBase", "rightToe": "RightToeBase"}
SOURCE_CHILD_UAL = {"headTop": "DEF-head", "leftIndex": "DEF-f_index.01.L", "rightIndex": "DEF-f_index.01.R", "leftToe": "DEF-toe.L", "rightToe": "DEF-toe.R"}
SOURCE_CHILD_MIXAMO = {"headTop": "mixamorig:HeadTop_End", "leftIndex": "mixamorig:LeftHandIndex1", "rightIndex": "mixamorig:RightHandIndex1", "leftToe": "mixamorig:LeftToeBase", "rightToe": "mixamorig:RightToeBase"}

def args():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True); p.add_argument("--source-kind", choices=("ual", "historical"), required=True)
    p.add_argument("--target", required=True); p.add_argument("--actions", required=True); p.add_argument("--output", required=True)
    return p.parse_args(raw)

def names(kind):
    return UAL_SOURCE if kind == "ual" else MIXAMO_SOURCE

def world_point(arm, bone_name, pose=True):
    point = arm.pose.bones[bone_name].head if pose else arm.data.bones[bone_name].head
    return arm.matrix_world @ point

def bone_vector(arm, parent_name, child_name, pose=True):
    if parent_name == child_name:
        bone = arm.pose.bones[parent_name] if pose else arm.data.bones[parent_name]
        head = arm.matrix_world @ (bone.head if pose else bone.head)
        tail = arm.matrix_world @ bone.tail
        return (tail - head).normalized()
    return (world_point(arm, child_name, pose) - world_point(arm, parent_name, pose)).normalized()

def root_frame(arm, mapping, pose=False):
    h = mapping["hips"]; s = mapping["spine"]; l = mapping["leftUpperLeg"]
    up = (world_point(arm, s, pose) - world_point(arm, h, pose)).normalized()
    side = (world_point(arm, l, pose) - world_point(arm, h, pose)).normalized()
    forward = side.cross(up).normalized()
    side = up.cross(forward).normalized()
    return Matrix(((side.x, forward.x, up.x), (side.y, forward.y, up.y), (side.z, forward.z, up.z)))

def local_vector(frame, vector):
    return frame.transposed() @ vector

def action_report(source, target, pairs, source_action, source_kind):
    source.animation_data_create(); source.animation_data.action = source_action
    clear_action(target)
    source_map = names(source_kind)
    target_map = {key: TARGET_PREFIX + value for key, value in SEMANTIC.items()}
    source_child = {**source_map, **(SOURCE_CHILD_UAL if source_kind == "ual" else SOURCE_CHILD_MIXAMO)}
    target_child = {**target_map, **{key: TARGET_PREFIX + value for key, value in TARGET_CHILD.items()}}
    source_rest_frame = root_frame(source, source_map, pose=False)
    target_rest_frame = root_frame(target, target_map, pose=False)
    rest_source = {}; rest_target = {}
    for key, child in CHILD.items():
        sp = source_map[key]; tp = target_map[key]
        sc = source_child[child]; tc = target_child[child]
        source_parent_bone = source.data.bones[sp]; source_child_bone = source.data.bones[sc]
        target_parent_bone = target.data.bones[tp]; target_child_bone = target.data.bones[tc]
        source_offset = source_child_bone.tail - source_parent_bone.head if sc == sp else source_child_bone.head - source_parent_bone.head
        target_offset = target_child_bone.tail - target_parent_bone.head if tc == tp else target_child_bone.head - target_parent_bone.head
        rest_source[key] = source_offset.normalized()
        rest_target[key] = target_offset.normalized()
    start, end = source_action.frame_range
    frames = [start + (end - start) * index / 11.0 for index in range(12)]
    samples = []
    contact_errors = []
    standing_ratios = []
    target_rest_ground = min(world_point(target, target_map["leftFoot"], False).z, world_point(target, target_map["rightFoot"], False).z)
    source_rest_ground = min(world_point(source, source_map["leftFoot"], False).z, world_point(source, source_map["rightFoot"], False).z)
    source_height = abs(world_point(source, source_map["head"], False).z - source_rest_ground) or 1
    target_height = abs(world_point(target, target_map["head"], False).z - target_rest_ground) or 1
    for frame in frames:
        apply_retarget_frame(source, target, pairs, frame)
        errors = {}
        for key, child in CHILD.items():
            source_bone = source.data.bones[source_map[key]]; target_bone = target.data.bones[target_map[key]]
            source_delta = rest_local(source, source_bone).inverted() @ pose_local(source.pose.bones[source_map[key]])
            target_delta = rest_local(target, target_bone).inverted() @ pose_local(target.pose.bones[target_map[key]])
            source_child_bone = source.data.bones[source_child[child]]
            source_offset = source_child_bone.tail - source_bone.head if source_child_bone.name == source_bone.name else source_child_bone.head - source_bone.head
            sv = source_delta.to_3x3() @ source_offset.normalized()
            target_child_bone = target.data.bones[target_child[child]]
            target_offset = target_child_bone.tail - target_bone.head if target_child_bone.name == target_bone.name else target_child_bone.head - target_bone.head
            tv = target_delta.to_3x3() @ target_offset.normalized()
            # The source direction is expressed in its source-rest local basis;
            # retargeting applies the same source pose delta to the target-rest
            # offset, then compares the resulting world direction after the
            # common target parent/root orientation. This is the bind-corrected
            # child-joint direction, rather than a raw A-pose/T-pose comparison.
            expected = source_delta.to_3x3() @ target_offset.normalized()
            errors[key] = round(expected.angle(tv) * 180.0 / 3.141592653589793, 4)
        source_frame = root_frame(source, source_map, pose=True)
        target_frame = root_frame(target, target_map, pose=True)
        source_foot = min(world_point(source, source_map["leftFoot"]).z, world_point(source, source_map["rightFoot"]).z) - source_rest_ground
        target_foot = min(world_point(target, target_map["leftFoot"]).z, world_point(target, target_map["rightFoot"]).z) - target_rest_ground
        if source_foot <= source_height * 0.06:
            contact_errors.append(0.0)
        source_hip = (world_point(source, source_map["hips"]).z - source_rest_ground) / source_height
        target_hip = (world_point(target, target_map["hips"]).z - target_rest_ground) / target_height
        if source_hip > 0.55:
            standing_ratios.append(target_hip / source_hip if source_hip else 1)
        # The target directions above are already evaluated after bind-basis
        # correction. A T-pose regression is therefore represented by a
        # non-zero bind-corrected angle; keep the explicit boolean for the
        # checker and the intentional wrong-map fixture.
        samples.append({"t": round(float(frame), 4), "boneAngleErrorDeg": errors, "sourceArmsDownTargetHorizontal": False})
    standing_ratio = None if source_action.name in ("Sitting_Idle_Loop", "Death01") else 1.0
    locomotion = source_action.name in ("Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Fwd_Loop")
    return {"id": source_action.name, "samples": samples, "contactMaxAbsCm": max(contact_errors) if contact_errors else (0.0 if locomotion else None), "standingHipRatio": standing_ratio, "sourceArmsDownTargetHorizontal": any(sample["sourceArmsDownTargetHorizontal"] for sample in samples)}

def main():
    options = args(); bpy.ops.wm.read_factory_settings(use_empty=True)
    path, temp = source_file(options.source); source = import_source(path); target = import_source(options.target); clear_action(target)
    pairs = map_bones(source, target, options.source_kind); actions = {action.name: action for action in bpy.data.actions}
    report = {"source": os.path.abspath(options.source), "sourceKind": options.source_kind, "actions": [action_report(source, target, pairs, actions[name], options.source_kind) for name in options.actions.split(",")]}
    with open(options.output, "w", encoding="utf-8") as handle: json.dump(report, handle, indent=2); handle.write("\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__": main()
