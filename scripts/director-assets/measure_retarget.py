"""Measure source playback against a real target clip in world joint space.

The direction check deliberately does not use rest-local deltas or the
conversion matrix. It only compares pose-evaluated child-joint vectors after
normalising each character by its current hip/root frame.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from retarget_blender import MIXAMO_SOURCE, SEMANTIC, TARGET_PREFIX, UAL_SOURCE, clear_action, import_source, source_file

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
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True); parser.add_argument("--source-kind", choices=("ual", "historical"), required=True)
    parser.add_argument("--target", required=True); parser.add_argument("--target-action", required=True); parser.add_argument("--actions", required=True); parser.add_argument("--output", required=True)
    return parser.parse_args(raw)

def world_point(armature, bone_name):
    return armature.matrix_world @ armature.pose.bones[bone_name].head

def direction(armature, parent_name, child_name):
    parent = armature.pose.bones[parent_name]
    if child_name == parent_name:
        return (armature.matrix_world @ parent.tail - armature.matrix_world @ parent.head).normalized()
    return (world_point(armature, child_name) - world_point(armature, parent_name)).normalized()

def root_frame(armature, mapping):
    hips = world_point(armature, mapping["hips"])
    up = (world_point(armature, mapping["head"]) - hips).normalized()
    side = (world_point(armature, mapping["leftUpperLeg"]) - hips).normalized()
    forward = side.cross(up).normalized()
    side = up.cross(forward).normalized()
    return Matrix(((side.x, forward.x, up.x), (side.y, forward.y, up.y), (side.z, forward.z, up.z)))

def source_mapping(kind):
    return UAL_SOURCE if kind == "ual" else MIXAMO_SOURCE

def import_target_action(path):
    before = set(bpy.context.scene.objects)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    imported = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "ARMATURE"]
    if not imported or not imported[-1].animation_data or not imported[-1].animation_data.action:
        raise RuntimeError(f"target action has no playable armature action: {path}")
    target = imported[-1]
    action = target.animation_data.action
    # Blender 5.x actions carry an ID slot.  Copying that action onto a second
    # armature can silently leave the second armature in its bind pose.  The
    # imported armature is therefore the measured target; it is the object that
    # actually owns and evaluates the exported action.
    for obj in imported:
        obj.hide_viewport = True; obj.hide_render = True
    target.hide_viewport = False; target.hide_render = False
    return target, action

def map_child(source_map, source_kind):
    child = dict(source_map); child.update(SOURCE_CHILD_UAL if source_kind == "ual" else SOURCE_CHILD_MIXAMO); return child

def scalar_height(armature, mapping, up, child_map):
    ground = min((world_point(armature, child_map.get(f"{side}Foot", mapping[side])).dot(up) for side in ("leftFoot", "rightFoot")), default=None)
    if ground is None: return None, None
    height = world_point(armature, mapping["head"]).dot(up) - ground
    return ground, height if height > 1e-6 else None

def clip_frame(action, source_frame, source_range):
    start, end = action.frame_range; src_start, src_end = source_range
    return start if abs(src_end - src_start) < 1e-6 else start + (source_frame - src_start) * (end - start) / (src_end - src_start)

def angle_degrees(a, b):
    if a.length < 1e-8 or b.length < 1e-8: return None
    return math.degrees(math.acos(max(-1.0, min(1.0, a.normalized().dot(b.normalized())))))

def plane_angle_degrees(vector, normal):
    """Angle between a vector and a plane, in degrees."""
    if vector.length < 1e-8 or normal.length < 1e-8:
        return None
    return math.degrees(math.asin(max(-1.0, min(1.0, abs(vector.normalized().dot(normal.normalized()))))))

def action_report(source, target, source_action, target_action, source_kind):
    source.animation_data_create(); source.animation_data.action = source_action; target.animation_data.action = target_action
    source_map = source_mapping(source_kind); target_map = {key: TARGET_PREFIX + value for key, value in SEMANTIC.items()}
    source_child = map_child(source_map, source_kind); target_child = {**target_map, **TARGET_CHILD}
    start, end = source_action.frame_range; frames = [start + (end - start) * index / 11.0 for index in range(12)]
    samples = []; contact_values = []; hip_values = []; source_contact_seen = False; source_standing_seen = False
    bpy.context.scene.frame_set(int(round(start))); bpy.context.view_layer.update()
    source_root0 = root_frame(source, source_map); target_frame0 = clip_frame(target_action, start, source_action.frame_range); bpy.context.scene.frame_set(int(round(target_frame0))); bpy.context.view_layer.update(); target_root0 = root_frame(target, target_map)
    source_up0 = Vector((source_root0[0][2], source_root0[1][2], source_root0[2][2])); target_up0 = Vector((target_root0[0][2], target_root0[1][2], target_root0[2][2]))
    source_ground0, source_height0 = scalar_height(source, source_map, source_up0, source_child); target_ground0, target_height0 = scalar_height(target, target_map, target_up0, target_child)
    for source_frame in frames:
        bpy.context.scene.frame_set(int(round(source_frame))); bpy.context.view_layer.update()
        target_frame = clip_frame(target_action, source_frame, source_action.frame_range); bpy.context.scene.frame_set(int(round(target_frame))); bpy.context.view_layer.update()
        try:
            source_root = root_frame(source, source_map); target_root = root_frame(target, target_map)
            source_up = source_up0; target_up = target_up0; source_ground = source_ground0; target_ground = target_ground0; source_height = source_height0; target_height = target_height0
            if source_ground is None or target_ground is None or source_height is None or target_height is None: raise ValueError("missing ground or height")
            errors = {}
            for semantic, child in CHILD.items():
                source_direction = source_root.transposed() @ direction(source, source_map[semantic], source_child[child])
                target_direction = target_root.transposed() @ direction(target, target_map[semantic], target_child[child])
                error = angle_degrees(source_direction, target_direction); errors[semantic] = round(error, 4) if error is not None else None
            for side in ("left", "right"):
                source_foot = (world_point(source, source_child[f"{side}Foot"]).dot(source_up) - source_ground) / source_height
                target_foot = (world_point(target, target_child[f"{side}Foot"]).dot(target_up) - target_ground) / target_height
                if source_foot < 0.06: source_contact_seen = True; contact_values.append(abs(target_foot) * 100.0)
            source_hip = (world_point(source, source_map["hips"]).dot(source_up) - source_ground) / source_height
            target_hip = (world_point(target, target_map["hips"]).dot(target_up) - target_ground) / target_height
            if source_hip > 0.55: source_standing_seen = True; hip_values.append(target_hip / source_hip if source_hip > 1e-8 else None)
            t_pose = False; down = Vector((0.0, 0.0, -1.0)); up_local = Vector((0.0, 0.0, 1.0))
            for side in ("left", "right"):
                source_arm = source_root.transposed() @ direction(source, source_map[f"{side}UpperArm"], source_child[f"{side}LowerArm"])
                target_arm = target_root.transposed() @ direction(target, target_map[f"{side}UpperArm"], target_child[f"{side}LowerArm"])
                source_down_angle = angle_degrees(source_arm, down); target_horizontal_angle = plane_angle_degrees(target_arm, up_local)
                if source_down_angle is None or target_horizontal_angle is None: raise ValueError("missing arm direction")
                if source_down_angle < 45.0 and target_horizontal_angle < 20.0: t_pose = True
            samples.append({"t": round(float(source_frame), 4), "boneAngleErrorDeg": errors, "sourceArmsDownTargetHorizontal": t_pose})
        except (KeyError, ValueError, ZeroDivisionError) as error:
            samples.append({"t": round(float(source_frame), 4), "boneAngleErrorDeg": {semantic: None for semantic in CHILD}, "sourceArmsDownTargetHorizontal": None})
    locomotion = source_action.name in ("Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Fwd_Loop", "run", "walk")
    contact_max = max(contact_values) if source_contact_seen and contact_values else None
    hip_ratio = min(value for value in hip_values if value is not None) if source_standing_seen and any(value is not None for value in hip_values) else None
    return {"id": source_action.name, "samples": samples, "requiresContact": locomotion, "contactMaxAbsCm": contact_max, "requiresStandingHip": source_standing_seen, "standingHipRatio": hip_ratio, "sourceArmsDownTargetHorizontal": any(sample["sourceArmsDownTargetHorizontal"] is True for sample in samples)}

def main():
    options = parse_args(); bpy.ops.wm.read_factory_settings(use_empty=True)
    source_path, _temp = source_file(options.source); source = import_source(source_path); source_actions = {action.name: action for action in bpy.data.actions}
    target, target_action = import_target_action(options.target_action)
    reports = [action_report(source, target, source_actions[name], target_action, options.source_kind) for name in options.actions.split(",")]
    result = {"source": os.path.abspath(options.source), "sourceKind": options.source_kind, "targetAction": os.path.abspath(options.target_action), "actions": reports}
    with open(options.output, "w", encoding="utf-8") as handle: json.dump(result, handle, indent=2); handle.write("\n")
    print(json.dumps(result, indent=2))

if __name__ == "__main__": main()
