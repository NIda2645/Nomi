#!/usr/bin/env python3
"""Render the ten MIT StoryAI semantic poses against a ground plane."""
import json, math, os, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
POSES = {
 'lean': {'Spine':(0,0,-10),'Head':(0,0,6),'LeftUpLeg':(0,-8,0),'RightUpLeg':(0,8,0)},
 'bow': {'Spine':(-46,0,0),'Spine1':(-10,0,0),'Head':(20,0,0),'LeftUpLeg':(49,0,0),'RightUpLeg':(49,0,0),'LeftArm':(5,-10,0),'RightArm':(5,10,0)},
 'think': {'Head':(15,0,0),'LeftArm':(8,40,0),'RightArm':(8,-40,0),'LeftForeArm':(90,0,0),'RightForeArm':(90,0,0),'RightHand':(15,0,-10)},
 'fight': {'Spine':(5,0,-10),'Spine1':(0,8,0),'Head':(0,8,0),'LeftArm':(48,-16,22),'RightArm':(30,0,-22),'LeftForeArm':(86,0,0),'RightForeArm':(84,0,0),'LeftUpLeg':(4,-18,0),'RightUpLeg':(-6,22,0)},
 'kick': {'LeftUpLeg':(-8,0,0),'RightUpLeg':(58,0,0),'RightLeg':(35,0,0),'LeftArm':(18,0,0),'RightArm':(-24,0,0)},
 'throw': {'Spine':(5,14,0),'Spine1':(0,-10,0),'Head':(0,8,0),'RightArm':(76,-14,28),'RightForeArm':(86,0,0),'LeftArm':(34,10,8),'LeftForeArm':(54,0,0),'LeftUpLeg':(24,-12,0),'RightUpLeg':(-10,18,0)},
 'push': {'Spine':(5,38,0),'Spine1':(-4,0,0),'Head':(6,0,0),'LeftArm':(92,-11,6),'RightArm':(92,11,-6),'LeftForeArm':(6,0,0),'RightForeArm':(6,0,0),'LeftUpLeg':(38,-12,0),'RightUpLeg':(-20,14,0)},
 'reach': {'RightArm':(50,0,0),'RightForeArm':(12,0,0)},
 'cross-arms': {'LeftArm':(50,-55,75),'LeftForeArm':(50,0,0),'RightArm':(90,55,-45),'RightForeArm':(50,0,0)},
 'phone': {'Head':(18,0,0),'RightArm':(20,-4,-30),'RightForeArm':(82,0,0),'RightHand':(14,0,60),'LeftArm':(-10,8,0),'LeftForeArm':(16,0,0)},
}

def render_one(name, rotations, out, metric_path):
    script=f'''import bpy, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath={str(ROOT/'src/assets/x-bot.glb').__repr__()})
arm=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'][-1]
for bone,deg in {rotations!r}.items():
    pb=arm.pose.bones.get('mixamorig:'+bone)
    if pb: pb.rotation_mode='XYZ'; pb.rotation_euler=tuple(math.radians(v) for v in deg)
bpy.context.view_layer.update()
def pt(n): return arm.matrix_world @ arm.pose.bones[n].head
def ja(a,b,c):
    x=(pt(a)-pt(b)).normalized(); y=(pt(c)-pt(b)).normalized()
    return math.degrees(math.acos(max(-1,min(1,x.dot(y)))))
metrics={{'leftElbowDeg':ja('mixamorig:LeftArm','mixamorig:LeftForeArm','mixamorig:LeftHand'),'rightElbowDeg':ja('mixamorig:RightArm','mixamorig:RightForeArm','mixamorig:RightHand'),'leftKneeDeg':ja('mixamorig:LeftUpLeg','mixamorig:LeftLeg','mixamorig:LeftFoot'),'rightKneeDeg':ja('mixamorig:RightUpLeg','mixamorig:RightLeg','mixamorig:RightFoot')}}
import json; json.dump(metrics,open({str(metric_path).__repr__()},'w'))
bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,0)); bpy.ops.object.camera_add(location=(0,-7,2.6)); cam=bpy.context.object; bpy.context.scene.camera=cam; cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler(); bpy.ops.object.light_add(type='AREA',location=(0,-3,6)); bpy.context.object.data.energy=1200; bpy.context.scene.render.engine='BLENDER_EEVEE'; bpy.context.scene.render.resolution_x=400; bpy.context.scene.render.resolution_y=450; bpy.context.scene.render.resolution_percentage=100; bpy.context.scene.render.filepath={str(out).__repr__()}; bpy.ops.render.render(write_still=True)
'''
    with tempfile.NamedTemporaryFile('w',suffix='.py',delete=False) as f: f.write(script); p=f.name
    try: subprocess.run(['/opt/homebrew/bin/blender','-b','--python',p],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    finally: os.unlink(p)

def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();td=Path(tempfile.mkdtemp(prefix='nomi-static-'));imgs=[]
    metrics={}
    for name,rot in POSES.items():
        p=td/(name+'.png'); mp=td/(name+'.json'); render_one(name,rot,p,mp); imgs.append((name,Image.open(p).convert('RGB'))); metrics[name]=json.loads(mp.read_text())
    w=max(im.width for _,im in imgs);h=sum(im.height+34 for _,im in imgs);canvas=Image.new('RGB',(w,h),(20,24,29));d=ImageDraw.Draw(canvas);y=0
    for name,im in imgs:d.rectangle((0,y,w,y+34),fill=(35,40,48));d.text((10,y+10),f'{name}  | MIT StoryAI preset | ground',fill='white');y+=34;canvas.paste(im,(0,y));y+=im.height
    checks={name: all(0.0 <= value <= 180.0 for value in values.values()) for name,values in metrics.items()}
    Path(a.output).parent.mkdir(parents=True,exist_ok=True);canvas.save(a.output); Path(a.output).with_suffix('.json').write_text(json.dumps({'poses':metrics,'rangeDeg':[0,180],'passByPose':checks,'pass':all(checks.values())},indent=2)+'\n'); print(a.output)
if __name__=='__main__':main()
