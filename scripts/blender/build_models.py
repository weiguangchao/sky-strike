"""Generate the editable WWII model library and the GLBs used by the game.
Run with Blender --background --factory-startup --python scripts/blender/build_models.py.
"""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'game/public/assets/models'
SOURCE = ROOT / 'assets/blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
HISTORICAL_FLEET = json.loads((SOURCE/'historical-fleet.json').read_text())['ships']
HISTORICAL_BY_ID = {entry['id']:entry for entry in HISTORICAL_FLEET}
HISTORICAL_DEFAULTS = {entry['modelId']:entry for entry in HISTORICAL_FLEET if not entry['modelId'].startswith('historic-')}
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
    warship('carrier')


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


def group(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    current.objects.link(obj)
    obj.parent = root
    obj.location = location
    if name.startswith('part_'): obj['game_part'] = name[5:]
    if name.startswith('ruin_'): obj['game_ruin'] = name[5:]
    return obj


def naval_aircraft(kind):
    paint = SAND if kind == 'diver' else NAVY if kind == 'torpedo' else OLIVE
    length = 1.32 if kind == 'torpedo' else 1.03
    fuselage('naval-fuselage', [(-length,.025,.04,0),(-.65,.09,.11,0),(.05,.16,.17,.03),(.65,.14,.15,.02),(1,.09,.11,.02)],paint)
    if kind == 'interceptor':
        outline=[(-.15,.36),(-1.45,.22),(-1.45,-.15),(-.18,-.18),(.18,-.18),(1.45,-.15),(1.45,.22),(.15,.36)]
    elif kind == 'diver':
        outline=[(-.12,.32),(-.45,.12),(-1.32,.28),(-1.42,-.02),(-.48,-.28),(-.12,-.12),(.12,-.12),(.48,-.28),(1.42,-.02),(1.32,.28),(.45,.12),(.12,.32)]
    else:
        outline=[(-.12,.38),(-1.38,.13),(-1.44,-.25),(-.18,-.2),(.18,-.2),(1.44,-.25),(1.38,.13),(.12,.38)]
    wing('recognition-wing',outline,.025,.075,paint)
    wing('wide-tailplane',[(-.06,-length+.26),(-.55,-length+.15),(-.56,-length),(.56,-length),(.55,-length+.15),(.06,-length+.26)],.09,.045,paint)
    box('tail-fin',(0,-length+.18,.23),(.035,.3,.36),paint)
    sphere('long-canopy',(0,-.15,.2),(.105,.38 if kind=='torpedo' else .23,.1),GLASS)
    for y in [-.35,-.12,.1]:
        box('canopy-rib',(0,y,.28),(.17,.016,.025),CREAM)
    cylinder('radial-cowling',(0,.89,.02),.16,.18,BLACK,'Y')
    propeller(0,1.05,.02,.4,0)
    for side in [-1,1]:
        insignia(side*1.04,-.015,.08,True)
        box('wing-recognition-band',(side*.72,-.025,.08),(.08,.32,.012),CREAM)
        cylinder('wing-gun',(side*.43,.31,.05),.018,.3,BLACK,'Y')
    if kind == 'diver':
        for side in [-1,1]:
            box('fixed-wheel-strut',(side*.52,.02,-.16),(.055,.08,.28),BLACK)
            sphere('wheel-spat',(side*.52,.07,-.29),(.085,.23,.12),BLACK)
            box('dive-brake',(side*.93,-.14,-.05),(.5,.06,.1),SAND)
    if kind == 'torpedo':
        cylinder('belly-torpedo',(0,-.08,-.22),.075,1.35,BLACK,'Y')
        sphere('torpedo-warhead',(0,.6,-.22),(.075,.12,.075),SILVER)
        box('torpedo-fin',(0,-.72,-.22),(.3,.16,.025),BLACK)


def turret(name, x, y, z, triple=False):
    global root
    previous = root
    mount = group(name,(x,y,z))
    root = mount
    cylinder('turret-ring',(0,0,0),.18 if triple else .12,.09,BLACK)
    box('armored-turret',(0,0,.08),(.43 if triple else .24,.34,.17),OLIVE if triple else SILVER)
    for offset in [-.12,0,.12] if triple else [-.045,.045]:
        cylinder('gun-barrel',(offset,.36,.14),.027 if triple else .018,.58 if triple else .37,BLACK,'Y')
    root = previous


# Fleet colors are intentionally darker than aircraft markings under the game sun.
FLEET_HULL = material('fleet_hull', '#304b54', .15, .82)
FLEET_EDGE = material('fleet_edge', '#627b7b', .12, .8)
FLEET_DECK = material('fleet_deck', '#62746a', .05, .9)
FLEET_TEAK = material('fleet_teak', '#8c7049', 0, .93)
FLEET_PLANK = material('fleet_plank', '#705b40', 0, .95)
FLEET_ROOF = material('fleet_roof', '#a3afa0', .1, .8)
FLEET_INK = material('fleet_ink', '#20333b', .1, .92)
FLEET_GLASS = material('fleet_glass', '#315c66', .18, .45)
FLEET_RUST = material('fleet_rust', '#866447', 0, .95)
FLEET_MARK = material('fleet_mark', '#d1cfab', 0, .85)


def fleet_cylinder(name, location, radius, depth, mat, axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=depth, location=location)
    obj = own(bpy.context.object, mat)
    obj.name = name
    if axis == 'Y': obj.rotation_euler.x = math.pi / 2
    elif axis == 'X': obj.rotation_euler.y = math.pi / 2
    return obj


def deckhouse(name, x, y, z, width, length, height, mat=FLEET_EDGE, chamfer=.18):
    dx, dy = width/2, length/2
    c = min(width, length)*chamfer
    points=[(x-dx+c,y-dy),(x+dx-c,y-dy),(x+dx,y-dy+c),(x+dx,y+dy-c),(x+dx-c,y+dy),(x-dx+c,y+dy),(x-dx,y+dy-c),(x-dx,y-dy+c)]
    return wing(name,points,z+height,height,mat)


def hull_outline(beam, length):
    return [(x*beam,y*length) for x,y in [(-.36,-1),(.36,-1),(.67,-.96),(.87,-.82),(.98,-.52),(1,-.05),(.94,.43),(.74,.72),(.39,.90),(0,1),(-.39,.90),(-.74,.72),(-.94,.43),(-1,-.05),(-.98,-.52),(-.87,-.82),(-.67,-.96)]]


def fleet_hull(beam, length):
    points=hull_outline(beam,length)
    levels=[(.67,-.34),(.88,-.12),(1,.15),(.94,.29)]
    vertices=[(x*scale,y*(.98 if z<0 else 1),z) for scale,z in levels for x,y in points]
    count=len(points)
    faces=[]
    for level in range(len(levels)-1):
        for i in range(count): faces.append((level*count+i,level*count+(i+1)%count,(level+1)*count+(i+1)%count,(level+1)*count+i))
    faces.append(tuple(range((len(levels)-1)*count,len(levels)*count)))
    obj=mesh('faceted-armored-hull',vertices,faces,FLEET_HULL)
    obj.data.materials.append(FLEET_EDGE)
    for face in obj.data.polygons:
        if face.index >= count*2: face.material_index=1
    wing('inset-weather-deck',hull_outline(beam*.86,length*.975),.313,.045,FLEET_DECK)


def naval_gun(name, x, y, z, barrels=2, heavy=False, open_mount=False):
    global root
    previous=root
    mount=group(name,(x,y,z));root=mount
    aa=name.startswith('turret_aa')
    size=(.66 if barrels==4 else .58) if heavy else (.30 if barrels>2 else .25) if aa else .44 if barrels==4 else .38 if barrels==3 else .34 if barrels==2 else .28
    mount['gun_barrels']=barrels
    mount['main_battery']=not aa
    fleet_cylinder('traversing-barbette',(0,0,.035),size*.62,.1,FLEET_INK)
    deckhouse('gunhouse-shadow',.025,-.02,.07,size*1.06,size*.84,.05,FLEET_INK)
    if open_mount:
        deckhouse('open-gun-platform',0,-.02,.10,size,size*.72,.045,FLEET_INK)
        box('splinter-shield',(0,.10,.22),(size,.06,.25),FLEET_EDGE)
        for side in [-1,1]: box('shield-wing',(side*size*.43,.025,.22),(.04,.18,.25),FLEET_EDGE)
    else:
        deckhouse('armored-gunhouse',0,0,.10,size,size*.76,.18,FLEET_EDGE)
        deckhouse('gunhouse-roof',-.012,.008,.28,size*.88,size*.61,.025,FLEET_ROOF)
    for i in range(barrels):
        offset=(i-(barrels-1)/2)*(.14 if heavy else .11)
        reach=.52 if heavy else .20 if aa else .34
        start=.16 if aa else .25
        fleet_cylinder('naval-gun-barrel',(offset,start+reach/2,.20),.028 if heavy else .021,reach,FLEET_INK,'Y')
        fleet_cylinder('gun-sleeve',(offset,start,.20),.043 if heavy else .03,.18,FLEET_EDGE,'Y')
        box('barrel-top-highlight',(offset,start+.02+reach/2,.224),(.018,reach*.78,.009),FLEET_ROOF)
    if not aa and not open_mount: deckhouse('turret-access-hatch',0,-.045,.309,size*.24,size*.19,.012,FLEET_EDGE)
    root=previous
    return mount


def funnel(x, y, scale=1):
    deckhouse('funnel-base',x+.025,y-.03,.31,.40*scale,.48*scale,.045,FLEET_INK)
    deckhouse('raked-funnel',x,y,.355,.29*scale,.38*scale,.36*scale,FLEET_EDGE)
    deckhouse('funnel-cap',x,y,.355+.36*scale,.33*scale,.42*scale,.045,FLEET_INK)
    box('funnel-rim',(x,y+.16*scale,.41+.36*scale),(.23*scale,.035,.02),FLEET_RUST)


def lifeboat(x, y):
    deckhouse('lifeboat-cradle',x,y,.32,.15,.46,.035,FLEET_INK)
    wing('lifeboat-gunwale',[(x-.065,y-.17),(x,y-.24),(x+.065,y-.17),(x+.065,y+.17),(x,y+.24),(x-.065,y+.17)],.405,.08,FLEET_MARK)
    box('lifeboat-seating',(x,y,.412),(.065,.22,.012),FLEET_PLANK)


def deck_fittings(beam, length, teak=False):
    # Large directional seams survive the 240px raster; no tiny text or rivet noise.
    if teak:
        for i in range(-3,4):
            x=i*beam*.19
            box('teak-deck-seam',(x,-length*.06,.34),(.024,length*1.36,.006),FLEET_PLANK)
    for y in [length*.70,-length*.77]:
        for side in [-1,1]:
            fleet_cylinder('mooring-bollard',(side*beam*.36,y,.352),.032,.07,FLEET_INK)
    deckhouse('bow-anchor-capstan',0,length*.82,.32,.13,.20,.055,FLEET_EDGE)
    for side in [-1,1]:
        for i in range(3):
            box('anchor-chain',(side*.10,length*(.79+i*.035),.33),(.023,.045,.015),FLEET_INK)
        box('deck-edge-walkway',(side*beam*.76,-length*.20,.329),(.05,length*.91,.014),FLEET_EDGE)


def parked_plane(x,y,paint):
    # Bold wings, separated tail and solid fuselage survive the native battle raster.
    wing('parked-aircraft-wing',[(x-.055,y+.10),(x-.29,y+.045),(x-.30,y-.075),(x-.055,y-.10),(x+.055,y-.10),(x+.30,y-.075),(x+.29,y+.045),(x+.055,y+.10)],.105,.035,paint)
    deckhouse('parked-aircraft-fuselage',x,y,.065,.11,.50,.09,paint)
    wing('parked-aircraft-tail',[(x-.12,y-.25),(x+.12,y-.25),(x+.13,y-.17),(x-.13,y-.17)],.115,.025,paint)
    box('parked-canopy',(x,y+.015,.168),(.065,.13,.025),FLEET_GLASS)
    box('parked-engine-cowl',(x,y+.18,.164),(.095,.095,.018),FLEET_ROOF)
    box('parked-propeller',(x,y+.27,.12),(.25,.03,.03),FLEET_INK)
    box('parked-tail-fin',(x,y-.19,.17),(.025,.13,.09),paint)
    for side in [-1,1]: fleet_cylinder('parked-wing-mark',(x+side*.20,y-.015,.116),.03,.012,FLEET_MARK)


def wreck_part(part_id):
    # Torn plates and broken beams replace the former large black disk.
    width,length=(.92,1.22) if part_id=='flight-deck' else (.38,.35)
    points=[(-width*.5,-length*.4),(-width*.18,-length*.5),(width*.4,-length*.45),(width*.5,-length*.05),(width*.31,length*.5),(-width*.3,length*.4),(-width*.48,length*.1)]
    wing('torn-deck-opening',points,.025,.035,FLEET_INK)
    for i,side in enumerate([-1,1]):
        obj=deckhouse('buckled-steel-plate',side*width*.30,side*length*.18,.035,width*.37,length*.32,.05,FLEET_RUST)
        obj.rotation_euler.z=side*.23
    box('exposed-deck-beam',(0,0,.065),(width*.78,.035,.045),FLEET_EDGE)


def historic_bridge(profile, beam):
    style=profile['geometry']['bridge']
    wide=profile['hull'] in ('battleship','fleet-carrier')
    width=.60 if wide else .45
    if style=='island': width=.37
    deckhouse('bridge-foundation',0,-.035,.015,width,.44,.17,FLEET_EDGE)
    if style=='pagoda':
        for i,factor in enumerate([1.0,1.15,.83,1.03,.69]):
            z=.19+i*.16
            deckhouse('pagoda-storey',0,-.035,z,width*factor,.30,.085,FLEET_EDGE)
            deckhouse('pagoda-eave',0,-.035,z+.085,width*(factor+.10),.34,.025,FLEET_ROOF)
        box('upper-observation-window',(0,.13,.88),(width*.59,.025,.07),FLEET_GLASS)
        fleet_cylinder('pagoda-mast',(0,-.09,1.06),.018,.48,FLEET_INK)
    else:
        height=.14 if style=='low' else .25
        deckhouse('navigation-level',0,-.015,.185,width*.82,.35,height,FLEET_ROOF)
        box('bridge-glazing',(0,.166,.22+height*.55),(width*.70,.025,.075),FLEET_GLASS)
        for side in [-1,1]:
            box('bridge-wing',(side*width*.50,.015,.19+height*.55),(.15,.23,.045),FLEET_EDGE)
            box('bridge-side-window',(side*width*.42,-.02,.22+height*.55),(.02,.20,.065),FLEET_GLASS)
        deckhouse('bridge-upper-roof',0,-.025,.185+height,width*.66,.31,.065,FLEET_EDGE)
        if style=='tripod':
            for x,y in [(0,.13),(-.20,-.18),(.20,-.18)]:
                start=Vector((x,y,.27));end=Vector((0,-.04,1.05));delta=end-start
                obj=fleet_cylinder('tripod-leg',(start+end)/2,.025,delta.length,FLEET_INK)
                obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
            fleet_cylinder('tripod-observation-top',(0,-.04,1.08),.19,.09,FLEET_EDGE)
            box('tripod-rangefinder',(0,-.04,1.15),(.53,.06,.05),FLEET_ROOF)
        elif style!='low':
            deckhouse('director-tower',0,-.09,.50,width*.47,.23,.28,FLEET_EDGE)
            box('rangefinder',(0,-.09,.82),(width*.98,.06,.055),FLEET_ROOF)
            fleet_cylinder('signal-mast',(0,-.13,.96),.020,.43,FLEET_INK)
        else:
            fleet_cylinder('low-mast',(0,-.13,.70),.018,.52,FLEET_INK)
    box('signal-yardarm',(0,-.10,1.15 if style=='pagoda' else .94),(width*.90,.035,.035),FLEET_INK)
    radar_ships={'iowa','missouri','south-dakota','enterprise','essex','fletcher','cleveland','brooklyn','baltimore','warspite','king-george-v','rodney','belfast','renown','bismarck','tirpitz','scharnhorst','prinz-eugen','roma','yamato','musashi','nagato','kongo'}
    if profile['id'] in radar_ships:
        box('period-radar',(0,-.13,1.22 if style!='low' else 1.0),(.26,.055,.06),FLEET_EDGE)


def historic_funnel(profile, station, index, beam, length):
    global root
    previous=root;root=group('historic_funnel_'+str(index),(0,station*length,0))
    root['historic_funnel']=True
    style=profile['geometry'].get('funnelStyle','raked')
    scale=min(1,beam/.53)
    if profile['hull']=='fleet-carrier' and style!='side':
        root.location.x=beam*.79*profile['geometry'].get('islandSide',1)
        root.location.z=.12
        delta=(profile['geometry']['bridgeY']-station)*length
        deckhouse('island-stack-foundation',0,delta/2,.277,.34*scale,abs(delta)+.40,.14,FLEET_EDGE)
    if style=='side':
        root.location.x=beam*.94
        # Japanese exhaust ducts turn outboard and downward, below flight-deck height.
        fleet_cylinder('outboard-smoke-duct',(.08,0,.30),.11,.26,FLEET_EDGE,'X')
        fleet_cylinder('downturned-exhaust',(.20,0,.19),.11,.24,FLEET_EDGE)
        fleet_cylinder('dark-exhaust-mouth',(.20,0,.065),.115,.025,FLEET_INK)
    else:
        if profile['id']=='shinano':
            uptake=group('outward-canted-uptake');root=uptake
            uptake.rotation_euler.y=math.radians(26)
        funnel(0,0,scale*(1.15 if style=='trunked' and index==0 else 1))
        if style=='trunked':
            box('trunked-smoke-uptake',(0,.15,.43),(.25*scale,.43*scale,.20),FLEET_EDGE)
            if profile['navy']=='fr':
                fleet_cylinder('funnel-integrated-mast',(0,-.16,.92),.025,.55,FLEET_INK)
                box('funnel-mast-yardarm',(0,-.16,1.15),(.40,.035,.04),FLEET_EDGE)
    root=previous


def historical_palette(profile):
    colors={'us':('#455c69','#80949b'),'gb':('#4b5a65','#8a9992'),'jp':('#495653','#7f8c83'),
            'de':('#53606a','#8d999d'),'it':('#596466','#a0a79c'),'fr':('#536775','#8c9a9f'),
            'su':('#52676b','#91a19d'),'cn':('#4c626b','#91a19f')}
    hull_color,edge_color=colors.get(profile['navy'],('#4d6268','#899b99'))
    if profile['id']=='tashkent': hull_color,edge_color='#4d798c','#91acb5'
    tag=profile['id'] if profile['id']=='tashkent' else profile['navy']
    hull_mat=bpy.data.materials.get('fleet_hull_'+tag) or material('fleet_hull_'+tag,hull_color,.12,.85)
    edge_mat=bpy.data.materials.get('fleet_edge_'+tag) or material('fleet_edge_'+tag,edge_color,.1,.8)
    for obj in current.objects:
        if obj.type!='MESH': continue
        for slot in obj.material_slots:
            if slot.material==FLEET_HULL: slot.material=hull_mat
            elif slot.material==FLEET_EDGE: slot.material=edge_mat


def warship(kind, profile=None):
    global root
    friendly=kind=='carrier'
    profile=profile or (HISTORICAL_BY_ID['enterprise'] if friendly else HISTORICAL_DEFAULTS[kind])
    geometry=profile['geometry'];shape=profile['shape']
    flattop=profile['hull']=='fleet-carrier'
    beam,length=(1.254,3.03) if friendly else (shape['halfBeam'],shape['halfLength'])
    root['historic_id']=profile['id'];root['historic_year']=profile['year'];root['game_role']=profile['hull']
    root['combat_stretch']=1 if friendly else shape['combatStretch']
    root['waterline_beam']=beam*(.80 if flattop else 1);root['waterline_length']=length
    fleet_hull(beam*(.80 if flattop else 1),length)
    deck_kind=geometry.get('deck','wood')
    deck_mat=FLEET_TEAK if deck_kind=='wood' else FLEET_PLANK if deck_kind=='linoleum' else FLEET_DECK
    if flattop:
        deck=[(x*beam,y*length) for x,y in [(-.72,-.97),(.72,-.97),(.93,-.86),(.96,.71),(.78,.91),(.52,.97),(-.52,.97),(-.78,.91),(-.96,.71),(-.93,-.86)]]
        wing('flight-deck-shadow',deck,.35,.075,FLEET_INK)
        wing('period-flight-deck',[(x*.96,y*.995) for x,y in deck],.39,.04,deck_mat)
        if deck_kind=='wood':
            for i in range(-4,5):box('flight-deck-plank',(i*beam*.18,-.04,.397),(.012,length*1.73,.008),FLEET_PLANK)
        for side in [-1,1]:box('flight-deck-edge-paint',(side*beam*.82,-length*.05,.41),(.018,length*1.62,.012),FLEET_MARK)
        for y in [length*.15+i*.28 for i in range(7)]:box('runway-dash',(0,y,.416),(.025,.15,.012),FLEET_MARK)
        for x in [-.42,-.21,0,.21,.42]:box('launch-threshold',(x*beam,length*.82,.419),(.045,.19,.014),FLEET_MARK)
        for i,(x,y) in enumerate(geometry.get('lifts',[])):
            deckhouse('lift-rim-'+str(i),x*beam,y*length,.405,beam*.54,.37,.025,FLEET_INK)
            deckhouse('lift-deck-'+str(i),x*beam,y*length,.431,beam*.47,.31,.012,FLEET_PLANK if deck_kind=='wood' else FLEET_EDGE)
        for side in [-1,1]:
            for y in [-length*.60,length*.05,length*.63]:deckhouse('sponson-support',side*beam*.94,y,.20,beam*.19,.26,.12,FLEET_HULL)
    else:
        wing('inset-main-deck',hull_outline(beam*.79,length*.95),.327,.014,deck_mat)
        deck_fittings(beam,length,deck_kind=='wood')
        if geometry.get('bowStripes'):
            for i in range(5):box('recognition-bow-stripe',(0,length*(.81+i*.027),.342),(beam*(.65-i*.10),.034,.012),FLEET_MARK if i%2==0 else FLEET_RUST)
    if profile['hull']=='transport':
        for y in [.75,.50,.27,-.39,-.68]:
            deckhouse('cargo-hatch-coaming',0,y*length,.34,beam*1.30,length*.18,.075,FLEET_INK)
            deckhouse('cargo-hatch-cover',0,y*length,.415,beam*1.17,length*.15,.045,FLEET_EDGE)
            box('cargo-hatch-rib',(0,y*length,.47),(.025,length*.13,.02),FLEET_ROOF)
        previous=root;root=group('cargo-wheelhouse',(0,geometry['bridgeY']*length,.33));root.scale=(min(1,beam/.40),)*3
        historic_bridge(profile,beam);root=previous
        for y in [.64,.38,-.52]:
            fleet_cylinder('cargo-derrick-mast',(0,y*length,.74),.022,.83,FLEET_EDGE)
            obj=box('cargo-derrick-boom',(beam*.25,y*length+.13,.98),(beam*.85,.03,.03),FLEET_MARK);obj.rotation_euler.z=.22
    if profile['hull']=='patrol-boat':
        previous=root;root=group('patrol-wheelhouse',(0,geometry['bridgeY']*length,.33))
        root.scale=(min(1,beam/.40),)*3;historic_bridge(profile,beam);root=previous
        if profile['id']=='pt-109':
            for side in [-1,1]:
                mount=naval_gun('turret_mg_visual_'+str(side),side*beam*.42,.04*length,.34,2)
                mount.scale=(.42,)*3;mount['main_battery']=False
    for i,station in enumerate(geometry['funnels']):historic_funnel(profile,station,i,beam,length)
    for i,gun in enumerate(geometry['guns']):
        size=min(1,beam/.43) if profile['hull']!='battleship' else 1
        if gun['raised']:
            fleet_cylinder('raised-main-barbette',(gun['x']*beam,gun['y']*length,.34+gun['raised']/2),(.30 if geometry['calibre']>=250 else .16)*size,gun['raised'],FLEET_EDGE)
        mount=naval_gun('turret_main_'+str(i),gun['x']*beam,gun['y']*length,.34+gun['raised'],gun['barrels'],geometry['calibre']>=250,geometry.get('openGuns',False))
        mount.rotation_euler.z=math.radians(gun['bearing']);mount.scale=(size,)*3
        mount['historic_main']=True
    for i,gun in enumerate(geometry.get('secondary',[])):
        size=.48 if gun['x'] else .65
        if gun['raised']:
            fleet_cylinder('raised-secondary-barbette',(gun['x']*beam,gun['y']*length,.34+gun['raised']/2),.16*size,gun['raised'],FLEET_EDGE)
        mount=naval_gun('turret_secondary_'+str(i),gun['x']*beam,gun['y']*length,.34+gun['raised'],gun['barrels'])
        mount.rotation_euler.z=math.radians(gun['bearing']);mount.scale=(size,)*3
        mount['main_battery']=False
    if not flattop:
        for side in [-1,1]:lifeboat(side*beam*.63,-length*.10)
        banks=geometry.get('torpedoes',0)
        if profile['id']=='pt-109':
            for side in [-1,1]:
                for y in [-.37,.12]:fleet_cylinder('patrol-torpedo-tube',(side*beam*.62,y*length,.39),.043,.64,FLEET_INK,'Y')
        else:
            for i in range(banks):
                station=-.30+i*.45/max(1,banks-1)
                x=(1 if i%2 else -1)*beam*.45 if profile['hull']=='cruiser' else 0
                deckhouse('torpedo-launcher-base',x,station*length,.34,beam*.85,.16,.06,FLEET_EDGE)
                for offset in [-.07,0,.07]:fleet_cylinder('deck-torpedo-tube',(x,station*length+offset,.43),.025,beam*1.15,FLEET_INK,'X')
        for i in range(geometry.get('catapults',0)):
            x=(i-(geometry['catapults']-1)/2)*beam*.85
            y=length*.92 if profile['id']=='zara' else -length*.88
            if geometry.get('catapultStations'):
                xx,yy,bearing,*span=geometry['catapultStations'][i]
                previous=root;root=group('historic_catapult_'+str(i),(xx*beam,yy*length,.34))
                root['historic_catapult']=True;root.rotation_euler.z=math.radians(bearing)
                box('aircraft-catapult-rail',(0,0,.05),(.035,beam*(span[0] if span else 1.55),.035),FLEET_ROOF)
                deckhouse('catapult-pivot',0,0,0,.10,.10,.06,FLEET_EDGE)
                root=previous
            else:
                box('aircraft-catapult-rail',(x,y,.39),(.035,.33,.035),FLEET_ROOF)
                deckhouse('catapult-pivot',x,y,.34,.10,.10,.06,FLEET_EDGE)
    parts=shape['parts']
    if friendly:
        parts={'aa-port':{'x':-beam*.73,'y':length*.15},'aa-starboard':{'x':beam*.73,'y':length*.15},'bridge':{'x':beam*.79,'y':-length*geometry['bridgeY']},'flight-deck':{'x':0,'y':length*.34}}
    for part_id,point in parts.items():
        x,y=point['x'],-point['y']
        previous=root;part=group('part_'+part_id,(x,y,.40 if flattop else .33));root=part
        if part_id.startswith('aa-'):
            part.scale=(min(1,beam/.60),)*3
            deckhouse('aa-sponson',0,0,-.04,.37,.38,.08,FLEET_HULL)
            fleet_cylinder('aa-bulwark',(0,0,.045),.17,.075,FLEET_EDGE)
            naval_gun('turret_aa_'+part_id,0,0,.07,1 if profile['hull']=='patrol-boat' else 3 if profile['navy']=='jp' else 2)
        elif part_id=='bridge':
            part.scale=(min(1,beam/.40),)*3
            historic_bridge(profile,beam)
        else:
            deckhouse('flight-operations-shadow',0,0,-.012,beam*1.50,length*.66,.015,FLEET_INK)
            deckhouse('flight-operations-surface',0,0,.005,beam*1.46,length*.63,.025,deck_mat)
            for yy in [-.70,-.35,0,.35,.70]:box('arresting-cable',(0,yy+.09,.048),(beam*1.30,.014,.012),FLEET_INK)
            parking_x=-geometry.get('islandSide',1)*beam*(.68 if friendly else .62)
            for i,yy in enumerate([-1.18,-.58,.02]):
                aircraft=group('parked_aircraft_'+str(i),(parking_x,yy,.035));root=aircraft
                aircraft['parked_aircraft']=True;aircraft.scale=(1 if friendly else min(1,beam),)*3
                parked_plane(0,0,NAVY if friendly else OLIVE);root=part
        root=previous
        if not friendly:
            ruin=group('ruin_'+part_id,(x,y,.41 if flattop else .34));root=ruin
            if part_id!='flight-deck':ruin.scale=(min(1,beam/.60),)*3
            else:ruin.scale.x=min(1,beam)
            wreck_part(part_id);root=previous
    historical_palette(profile)



def shore(kind):
    global root
    beam,length=(1.241,1.448) if kind=='coastal-battery' else (1.3,1.5)
    wing('sand-foundation',[(-beam,-length),(beam,-length),(beam*1.06,length*.6),(beam*.5,length),(-beam*.8,length*.8)],.12,.2,BEACH)
    box('concrete-emplacement',(0,0,.16),(beam*1.4,length*1.4,.2),ROCK)
    if kind=='oil-depot':
        for x,y in [(-.58,.38),(.55,.38),(0,-.65)]:
            cylinder('oil-tank',(x,y,.49),.43,.65,SILVER)
            cylinder('tank-roof',(x,y,.83),.44,.055,CAMO)
            cylinder('tank-cap',(x,y,.9),.065,.08,BLACK)
        for x in [-1,1]: box('pipe-rack',(x*.94,0,.3),(.09,2.1,.1),BLACK)
        return
    previous=root
    root=group('part_aa-port',(-beam*.63,-length*.15,.23))
    cylinder('aa-platform',(0,0,.015),.22,.1,NAVY)
    turret('turret_aa_aa-port',0,0,.1)
    root=previous
    root=group('ruin_aa-port',(-beam*.63,-length*.15,.24))
    cylinder('scorched-part-base',(0,0,.025),.28,.055,BLACK)
    box('broken-steel',(0,0,.08),(.3,.23,.12),CAMO)
    root=previous


def naval(kind):
    if kind in ('coastal-battery','oil-depot'): shore(kind)
    else: warship(kind)



models=[]
builds=[('falcon',lambda:fighter('falcon','falcon')),('swift',lambda:fighter('swift','swift')),('turtle',lambda:fighter('turtle','turtle')),('scout',lambda:fighter('scout','scout',True)),('dart',lambda:fighter('dart','dart',True)),('gunship',lambda:fighter('gunship','gunship',True)),('boss',lambda:bomber(False)),('boss-final',lambda:bomber(True)),('carrier',carrier),('island',island),('pickup-xp',lambda:pickup('xp')),('pickup-health',lambda:pickup('health')),('pickup-bomb',lambda:pickup('bomb')),('enemy-round',lambda:enemy_bullet(False)),('enemy-aimed',lambda:enemy_bullet(True))]
builds += [(kind, lambda k=kind: naval_aircraft(k)) for kind in ('interceptor','diver','torpedo')]
builds += [(kind, lambda k=kind: naval(k)) for kind in ('patrol-boat','destroyer','cruiser','battleship','fleet-carrier','coastal-battery','oil-depot','transport')]
builds += [(entry['modelId'],lambda p=entry:warship(p['hull'],p)) for entry in HISTORICAL_FLEET if entry['modelId'].startswith('historic-')]
for index,(name,build) in enumerate(builds):
    current=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(current)
    root=bpy.data.objects.new(name,None)
    current.objects.link(root)
    build()
    # Keep part, turret and propeller empties while merging geometry per parent.
    parents = sorted({obj.parent for obj in current.objects if obj.type == 'MESH'},key=lambda parent:parent.name)
    for parent in parents:
        static = [obj for obj in current.objects if obj.type == 'MESH' and obj.parent == parent]
        if not static: continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in static: obj.select_set(True)
        bpy.context.view_layer.objects.active = static[0]
        bpy.ops.object.join()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bpy.context.object.name = name + '-' + parent.name + '-geometry'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in current.objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_normals=not (name.startswith('historic-') or name in ('carrier','patrol-boat','destroyer','cruiser','battleship','fleet-carrier','transport')))
    triangles=sum(len(obj.data.polygons) for obj in current.objects if obj.type=='MESH')
    models.append({'id':name,'file':name+'.glb','polygons':triangles,'bytes':(OUT/(name+'.glb')).stat().st_size})
    root.location=(index%5*7,index//5*12,0)
    for obj in current.objects: obj.select_set(False)
    # Keep finished assets out of dependency-graph updates while constructing the archive.
    current.hide_viewport=True

for collection in bpy.context.scene.collection.children: collection.hide_viewport=False
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
