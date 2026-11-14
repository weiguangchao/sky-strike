"""Generate the editable WWII model library and the GLBs used by the game.
Run with Blender --background --factory-startup --python scripts/blender/build_models.py.
"""
import bpy
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'game/public/assets/models'
SOURCE = ROOT / 'assets/blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(1944)


def material(name, color, metallic=0.0, roughness=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    srgb = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5))
    rgb = tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    mat.diffuse_color = (*rgb, 1)
    return mat


OLIVE = material('olive-drab-paint', '#658736')
CAMO = material('dark-camouflage', '#253e25')
SAND = material('desert-ochre', '#c39a50')
SILVER = material('weathered-aluminium', '#b8cbd5', .35, .45)
NAVY = material('naval-blue-grey', '#245c84')
LIGHT = material('underside-grey', '#d0dcd8')
GLASS = material('cockpit-green-glass', '#047b9b', .4, .18)
BLACK = material('gunmetal', '#13232f', .4)
CREAM = material('squadron-ivory', '#fff1cb')
AMBER = material('warning-yellow', '#efb43a')
RED = material('enemy-identification', '#bd4139')
WOOD = material('carrier-deck', '#ac7a40')
GRASS = material('island-grass', '#538941')
ROCK = material('coastal-rock', '#54756b')
BEACH = material('coral-sand', '#e4ce8a')
TREE = material('palm-foliage', '#245b3b')
TRUNK = material('palm-trunk', '#827258')


def signal_material(name, color):
    """Export semantic colors as KHR_materials_unlit, not sunlit camouflage."""
    mat = material('signal_' + name, color)
    nodes = mat.node_tree.nodes
    linear = mat.diffuse_color[:]
    nodes.clear()
    rgb = nodes.new('ShaderNodeRGB')
    rgb.outputs['Color'].default_value = linear
    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(rgb.outputs['Color'], output.inputs['Surface'])
    return mat


SIGNAL_INK = signal_material('ink', '#071422')
SIGNAL_WHITE = signal_material('white', '#f4fffa')
SIGNAL_XP = signal_material('xp', '#35dfff')
SIGNAL_HEALTH = signal_material('health', '#38e68f')
SIGNAL_BOMB = signal_material('bomb', '#a38bff')
SIGNAL_RED = signal_material('danger', '#ff384b')
SIGNAL_PINK = signal_material('aimed', '#ff4d8b')
current = None
root = None


def own(obj, mat=None, parent=None):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    current.objects.link(obj)
    obj.parent = parent or root
    if mat:
        obj.data.materials.append(mat)
    return obj


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    current.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    return obj


def box(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    obj.scale = scale
    return obj


def sphere(name, location, scale, mat, segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=8, radius=1, location=location)
    obj = own(bpy.context.object, mat)
    obj.name = name
    obj.scale = scale
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def cylinder(name, location, radius, depth, mat, axis='Z', parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=location)
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    if axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    elif axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    return obj


def wing(name, points, height, thickness, mat):
    count = len(points)
    vertices = [(x, y, height) for x, y in points] + [(x, y, height-thickness) for x, y in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, count*2)))]
    faces += [(i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count)]
    return mesh(name, vertices, faces, mat)


def fuselage(name, sections, top, bottom=LIGHT):
    vertices = []
    for y, width, height, z in sections:
        for i in range(12):
            angle = i * math.tau / 12
            vertices.append((math.cos(angle)*width, y, z+math.sin(angle)*height))
    faces = [tuple(range(12))]
    for j in range(len(sections)-1):
        for i in range(12):
            faces.append((j*12+i, (j+1)*12+i, (j+1)*12+(i+1) % 12, j*12+(i+1) % 12))
    faces.append(tuple(reversed(range((len(sections)-1)*12, len(sections)*12))))
    obj = mesh(name, vertices, faces, top)
    obj.data.materials.append(bottom)
    for face in obj.data.polygons:
        if face.center.z < -.02:
            face.material_index = 1
        face.use_smooth = True
    return obj


def propeller(x, y, z, radius, index):
    rotor = bpy.data.objects.new(f'propeller_{index:02d}', None)
    current.objects.link(rotor)
    rotor.parent = root
    rotor.location = (x, y, z)
    for i in range(3):
        blade = box(f'blade_{index}_{i}', (0, 0, 0), (.045, .018, radius), BLACK, rotor)
        angle = i * math.tau / 3
        blade.location = (math.sin(angle)*radius*.47, 0, math.cos(angle)*radius*.47)
        blade.rotation_euler.y = angle
    sphere(f'spinner_{index}', (x, y+.035, z), (.065, .09, .065), AMBER)


def insignia(x, y, z, enemy=False):
    cylinder('roundel-outer', (x, y, z), .092, .008, CREAM)
    cylinder('roundel-center', (x, y, z+.006), .059, .009, RED if enemy else NAVY)
    cylinder('roundel-dot', (x, y, z+.012), .021, .01, CREAM)


def fighter(name, variant, enemy=False):
    paint = SAND if variant == 'dart' else NAVY if variant == 'swift' else OLIVE
    if enemy:
        paint = SAND if variant == 'scout' else RED if variant == 'dart' else NAVY
    twin = variant in ('turtle', 'gunship')
    fuselage('riveted-fuselage', [(-1.0,.025,.035,.03),(-.68,.07,.08,.04),(-.25,.13,.13,.045),(.2,.155,.16,.045),(.68,.13,.14,.02),(.92,.09,.1,.02),(1.02,.045,.06,.02)], paint)
    span = 1.28 if twin else 1.15 if variant == 'swift' else 1.22
    outline = [(-.13,.4),(-.62,.3),(-span,.08),(-span-.05,-.09),(-span,-.22),(-.8,-.28),(-.14,-.22),(.14,-.22),(.8,-.28),(span,-.22),(span+.05,-.09),(span,.08),(.62,.3),(.13,.4)]
    wing('elliptical-main-wing', outline, .015, .065, paint)
    wing('tailplane', [(-.05,-.62),(-.45,-.73),(-.46,-.85),(-.1,-.9),(.1,-.9),(.46,-.85),(.45,-.73),(.05,-.62)], .07, .035, paint)
    for side in [-1, 1]:
        wing('camouflage-panel', [(side*.22,.24),(side*.58,.2),(side*1.02,-.15),(side*.72,-.21),(side*.23,-.08)], .024, .004, CAMO)
        wing('aileron-panel', [(side*.7,-.22),(side*1.1,-.18),(side*1.14,-.12),(side*.72,-.16)], .027, .003, LIGHT if variant == 'turtle' else CAMO)
        insignia(side*.88, -.045, .04, enemy)
        cylinder('wing-cannon', (side*.39,.32,.025), .016, .28, BLACK, 'Y')
        box('exhaust-stack', (side*.135,.57,.065), (.035,.25,.035), BLACK)
        for i in range(3):
            box('tail-identification-stripe', (0, -.51-i*.07, .118-i*.009), (.14,.028,.008), CREAM)
    sphere('cockpit-canopy', (0,-.08,.18), (.099,.25,.105), GLASS)
    box('canopy-frame', (0,-.08,.264), (.014,.38,.013), CREAM)
    box('canopy-cross-frame', (0,-.03,.264), (.16,.012,.012), paint)
    fin = mesh('vertical-tail-fin', [(-.018,-.92,.05),(.018,-.92,.05),(-.018,-.8,.43),(.018,-.8,.43),(-.018,-.56,.12),(.018,-.56,.12)], [(0,2,4),(1,5,3),(0,1,3,2),(2,3,5,4),(4,5,1,0)], paint)
    if twin:
        for i, side in enumerate([-1, 1]):
            sphere('engine-nacelle', (side*.55,.23,-.01), (.14,.51,.13), paint)
            cylinder('engine-cowling', (side*.55,.65,-.01), .135,.15, BLACK,'Y')
            propeller(side*.55,.75,-.01,.37,i)
        if variant == 'turtle':
            for side in [-1,1]:
                box('twin-tail-boom', (side*.55,-.37,.01), (.085,1.35,.09), paint)
                wing('boom-tailplane', [(side*.55-.19,-.77),(side*.55+.19,-.77),(side*.55+.2,-.94),(side*.55-.2,-.94)], .09,.03,paint)
    else:
        cylinder('engine-cowling', (0,.83,.02), .134,.16, paint,'Y')
        propeller(0,1.04,.02,.36,0)
    if variant == 'dart':
        for side in [-1,1]:
            sphere('fixed-undercarriage-spat', (side*.49,.04,-.19), (.075,.2,.1), BLACK)


def bomber(final=False):
    paint = SILVER if final else OLIVE
    fuselage('bomber-fuselage', [(-1.25,.04,.06,.12),(-.8,.12,.14,.12),(-.1,.24,.23,.16),(.7,.23,.22,.16),(1.18,.17,.18,.13),(1.4,.04,.07,.1)], paint)
    wing('bomber-main-wing', [(-.2,.43),(-1.3,.23),(-2.1,-.08),(-2.14,-.3),(-.5,-.29),(.5,-.29),(2.14,-.3),(2.1,-.08),(1.3,.23),(.2,.43)], .07,.1,paint)
    wing('bomber-tailplane', [(-.1,-.77),(-.76,-.97),(-.8,-1.14),(.8,-1.14),(.76,-.97),(.1,-.77)], .2,.055,paint)
    sphere('glazed-bomber-nose', (0,1.18,.23), (.17,.22,.14), GLASS)
    sphere('bombardier-cockpit', (0,.6,.37), (.19,.3,.1), GLASS)
    box('cockpit-rib', (0,.6,.459), (.018,.48,.012), CREAM)
    engines = [-1.55,-.76,.76,1.55] if not final else [-1.7,-1.05,-.43,.43,1.05,1.7]
    for i,x in enumerate(engines):
        sphere('radial-engine-nacelle', (x,.2,.04), (.14,.44,.14), paint)
        cylinder('radial-engine-front', (x,.58,.04), .135,.14, BLACK,'Y')
        propeller(x,.7,.04,.34,i)
    for y in [-.4,.1]:
        sphere('defensive-turret', (0,y,.4), (.13,.13,.12), BLACK)
        for side in [-1,1]:
            cylinder('turret-gun', (side*.045,y+.16,.43), .014,.32,BLACK,'Y')
    for side in [-1,1]:
        insignia(side*1.85,-.13,.13,True)
        box('vertical-tail', (side*.35,-1.04,.35), (.035,.28,.35),paint)
        wing('recognition-band', [(side*.4,-.25),(side*1.8,-.27),(side*1.8,-.18),(side*.4,-.16)], .13,.006, RED)


def carrier():
    fuselage('carrier-hull', [(-3,.05,.12,.0),(-2.6,.5,.24,.0),(2.3,.5,.24,.0),(3,.13,.15,.0)],NAVY,NAVY)
    wing('wood-flight-deck', [(-.52,-2.85),(.52,-2.85),(.56,2.4),(.26,3.03),(-.32,2.98),(-.56,2.55)], .28,.13,WOOD)
    for x in [-.4,-.24,-.08,.08,.24,.4]:
        box('deck-plank', (x,.0,.285), (.009,5.5,.008),SAND)
    for y in [-2.5+i*.38 for i in range(14)]:
        box('runway-dash', (-.15,y,.296),(.035,.2,.008),CREAM)
    for y in [-1.8,-1.6,-1.4,-1.2]:
        box('arresting-wire',(-.12,y,.3),(.66,.014,.008),BLACK)
    for x in [-.49,.49]:
        box('deck-edge', (x,-.15,.3),(.025,5.1,.025),CREAM)
    box('island-superstructure',(.4,.5,.51),(.29,1.3,.42),NAVY)
    box('bridge',(.38,.7,.8),(.4,.52,.2),LIGHT)
    box('bridge-glass',(.38,.95,.83),(.32,.014,.07),GLASS)
    cylinder('mast',(.4,.5,1.08),.022,.55,BLACK)
    box('radar',(.4,.5,1.36),(.52,.04,.08),BLACK)
    for side in [-1,1]:
        for y in [-1.9,-.3,1.8]:
            box('anti-air-platform',(side*.58,y,.14),(.2,.28,.12),NAVY)
            cylinder('anti-air-gun',(side*.58,y+.08,.3),.018,.25,BLACK,'Y')
    for y in [-2.1,-.8,1.9]:
        wing('parked-fighter-wing',[(-.42,y-.1),(-.05,y-.1),(-.08,y+.02),(-.39,y+.02)],.32,.02,LIGHT)
        box('parked-fighter-body',(-.23,y,.35),(.04,.35,.04),OLIVE)


def island():
    rings=[]
    count=36
    radii=[1+random.uniform(-.18,.18) for _ in range(count)]
    vertices=[]
    for scale,z in [(1.06,-.02),(1,.03),(.87,.13),(.61,.36)]:
        for i in range(count):
            a=i*math.tau/count
            vertices.append((math.cos(a)*2*radii[i]*scale,math.sin(a)*4.5*radii[i]*scale,z+random.uniform(-.015,.015)))
    vertices.append((0,0,.6))
    faces=[]
    for ring in range(3):
        for i in range(count):
            a=ring*count+i;b=ring*count+(i+1)%count;c=(ring+1)*count+i;d=(ring+1)*count+(i+1)%count
            faces.extend([(a,b,c),(b,d,c)])
    faces.extend([(3*count+i,3*count+(i+1)%count,4*count) for i in range(count)])
    terrain=mesh('terraced-coral-island',vertices,faces,BEACH)
    terrain.data.materials.append(GRASS); terrain.data.materials.append(ROCK)
    for face in terrain.data.polygons:
        face.material_index = 0 if face.index < count*2 else 2 if random.random()<.15 else 1
    for i in range(35):
        x=random.uniform(-1.25,1.25); y=random.uniform(-3.4,3.4)
        if x*x/1.6+y*y/12>1: continue
        h=random.uniform(.32,.55)
        cylinder('palm-trunk',(x,y,.3+h/2),.025,h,TRUNK)
        for j in range(5):
            a=j*math.tau/5
            wing('palm-frond',[(x,y),(x+math.cos(a-.2)*.16,y+math.sin(a-.2)*.16),(x+math.cos(a)*.38,y+math.sin(a)*.38),(x+math.cos(a+.2)*.16,y+math.sin(a+.2)*.16)],.3+h,.01,TREE)
    for y in [-.7,-.15,.4]:
        box('airfield-hut',(.7,y,.45),(.38,.3,.28),SAND)
        wing('hut-roof',[(.48,y-.18),(.92,y-.18),(.92,y+.18),(.48,y+.18)],.6,.04,OLIVE)
    box('island-track',(.24,0,.44),(.09,3.7,.025),BEACH)


def pickup(kind):
    if kind == 'xp':
        box('ammo-case-shadow', (0,0,0), (1.02,1.02,.22), SIGNAL_INK)
        box('ammo-case-rim', (0,0,.12), (.94,.94,.04), SIGNAL_WHITE)
        box('ammo-case-cyan', (0,0,.15), (.79,.79,.05), SIGNAL_XP)
        wing('supply-chevron', [(-.26,-.18),(0,.08),(.26,-.18),(.26,.06),(0,.32),(-.26,.06)], .19,.01,SIGNAL_INK)
        for x in [-.52,.52]:
            box('case-handle',(x,0,-.02),(.08,.3,.09),SIGNAL_INK)
    elif kind == 'health':
        points = lambda r: [(math.cos(i*math.tau/8+math.pi/8)*r,math.sin(i*math.tau/8+math.pi/8)*r) for i in range(8)]
        wing('medical-octagon-shadow',points(.61),.1,.22,SIGNAL_INK)
        wing('medical-white-rim',points(.55),.13,.03,SIGNAL_WHITE)
        wing('medical-green-lid',points(.47),.17,.03,SIGNAL_HEALTH)
        box('medical-cross-horizontal',(0,0,.2),(.57,.17,.02),SIGNAL_INK)
        box('medical-cross-vertical',(0,0,.2),(.17,.57,.02),SIGNAL_INK)
    else:
        points = lambda r: [(0,r),(r,0),(0,-r),(-r,0)]
        # Clockwise diamonds need the reverse winding for a visible top surface.
        wing('ordnance-diamond-shadow',list(reversed(points(.67))),.1,.22,SIGNAL_INK)
        wing('ordnance-white-rim',list(reversed(points(.6))),.13,.03,SIGNAL_WHITE)
        wing('ordnance-violet-lid',list(reversed(points(.51))),.17,.03,SIGNAL_BOMB)
        cylinder('bomb-symbol',(0,-.06,.21),.17,.025,SIGNAL_INK)
        fuse=box('bomb-fuse',(.08,.15,.21),(.065,.19,.025),SIGNAL_INK)
        fuse.rotation_euler.z=-.45
        box('bomb-fuse-spark',(.14,.28,.21),(.065,.055,.025),SIGNAL_WHITE)


def enemy_bullet(aimed=False):
    if aimed:
        outer=[(0,.64),(-.49,0),(0,-.64),(.49,0)]
        inner=[(0,.51),(-.37,0),(0,-.51),(.37,0)]
        wing('aimed-shot-rim',outer,.025,.015,SIGNAL_WHITE)
        wing('aimed-shot-outline',[(x*.9,y*.9) for x,y in outer],.05,.08,SIGNAL_INK)
        wing('aimed-shot-core',inner,.1,.02,SIGNAL_PINK)
        box('aimed-shot-highlight',(0,.13,.13),(.055,.17,.015),SIGNAL_WHITE)
    else:
        sphere('round-shot-rim',(0,0,-.025),(.52,.52,.19),SIGNAL_WHITE)
        sphere('round-shot-outline',(0,0,0),(.475,.475,.19),SIGNAL_INK)
        sphere('round-shot-core',(0,0,.15),(.39,.39,.12),SIGNAL_RED)
        cylinder('round-shot-highlight',(-.12,.12,.275),.07,.01,SIGNAL_WHITE)


models=[]
builds=[('falcon',lambda:fighter('falcon','falcon')),('swift',lambda:fighter('swift','swift')),('turtle',lambda:fighter('turtle','turtle')),('scout',lambda:fighter('scout','scout',True)),('dart',lambda:fighter('dart','dart',True)),('gunship',lambda:fighter('gunship','gunship',True)),('boss',lambda:bomber(False)),('boss-final',lambda:bomber(True)),('carrier',carrier),('island',island),('pickup-xp',lambda:pickup('xp')),('pickup-health',lambda:pickup('health')),('pickup-bomb',lambda:pickup('bomb')),('enemy-round',lambda:enemy_bullet(False)),('enemy-aimed',lambda:enemy_bullet(True))]
for index,(name,build) in enumerate(builds):
    current=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(current)
    root=bpy.data.objects.new(name,None)
    current.objects.link(root)
    build()
    static=[obj for obj in current.objects if obj.type=='MESH' and obj.parent==root]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in static: obj.select_set(True)
    bpy.context.view_layer.objects.active=static[0]
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bpy.context.object.name=name+'-airframe' if name not in ('carrier','island') else name+'-structure'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in current.objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
    triangles=sum(len(obj.data.polygons) for obj in current.objects if obj.type=='MESH')
    models.append({'id':name,'file':name+'.glb','polygons':triangles,'bytes':(OUT/(name+'.glb')).stat().st_size})
    root.location=(index%5*7,index//5*12,0)

bpy.context.scene['game']='Sky Strike — WWII model library'
bpy.context.scene['coordinates']='Blender +Y nose, +Z up; glTF -Z nose, +Y up'
bpy.context.scene['regenerate']='npm run models:build'
bpy.context.scene['visual_signals']='Red/pink = dodge; cyan chevron = XP; green cross = repair; violet diamond = bombs'
bpy.context.scene.world.color=(.12,.18,.23)
bpy.context.scene.view_settings.view_transform='Standard'
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=None
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'sky-strike-ww2.blend'))
(OUT/'manifest.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'source':'assets/blender/sky-strike-ww2.blend','models':models},indent=2)+'\n')
print('SKY_MODELS_COMPLETE',json.dumps(models))
