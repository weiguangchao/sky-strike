"""Generate the editable WWII model library and the GLBs used by the game.
Run with Blender --background --factory-startup --python scripts/blender/build_models.py.
"""
import bpy
import json
import math
import random
import os
import shutil
import tempfile
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from refine_geometry import bevel_structures, interpolated_sections, swept_propeller_blade, cambered_fin

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


def structural_rod(name,start,end,radius,mat,parent=None):
    a,b=Vector(start),Vector(end)
    direction=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=radius,depth=direction.length,location=(a+b)*.5)
    obj=own(bpy.context.object,mat,parent)
    obj.name=name
    obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    return obj


def wing(name, points, height, thickness, mat):
    if name in ('elliptical-main-wing','tailplane','bomber-main-wing','bomber-tailplane',
                'boom-tailplane','recognition-wing','wide-tailplane'):
        stations=sorted({x for x,_ in points})
        stations=sorted(set(stations+[(a+b)/2 for a,b in zip(stations,stations[1:])]))
        section=[(0,0),(.12,.72),(.32,1),(.65,.65),(1,0),(.65,-.43),(.32,-.55),(.12,-.35)]
        vertices=[]
        for x in stations:
            intersections=[]
            for (xa,ya),(xb,yb) in zip(points,points[1:]+points[:1]):
                if min(xa,xb)-1e-8<=x<=max(xa,xb)+1e-8:
                    if abs(xb-xa)<1e-8:intersections.extend([ya,yb])
                    else:intersections.append(ya+(yb-ya)*(x-xa)/(xb-xa))
            trailing,leading=min(intersections),max(intersections)
            for chord,camber in section:
                vertices.append((x,leading-(leading-trailing)*chord,height-thickness*.60+camber*thickness*.60))
        count=len(section)
        faces=[tuple(reversed(range(count)))]
        for at in range(len(stations)-1):
            faces.extend((at*count+i,at*count+(i+1)%count,(at+1)*count+(i+1)%count,(at+1)*count+i) for i in range(count))
        faces.append(tuple(range((len(stations)-1)*count,len(stations)*count)))
        return mesh(name,vertices,faces,mat)
    count = len(points)
    vertices = [(x, y, height) for x, y in points] + [(x, y, height-thickness) for x, y in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, count*2)))]
    faces += [(i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count)]
    return mesh(name, vertices, faces, mat)


def fuselage(name, sections, top, bottom=LIGHT):
    sections = interpolated_sections(sections, 3)
    vertices = []
    for y, width, height, z in sections:
        for i in range(20):
            angle = i * math.tau / 20
            vertices.append((math.cos(angle)*width, y, z+math.sin(angle)*height))
    faces = [tuple(range(20))]
    for j in range(len(sections)-1):
        for i in range(20):
            faces.append((j*20+i, (j+1)*20+i, (j+1)*20+(i+1) % 20, j*20+(i+1) % 20))
    faces.append(tuple(reversed(range((len(sections)-1)*20, len(sections)*20))))
    obj = mesh(name, vertices, faces, top)
    obj.data.materials.append(bottom)
    for face in obj.data.polygons:
        if face.center.z < -.02:
            face.material_index = 1
        face.use_smooth = True
    return obj


def loft_identification_band(name,sections,x_offset,station,width,mat):
    refined=interpolated_sections(sections,3)
    vertices=[]
    for y in [station-.013,station+.013]:
        a,b=next((a,b) for a,b in zip(refined,refined[1:]) if a[0]<=y<=b[0])
        t=(y-a[0])/(b[0]-a[0])
        rx,rz,center=[a[i]+(b[i]-a[i])*t for i in [1,2,3]]
        for x in [-width/2,0,width/2]:
            vertices.append((x_offset+x,y,center+rz*math.sqrt(max(0,1-(x/rx)**2))+.0015))
    return mesh(name,vertices,[(0,1,4,3),(1,2,5,4)],mat)


def propeller(x, y, z, radius, index):
    rotor = bpy.data.objects.new(f'propeller_{index:02d}', None)
    current.objects.link(rotor)
    rotor.parent = root
    rotor.location = (x, y, z)
    def blade_mesh(name, vertices, faces, material, parent):
        obj=mesh(name,vertices,faces,material)
        obj.parent=parent
        return obj
    for i in range(3):
        swept_propeller_blade(f'blade_{index}_{i}',0,0,i*math.tau/3,radius,BLACK,rotor,blade_mesh)
    sphere(f'spinner_{index}', (x, y+.035, z), (.065, .09, .065), AMBER)


def insignia(x, y, z, enemy=False):
    cylinder('roundel-outer', (x, y, z), .092, .008, CREAM)
    cylinder('roundel-center', (x, y, z+.006), .059, .009, RED if enemy else NAVY)
    cylinder('roundel-dot', (x, y, z+.012), .021, .01, CREAM)


def conform_wing_markings(collection):
    wings=[obj for obj in collection.objects if obj.type=='MESH' and obj.name.startswith(('elliptical-main-wing','bomber-main-wing','recognition-wing'))]
    if not wings:return
    bpy.context.view_layer.update()
    wing=wings[0]
    surface=BVHTree.FromPolygons([wing.matrix_world@vertex.co for vertex in wing.data.vertices],[tuple(face.vertices) for face in wing.data.polygons])
    prefixes=('camouflage-panel','aileron-panel','roundel-','recognition-band','wing-recognition-band')
    for obj in collection.objects:
        if obj.type!='MESH' or not obj.name.startswith(prefixes):continue
        points=[obj.matrix_world@vertex.co for vertex in obj.data.vertices]
        bottom=min(point.z for point in points)
        layer=.004 if obj.name.startswith('roundel-dot') else .002 if obj.name.startswith('roundel-center') else 0
        inverse=obj.matrix_world.inverted()
        for vertex,point in zip(obj.data.vertices,points):
            hit,_,_,_=surface.ray_cast(Vector((point.x,point.y,10)),Vector((0,0,-1)))
            if hit is not None:
                point.z=hit.z+.001+layer+point.z-bottom
                vertex.co=inverse@point


def aircraft_fin(name,outline,width,paint):
    def surface(name,vertices,faces,material,parent):
        return mesh(name,vertices,faces,material)
    return cambered_fin(name,outline,width,paint,root,surface)


def framed_canopy(name, center, radii, paint):
    sphere(name,center,radii,GLASS,24)
    cx,cy,cz=center;rx,ry,rz=radii
    def strut(a,b):
        direction=Vector(b)-Vector(a)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.006,depth=direction.length,location=(Vector(a)+Vector(b))*.5)
        obj=own(bpy.context.object,paint)
        obj.name='canopy-surface-frame'
        obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    for station in [-.62,.12,.65]:
        ring=[]
        for step in range(9):
            angle=step*math.pi/8
            ring.append((cx+rx*math.sqrt(1-station**2)*math.cos(angle),cy+ry*station,cz+rz*math.sqrt(1-station**2)*math.sin(angle)))
        for a,b in zip(ring,ring[1:]):strut(a,b)
    ridge=[(cx,cy+ry*station,cz+rz*math.sqrt(1-station**2)) for station in [-.94,-.7,-.4,0,.4,.7,.94]]
    for a,b in zip(ridge,ridge[1:]):strut(a,b)


def fighter(name, variant, enemy=False):
    paint = SAND if variant == 'dart' else NAVY if variant == 'swift' else OLIVE
    if enemy:
        paint = SAND if variant == 'scout' else RED if variant == 'dart' else NAVY
    twin = variant in ('turtle', 'gunship')
    body=[(-1.0,.025,.035,.03),(-.68,.07,.08,.04),(-.25,.13,.13,.045),(.2,.155,.16,.045),(.68,.13,.14,.02),(.92,.09,.1,.02),(1.02,.045,.06,.02)]
    if variant=='scout':body=[(-1,.022,.033,.03),(-.6,.065,.07,.04),(-.20,.105,.12,.04),(.20,.135,.14,.04),(.70,.12,.12,.025),(.92,.09,.09,.02),(1.02,.045,.06,.02)]
    if variant=='turtle':body=[(-.58,.025,.035,.04),(-.39,.085,.10,.045),(-.1,.14,.14,.045),(.2,.155,.16,.045),(.68,.13,.14,.02),(.92,.09,.1,.02),(1.02,.045,.06,.02)]
    fuselage('riveted-fuselage',body,paint)
    fuselage('wing-root-fillet',[(-.31,.09,.025,-.005),(-.13,.20,.065,-.005),(.14,.22,.070,-.005),(.34,.18,.055,-.005),(.44,.08,.020,-.005)],paint)
    span = 1.28 if twin else .92 if variant=='dart' else .98 if variant=='scout' else 1.15 if variant == 'swift' else 1.22
    outline = [(-.13,.4),(-.62,.3),(-span,.08),(-span-.05,-.09),(-span,-.22),(-.8,-.28),(-.14,-.22),(.14,-.22),(.8,-.28),(span,-.22),(span+.05,-.09),(span,.08),(.62,.3),(.13,.4)]
    main_wing=wing('elliptical-main-wing', outline, .015, .065, paint)
    wing_node=group('airframe_main_wing');wing_node['visual_component']='main-wing';main_wing.parent=wing_node
    if variant=='swift':
        for vertex in main_wing.data.vertices:
            vertex.co.y-=.10*(abs(vertex.co.x)/span)**2
    wing('tailplane', [(-.05,-.62),(-.45,-.73),(-.46,-.85),(-.1,-.9),(.1,-.9),(.46,-.85),(.45,-.73),(.05,-.62)], .07, .035, paint)
    for side in [-1, 1]:
        wing('camouflage-panel', [(side*.22,.24),(side*.58,.2),(side*1.02,-.15),(side*.72,-.21),(side*.23,-.08)], .024, .004, CAMO)
        wing('aileron-panel', [(side*.7,-.22),(side*1.1,-.18),(side*1.14,-.12),(side*.72,-.16)], .027, .003, LIGHT if variant == 'turtle' else CAMO)
        insignia(side*.88, -.045, .04, enemy)
        cylinder('wing-cannon', (side*.39,.32,.025), .016, .28, BLACK, 'Y')
        box('exhaust-stack', (side*.135,.57,.065), (.035,.25,.035), BLACK)
        if side==-1 and variant!='turtle':
            for i in range(3):
                box('tail-identification-stripe', (0, -.51-i*.07, .118-i*.009), (.14,.028,.008), CREAM)
    if variant in ('dart','scout'):
        for obj in current.objects:
            if obj.name.startswith(('camouflage-panel','aileron-panel')):
                for vertex in obj.data.vertices:vertex.co.x*=span/1.22
            elif obj.name.startswith(('roundel-','wing-cannon')):
                obj.location.x*=span/1.22
                if obj.name.startswith('roundel-'):obj.scale*=span/1.22
    framed_canopy('cockpit-canopy',(0,-.18 if variant=='scout' else -.08,.18),(.085,.21,.095) if variant=='scout' else (.099,.25,.105),paint)
    fin_outline=[(-.92,.05),(-.88,.30),(-.80,.43),(-.72,.42),(-.56,.12),(-.63,.06)]
    if variant=='swift':fin_outline=[(-.92,.05),(-.86,.36),(-.76,.43),(-.68,.36),(-.56,.12)]
    if variant=='scout':fin_outline=[(-.92,.05),(-.92,.34),(-.78,.37),(-.57,.12)]
    fin=aircraft_fin('vertical-tail-fin',fin_outline,.036,paint)
    if variant!='turtle':
        structural_rod('rudder-control-hinge',(.020,-.88,.10),(.020,-.80,.34),.006,CAMO)
    if variant=='turtle':
        bpy.data.objects.remove(fin,do_unlink=True)
    if twin:
        for i, side in enumerate([-1, 1]):
            sphere('engine-nacelle', (side*.55,.23,-.01), (.14,.51,.13), paint)
            cylinder('engine-cowling', (side*.55,.65,-.01), .135,.15, BLACK,'Y')
            propeller(side*.55,.75,-.01,.37,i)
        if variant=='gunship':framed_canopy('gunship-observation-nose',(0,.95,.045),(.085,.135,.08),paint)
        if variant == 'turtle':
            tail=next(obj for obj in current.objects if obj.name.startswith('tailplane'))
            for vertex in tail.data.vertices:
                vertex.co.x*=1.65
                vertex.co.y-=.05
            for side in [-1,1]:
                boom=fuselage('twin-tail-boom',[(-1.04,.025,.034,.05),(-.84,.045,.060,.04),(-.35,.060,.070,.02),(.28,.095,.105,.01)],paint)
                boom.location.x=side*.55
                for band in range(3):loft_identification_band('boom-identification-stripe',[(-1.04,.025,.034,.05),(-.84,.045,.060,.04),(-.35,.060,.070,.02),(.28,.095,.105,.01)],side*.55,-.51-band*.07,.07,CREAM)
                fin=aircraft_fin('boom-vertical-fin',[(-1.04,.04),(-1.00,.24),(-.92,.36),(-.84,.34),(-.71,.08)],.030,paint)
                fin.location.x=side*.55
                wing('boom-tailplane', [(side*.55-.19,-.77),(side*.55+.19,-.77),(side*.55+.2,-.94),(side*.55-.2,-.94)], .09,.03,paint)
    else:
        fuselage('cowl-shoulder',[(.66,.13,.14,.02),(.77,.15,.15,.02),(.89,.134,.134,.02)],paint)
        cylinder('engine-cowling', (0,.83,.02), .134,.16, paint,'Y')
        propeller(0,1.04,.02,.36,0)
    if variant == 'dart':
        gear=group('fixed_landing_gear');gear['visual_component']='landing-gear'
        for side in [-1,1]:
            structural_rod('landing-gear-strut',(side*.49,.05,-.015),(side*.49,.05,-.18),.022,LIGHT,gear)
            structural_rod('landing-gear-brace',(side*.18,.16,-.03),(side*.49,.05,-.15),.017,BLACK,gear)
            spat=sphere('fixed-undercarriage-spat', (side*.49,.04,-.19), (.075,.2,.1), BLACK)
            spat.parent=gear


def bomber(final=False):
    paint = SILVER if final else OLIVE
    fuselage('bomber-fuselage', [(-1.25,.04,.06,.12),(-.8,.12,.14,.12),(-.1,.24,.23,.16),(.7,.23,.22,.16),(1.18,.17,.18,.13),(1.4,.04,.07,.1)], paint)
    wing('bomber-main-wing', [(-.2,.43),(-1.3,.23),(-2.1,-.08),(-2.14,-.3),(-.5,-.29),(.5,-.29),(2.14,-.3),(2.1,-.08),(1.3,.23),(.2,.43)], .07,.1,paint)
    wing('bomber-tailplane', [(-.1,-.77),(-.76,-.97),(-.8,-1.14),(.8,-1.14),(.76,-.97),(.1,-.77)], .2,.055,paint)
    sphere('glazed-bomber-nose', (0,1.18,.23), (.17,.22,.14), GLASS)
    framed_canopy('bombardier-cockpit',(0,.6,.37),(.19,.3,.1),paint)
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
        fx=side*.35
        fin=aircraft_fin('bomber-vertical-tail',[(-1.22,.18),(-1.20,.43),(-1.15,.56),(-1.06,.54),(-.86,.24),(-.89,.15),(-1.12,.15)],.034,paint)
        fin.location.x=fx
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
    main_wing=wing('recognition-wing',outline,.025,.075,paint)
    wing_node=group('airframe_main_wing');wing_node['visual_component']='main-wing';main_wing.parent=wing_node
    if kind=='diver':
        for vertex in main_wing.data.vertices:
            span=abs(vertex.co.x)
            vertex.co.z+=-.14*min(span,.48)/.48+max(0,span-.48)*.16
    wing('wide-tailplane',[(-.06,-length+.26),(-.55,-length+.15),(-.56,-length),(.56,-length),(.55,-length+.15),(.06,-length+.26)],.09,.045,paint)
    outline=[(-length+.02,.06),(-length+.03,.29),(-length+.12,.43),(-length+.24,.41),(-length+.43,.08),(-length+.30,.05)]
    count=len(outline)
    aircraft_fin('profiled-naval-tail',outline,.034,paint)
    fuselage('naval-wing-root-fillet',[(-.30,.09,.025,-.005),(-.10,.20,.065,-.005),(.16,.22,.070,-.005),(.34,.18,.055,-.005),(.43,.08,.020,-.005)],paint)
    framed_canopy('long-canopy',(0,-.15,.2),(.105,.38 if kind=='torpedo' else .23,.1),paint)
    cylinder('radial-cowling',(0,.89,.02),.16,.18,BLACK,'Y')
    propeller(0,1.05,.02,.4,0)
    guns=group('wing_guns');guns['visual_component']='wing-guns'
    for side in [-1,1]:
        insignia(side*1.04,-.015,.08,True)
        box('wing-recognition-band',(side*.72,-.025,.08),(.08,.32,.012),CREAM)
        cylinder('wing-gun',(side*.43,.26 if kind=='diver' else .31,-.12 if kind=='diver' else .018),.018,.4 if kind=='diver' else .3,BLACK,'Y',guns)
    if kind == 'diver':
        for side in [-1,1]:
            box('fixed-wheel-strut',(side*.52,.02,-.22),(.055,.08,.20),BLACK)
            sphere('wheel-spat',(side*.52,.07,-.29),(.085,.23,.12),BLACK)
            box('dive-brake',(side*.93,-.14,-.05),(.5,.06,.1),SAND)
    if kind == 'torpedo':
        # Two load-bearing pylons overlap the belly and the store's crown.
        for y in [-.30,.22]:
            box('torpedo-suspension-pylon',(0,y,-.11),(.06,.10,.11),BLACK)
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


def tapered_house(name, width, length, bottom, height, taper=.65):
    outline=[(-.5,-.5),(.5,-.5),(.5,.28),(.22,.5),(-.22,.5),(-.5,.28)]
    vertices=[(x*width*factor,y*length*factor,z) for factor,z in [(1,bottom),(taper,bottom+height)] for x,y in outline]
    count=len(outline)
    faces=[tuple(reversed(range(count))),tuple(range(count,count*2))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    obj=mesh(name,vertices,faces,FLEET_EDGE)
    obj.data.materials.append(FLEET_ROOF)
    obj.data.polygons[1].material_index=1
    return obj


def hull_family(profile):
    g=profile['geometry']
    if g.get('radar')=='stealth':return 'tumblehome'
    if profile['id']=='pt-109':return 'planing'
    if profile['hull']=='transport' or '护航航空母舰' in profile['kind']:return 'merchant'
    if profile['hull']=='fleet-carrier':return 'carrier'
    return profile['hull']


def hull_outline(beam, length, profile=None):
    family=hull_family(profile) if profile else 'cruiser'
    outlines={
        'planing':[(-1,.70),(-.80,.96),(-.45,1),(-.05,.97),(.36,.86),(.64,.65),(.85,.34),(1,0)],
        'merchant':[(-1,.32),(-.92,.67),(-.70,.94),(-.32,1),(.16,1),(.50,.94),(.73,.73),(.90,.36),(1,0)],
        'carrier':[(-1,.42),(-.90,.72),(-.62,.95),(-.20,1),(.25,.96),(.57,.80),(.78,.53),(.93,.23),(1,0)],
        'battleship':[(-1,.26),(-.91,.63),(-.70,.91),(-.31,1),(.13,.99),(.46,.89),(.70,.64),(.87,.35),(1,0)],
        'destroyer':[(-1,.36),(-.90,.71),(-.59,.95),(-.17,1),(.20,.95),(.52,.78),(.76,.49),(.91,.21),(1,0)],
        'cruiser':[(-1,.26),(-.91,.64),(-.68,.93),(-.25,1),(.14,.98),(.47,.86),(.71,.60),(.89,.28),(1,0)],
        'patrol-boat':[(-1,.32),(-.88,.72),(-.53,.96),(-.12,1),(.29,.94),(.62,.73),(.85,.37),(1,0)],
        'tumblehome':[(-1,.64),(-.80,.87),(-.38,.99),(0,1),(.37,.88),(.68,.57),(.88,.25),(1,0)],
    }
    stations=outlines[family]
    return [(-stations[0][1]*beam,-length)]+[(width*beam,y*length) for y,width in stations]+[(-width*beam,y*length) for y,width in reversed(stations[1:-1])]


def hull_sheer(station,length,profile):
    family=hull_family(profile)
    y=station/length
    if family=='carrier':return 0
    fore=max(0,(y-.18)/.82)
    aft=max(0,(-y-.36)/.64)
    if family=='planing':return -.12+.07*fore**2+.012*aft**2
    if family=='tumblehome':return .018*fore
    return (.16 if family=='destroyer' else .12 if family=='battleship' else .10)*fore**2+.035*aft**2


def weather_deck(name,points,height,thickness,mat,length,profile):
    stations=sorted(set(y for _,y in points))
    vertices=[]
    for y in stations:
        xs=[x for x,station in points if abs(station-y)<1e-7]
        left,right=min(xs),max(xs)
        top=height+hull_sheer(y,length,profile)
        if hull_family(profile)=='tumblehome':y-=.10*length*max(0,y/length)**5
        vertices.extend([(left,y,top-thickness),(right,y,top-thickness),(right,y,top),(left,y,top)])
    faces=[(0,1,2,3)]
    for station in range(len(stations)-1):
        for edge in range(4):
            a=station*4+edge;b=station*4+(edge+1)%4
            face=tuple(dict.fromkeys((a,a+4,b+4,b)))
            faces.append(face)
    faces.append(tuple(reversed(range(len(vertices)-4,len(vertices)))))
    return mesh(name,vertices,faces,mat)


def follow_deck_sheer(collection,profile,length):
    if profile['hull']=='fleet-carrier':return
    skip=('faceted-armored-hull','inset-weather-deck','inset-main-deck','raised-forecastle','bow-stem-seam','recessed-anchor-hawse')
    bpy.context.view_layer.update()
    for obj in collection.objects:
        if obj.parent!=root or obj.name.startswith(skip):continue
        if obj.type=='EMPTY':
            obj.location.z+=hull_sheer(obj.location.y,length,profile)
        elif obj.type=='MESH':
            inverse=obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                point=obj.matrix_world@vertex.co
                point.z+=hull_sheer(point.y,length,profile)
                vertex.co=inverse@point


def apply_ship_height_envelope(collection,profile,beam,length):
    family=hull_family(profile)
    # Art-directed exterior height envelopes at the fixed native preview size.
    # Canonical X/Y dimensions and gameplay anchors remain intact.
    relative_height={'battleship':.065,'cruiser':.060,'destroyer':.060,'patrol-boat':.065,
                     'carrier':.065,'merchant':.080,'tumblehome':.075,'planing':.092}
    authored_depth=.33 if family=='planing' else .60
    ratio=min(.95,max(.32,2*length*relative_height[family]/authored_depth))
    upper=.82
    def height(z):return z*ratio if z<=.33 else .33*ratio+(z-.33)*upper
    bpy.context.view_layer.update()
    surfaces=[(obj,[obj.matrix_world@vertex.co for vertex in obj.data.vertices]) for obj in collection.objects if obj.type=='MESH']
    for obj in collection.objects:
        if obj.parent==root and obj.type=='EMPTY':
            obj.location.z=height(obj.location.z)
            obj.scale.z*=upper
    bpy.context.view_layer.update()
    for obj,points in surfaces:
        inverse=obj.matrix_world.inverted()
        for vertex,point in zip(obj.data.vertices,points):
            point.z=height(point.z)
            vertex.co=inverse@point
    root['art_hull_height_ratio']=ratio


def fleet_hull(beam,length,profile):
    family=hull_family(profile)
    points=hull_outline(beam,length,profile)
    # Sections describe the keel, turn of bilge, waterline and gunwale.
    # Longitudinal stem rake is independent of the planform taper.
    levels=[(.10,-.31),(.43,-.285),(.73,-.20),(.92,-.06),(.94,.12),(1,.29)]
    if family=='planing':levels=[(.08,-.16),(.48,-.13),(.88,-.045),(1,.10),(1,.29)]
    if family=='tumblehome':levels=[(.11,-.31),(.55,-.27),(.88,-.14),(1,.025),(.91,.15),(.76,.29)]
    vertices=[]
    for level,(gain,z) in enumerate(levels):
        depth=max(0,-z)/(.16 if family=='planing' else .31)
        for x,y in points:
            t=y/length
            if family=='tumblehome':
                longitudinal=y-(.10*length*(1-depth)*max(0,t)**5)
            else:
                longitudinal=y-length*.19*depth*max(0,t)**4+length*.12*depth*max(0,-t)**5
            foot=.10*depth*max(0,t)**5+.065*depth*max(0,-t)**5
            sheer=hull_sheer(y,length,profile)*max(0,z/.29)
            vertices.append((x*gain,longitudinal,z+foot+sheer))
    count=len(points)
    faces=[]
    for level in range(len(levels)-1):
        faces.extend((level*count+i,level*count+(i+1)%count,(level+1)*count+(i+1)%count,(level+1)*count+i) for i in range(count))
    cap_materials=[]
    stations=sorted(set(y for _,y in points))
    for bottom in [True,False]:
        offset=0 if bottom else (len(levels)-1)*count
        for first,second in zip(stations,stations[1:]):
            a=[i for i,(_,y) in enumerate(points) if abs(y-first)<1e-7]
            b=[i for i,(_,y) in enumerate(points) if abs(y-second)<1e-7]
            left_a=min(a,key=lambda i:points[i][0]);right_a=max(a,key=lambda i:points[i][0])
            left_b=min(b,key=lambda i:points[i][0]);right_b=max(b,key=lambda i:points[i][0])
            face=tuple(dict.fromkeys(offset+i for i in (left_a,right_a,right_b,left_b)))
            faces.append(tuple(reversed(face)) if bottom else face)
            cap_materials.append(0 if bottom else 1)
    obj=mesh('faceted-armored-hull',vertices,faces,FLEET_HULL)
    obj.data.materials.append(FLEET_EDGE)
    for face in obj.data.polygons:
        sides=(len(levels)-1)*count
        face.material_index=cap_materials[face.index-sides] if face.index>=sides else int(face.index>=(len(levels)-2)*count)
    top_gain=.76 if family=='tumblehome' else .94
    weather_deck('inset-weather-deck',hull_outline(beam*top_gain,length*.975,profile),.313,.045,FLEET_DECK,length,profile)
    if profile['geometry'].get('hullStyle')=='forecastle':
        weather_deck('raised-forecastle',[(x,y) for x,y in hull_outline(beam*.86,length*.975,profile) if y>=0],.37,.06,FLEET_EDGE,length,profile)
    # An uninterrupted shell replaces the repeated six-dot porthole row.
    # Fairleads belong on the foredeck; modern and stealth shells stay flush.
    if family not in ('tumblehome','planing'):
        for side in [-1,1]:
            anchor=box('recessed-anchor-hawse',(side*beam*.44,length*.85,.305+hull_sheer(length*.85,length,profile)),(.055,.11,.012),FLEET_INK)
            anchor.rotation_euler.z=side*.34


def gunhouse(size,profile):
    navy=profile['navy'] if profile else 'us'
    year=profile['year'] if profile else 1944
    # Separate shield plans and sloped roofs, within the authored battery envelope.
    plans={
        'us':[(-.50,.18),(-.36,.38),(.36,.38),(.50,.18),(.50,-.21),(.31,-.38),(-.31,-.38),(-.50,-.21)],
        'gb':[(-.50,.28),(-.40,.38),(.40,.38),(.50,.28),(.46,-.30),(.32,-.38),(-.32,-.38),(-.46,-.30)],
        'jp':[(-.42,.38),(.42,.38),(.50,.13),(.40,-.38),(-.40,-.38),(-.50,.13)],
        'de':[(-.50,.29),(-.37,.38),(.37,.38),(.50,.29),(.50,-.29),(.32,-.38),(-.32,-.38),(-.50,-.29)],
        'it':[(-.50,.11),(-.44,.29),(-.28,.38),(.28,.38),(.44,.29),(.50,.11),(.42,-.38),(-.42,-.38)],
        'fr':[(-.50,.38),(.50,.38),(.50,-.21),(.34,-.38),(-.34,-.38),(-.50,-.21)],
        'su':[(-.44,.38),(.44,.38),(.50,-.28),(.32,-.38),(-.32,-.38),(-.50,-.28)],
    }
    modern=navy=='us' and year>=1975
    plan=plans['de'] if modern else plans.get(navy,plans['gb'])
    gain=.78 if modern else .84 if navy=='jp' else .90
    vertices=[]
    for height,scale in [(.10,1),(.22,1),(.28,gain)]:
        vertices.extend((px*size*scale,py*size*scale,height) for px,py in plan)
    count=len(plan)
    faces=[tuple(reversed(range(count)))]
    for level in range(2):faces.extend((level*count+i,level*count+(i+1)%count,(level+1)*count+(i+1)%count,(level+1)*count+i) for i in range(count))
    faces.append(tuple(range(2*count,3*count)))
    obj=mesh('gunhouse-'+('modern-us' if modern else navy),vertices,faces,FLEET_EDGE)
    obj.data.materials.append(FLEET_ROOF)
    obj.data.polygons[-1].material_index=1
    deckhouse('gunhouse-roof-access',0,-size*.18,.281,size*.23,size*.17,.012,FLEET_ROOF)
    if not modern:
        for side in [-1,1]:
            box('turret-side-sighting-hood',(side*size*.47,-size*.10,.23),(size*.09,size*.20,.07),FLEET_HULL)


def naval_gun(name, x, y, z, barrels=2, heavy=False, open_mount=False, stealth=False,profile=None):
    global root
    previous=root
    mount=group(name,(x,y,z));root=mount
    aa=name.startswith('turret_aa')
    size=(.66 if barrels==4 else .58) if heavy else (.30 if barrels>2 else .25) if aa else .44 if barrels==4 else .38 if barrels==3 else .34 if barrels==2 else .28
    mount['gun_barrels']=barrels
    mount['main_battery']=not aa
    # Keep the upper bearing fixed while extending the foot through the deck.
    fleet_cylinder('traversing-barbette',(0,0,.0175),size*.62,.135,FLEET_INK)
    deckhouse('gunhouse-shadow',.025,-.02,.07,size*1.06,size*.84,.05,FLEET_INK)
    if stealth:
        tapered_house('faceted-ags-gun-shield',size*1.25,size*1.20,.07,.25,.62)
    elif open_mount:
        deckhouse('open-gun-platform',0,-.02,.10,size,size*.72,.045,FLEET_INK)
        box('splinter-shield',(0,.10,.22),(size,.06,.25),FLEET_EDGE)
        for side in [-1,1]: box('shield-wing',(side*size*.43,.025,.22),(.04,.18,.25),FLEET_EDGE)
    else:
        gunhouse(size,profile)
    for i in range(barrels):
        offset=(i-(barrels-1)/2)*(.14 if heavy else .11)
        reach=.52 if heavy else .20 if aa else .34
        front=.13 if open_mount else size*.60*(1-.38*.52) if stealth else size*.38
        start=front+.035
        fleet_cylinder('naval-gun-barrel',(offset,start+reach/2,.20),.028 if heavy else .021,reach,FLEET_INK,'Y')
        fleet_cylinder('gun-sleeve',(offset,start,.20),.043 if heavy else .03,.18,FLEET_EDGE,'Y')
        fleet_cylinder('gun-muzzle-mouth',(offset,start+reach+.004,.20),.020 if heavy else .014,.012,FLEET_INK,'Y')
        box('barrel-top-highlight',(offset,start+.02+reach/2,.224),(.018,reach*.78,.009),FLEET_ROOF)
    # Seat the cap in the .28 gunhouse roof; the smaller rear pad need not
    # extend under the entire cap on every turret size.
    if not aa and not open_mount: deckhouse('turret-access-hatch',0,-.045,.279,size*.24,size*.19,.012,FLEET_EDGE)
    root=previous
    return mount


def funnel(x,y,scale=1,section='oval',character=None):
    deckhouse('funnel-base',x+.015,y-.02,.31,.38*scale,.46*scale,.045,FLEET_EDGE)
    contour=[(math.cos(i*math.tau/12),math.sin(i*math.tau/12)) for i in range(12)]
    if section=='trunked':contour=[(-.70,-1),(.70,-1),(1,-.70),(1,.70),(.70,1),(-.70,1),(-1,.70),(-1,-.70)]
    vertices=[]
    height=.415 if section=='round' else .37*scale
    rx=.16 if section=='round' else .145
    ry=rx if section=='round' else .19
    rake_gain=-.16
    if character:
        wide,long,tall,rake_gain=character
        rx*=wide;ry*=long;height*=tall
    for z,gain in [(.355,1),(.355+height*.89,.94),(.355+height,1.04),(.355+height,.77),(.355+height*.76,.77)]:
        rake=(z-.355)*rake_gain
        vertices.extend((x+u*rx*scale*gain,y+v*ry*scale*gain+rake,z) for u,v in contour)
    count=len(contour);faces=[tuple(reversed(range(count)))]
    for ring in range(4):
        faces.extend((ring*count+i,ring*count+(i+1)%count,(ring+1)*count+(i+1)%count,(ring+1)*count+i) for i in range(count))
    faces.append(tuple(range(4*count,5*count)))
    obj=mesh('rolled-rim-funnel',vertices,faces,FLEET_EDGE)
    obj.data.materials.append(FLEET_ROOF);obj.data.materials.append(FLEET_INK)
    for polygon in obj.data.polygons:
        if polygon.index>2*count:polygon.material_index=2
        elif polygon.index>count:polygon.material_index=1
    if character:
        for side in [-1,1]:
            for station in [-.07,.04]:
                box('funnel-casing-vent',(x+side*rx*scale*.98,y+station*scale,.40),(.011,.055*scale,.045),FLEET_INK)
        if section=='round':fleet_cylinder('funnel-casing-ring',(x,y+.075*rake_gain,.43),rx*scale*1.02,.012,FLEET_EDGE)
        else:deckhouse('funnel-lower-casing-collar',x,y+.075*rake_gain,.43,rx*scale*2.03,ry*scale*2.03,.012,FLEET_EDGE,.35)
    return obj


def lifeboat(x,y,scale=1,covered=False):
    deckhouse('lifeboat-cradle',x,y,.32,.14*scale,.42*scale,.027,FLEET_INK)
    outline=[(-.065,-.16),(0,-.23),(.065,-.16),(.065,.16),(0,.23),(-.065,.16)]
    vertices=[]
    for z,gain in [(.35,.50),(.41,1),(.41,.71),(.365,.55)]:
        vertices.extend((x+px*scale*gain,y+py*scale*gain,z) for px,py in outline)
    faces=[]
    for ring in range(3):faces.extend((ring*6+i,ring*6+(i+1)%6,(ring+1)*6+(i+1)%6,(ring+1)*6+i) for i in range(6))
    faces.append(tuple(range(18,24)))
    mesh('clinker-launch-hull',vertices,faces,FLEET_MARK)
    if covered:
        deckhouse('motor-launch-cabin',x,y-.015,.405,.095*scale,.22*scale,.055,FLEET_ROOF,.24)
        box('launch-windscreen',(x,y+.096*scale,.444),(.065*scale,.009,.025),FLEET_GLASS)
    else:
        for station in [-.105,0,.105]:box('boat-thwart',(x,y+station*scale,.405),(.10*scale,.023*scale,.013),FLEET_PLANK)
    side=1 if x>0 else -1
    for station in [-.16,.16]:
        structural_rod('boat-davit-upright',(x-side*.08*scale,y+station*scale,.33),(x-side*.08*scale,y+station*scale,.48),.009,FLEET_EDGE)
        structural_rod('boat-davit-head',(x-side*.08*scale,y+station*scale,.48),(x,y+station*scale,.48),.009,FLEET_EDGE)


def deck_fittings(beam, length, profile,teak=False,modern=False):
    # Large directional seams survive the 240px raster; no tiny text or rivet noise.
    if teak:
        for i in range(-3,4):
            x=i*beam*.19
            box('teak-deck-seam',(x,-length*.06,.34),(.024,length*1.36,.006),FLEET_PLANK)
    if not modern:
        for y in [length*.70,-length*.83]:
            for side in [-1,1]:
                x=side*beam*.43
                if profile['id']=='pt-109':
                    box('low-deck-cleat',(x,y,.345),(.055,.015,.012),FLEET_EDGE)
                else:
                    for offset in [-.024,.024]:fleet_cylinder('twin-mooring-bitt',(x+offset,y,.346),.014,.035,FLEET_INK)
                    box('bitt-foundation',(x,y,.331),(.09,.045,.009),FLEET_HULL)
    deckhouse('bow-anchor-capstan',0,length*.82,.32,.13,.20,.055,FLEET_EDGE)
    for side in [-1,1]:
        for i in range(3):
            box('anchor-chain',(side*.10,length*(.79+i*.035),.33),(.023,.045,.015),FLEET_INK)
        box('deck-edge-walkway',(side*beam*.76,-length*.20,.329),(.05,length*.91,.014),FLEET_EDGE)


def machinegun_tub(x,y,radius):
    vertices=[]
    for z,gain in [(.35,1),(.41,1),(.41,.74),(.35,.74)]:
        vertices.extend((x+math.cos(i*math.tau/16)*radius*gain,y+math.sin(i*math.tau/16)*radius*gain,z) for i in range(16))
    faces=[]
    for ring in range(3):faces.extend((ring*16+i,ring*16+(i+1)%16,(ring+1)*16+(i+1)%16,(ring+1)*16+i) for i in range(16))
    mesh('open-machinegun-tub',vertices,faces,OLIVE)


def patrol_cabin(beam,length,profile):
    global root
    previous=root
    root=group('patrol-wheelhouse',(0,profile['geometry']['bridgeY']*length,.33))
    deckhouse('plywood-cabin-coaming',0,0,0,beam*1.14,.48,.12,OLIVE,.12)
    deckhouse('low-cabin-roof',0,-.05,.12,beam*.94,.34,.035,CAMO,.12)
    for side in [-1,1]:
        structural_rod('windshield-post',(side*beam*.50,.17,.105),(side*beam*.48,.14,.30),.012,OLIVE)
        # The side posts lean inward at the top. Flare only the lower pane
        # corners so the glass enters each post over the whole exposed edge.
        outline=[(side*beam*.005,.105),(side*beam*.51,.105),
                 (side*beam*.475,.295),(side*beam*.005,.295)]
        vertices=[(x,y,z) for y in [.145,.163] for x,z in outline]
        faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        mesh('pilot-windshield',vertices,[tuple(reversed(face)) for face in faces] if side<0 else faces,FLEET_GLASS)
    structural_rod('windshield-top',(-beam*.49,.14,.30),(beam*.49,.14,.30),.012,OLIVE)
    structural_rod('short-radio-mast',(0,-.10,.145),(0,-.10,.65),.014,OLIVE)
    root=previous
    deckhouse('engine-room-cover',0,-length*.32,.315,beam*1.18,length*.26,.110,OLIVE,.08)


def aa_station_geometry(profile,beam,flattop,part_id):
    global root
    g=profile['geometry']
    if flattop:
        # Keep the gameplay anchor; the small side shelf spans the anchor and deck edge.
        side=-1 if part_id=='aa-port' else 1
        root.scale=(1,1,1)
        deckhouse('side-gallery-support',side*beam*.12,0,-.12,beam*.34,.24,.10,FLEET_HULL,.10)
        deckhouse('side-gallery-deck',side*beam*.12,0,-.025,beam*.34,.25,.022,FLEET_EDGE,.10)
        if g.get('paddleWheels') or profile['id'] in ('enterprise-nuclear','forrestal'):
            fleet_cylinder('unarmed-gallery-director',(0,0,.035),beam*.10,.10,FLEET_EDGE)
            return
        if g.get('aviation')=='jet' and profile['year']>=1980:
            fleet_cylinder('ciws-pedestal',(side*beam*.10,0,.03),beam*.075,.10,FLEET_ROOF)
            if side>0:
                sphere('ciws-radar-dome',(side*beam*.10,0,.18),(beam*.075,.07,.105),FLEET_ROOF,12)
                structural_rod('ciws-barrel-cluster',(side*beam*.10,.04,.09),(side*beam*.10,.21,.09),.013,FLEET_INK)
            else:
                deckhouse('missile-launcher-yoke',side*beam*.10,0,.04,beam*.16,.15,.05,FLEET_HULL)
                for column in [-1,1]:
                    for row in [-1,1]:
                        box('point-defence-launch-cell',(side*beam*.10+column*beam*.045,.02,row*.022+.13),(beam*.075,.16,.045),FLEET_EDGE)
                        box('launch-cell-mouth',(side*beam*.10+column*beam*.045,.104,row*.022+.13),(beam*.060,.009,.028),FLEET_INK)
            return
        mount=naval_gun('turret_aa_'+part_id,side*beam*.10,0,0,1 if profile['id']=='forrestal' else 3 if profile['navy']=='jp' else 2,False,profile['year']<1940,profile=profile)
        mount.scale=(min(.55,beam*.68),)*3
    elif profile['id']=='pt-109':
        fleet_cylinder('open-aa-pedestal',(0,0,.035),.045,.10,OLIVE)
        structural_rod('stern-aa-barrel',(0,.015,.11),(0,.26,.13),.012,FLEET_INK)
        box('open-aa-breech',(0,0,.11),(.055,.09,.055),OLIVE)
    elif g.get('radar')=='stealth':
        tapered_house('flush-remote-weapon-housing',beam*.27,.22,0,.15,.65)
        structural_rod('single-remote-weapon-barrel',(0,.07,.11),(0,.28,.11),.012,FLEET_INK)
    elif profile['year']>=1975 and g.get('radar'):
        fleet_cylinder('ciws-base',(0,0,.02),beam*.11,.08,FLEET_EDGE)
        sphere('ciws-search-radome',(0,0,.16),(.055,.055,.09),FLEET_ROOF,12)
        structural_rod('close-in-barrel',(0,.02,.08),(0,.22,.08),.012,FLEET_INK)
    else:
        deckhouse('aa-sponson',0,0,-.035,.25,.26,.065,FLEET_HULL)
        fleet_cylinder('aa-bulwark',(0,0,.035),.12,.055,FLEET_EDGE)
        mount=naval_gun('turret_aa_'+part_id,0,0,.04,1 if profile['hull']=='patrol-boat' else 3 if profile['navy']=='jp' else 2,False,True,profile=profile)
        mount.scale=(.62,)*3


def light_aa_station(profile,beam,flattop,part_id):
    global root
    g=profile['geometry']
    direct=(flattop and (g.get('paddleWheels') or profile['id'] in ('enterprise-nuclear','forrestal') or g.get('aviation')=='jet' and profile['year']>=1980)) or (not flattop and (profile['id']=='pt-109' or g.get('radar')=='stealth' or profile['year']>=1975 and g.get('radar')))
    previous=root
    if direct:
        root=group('turret_aa_'+part_id)
        root['main_battery']=False
    try:
        aa_station_geometry(profile,beam,flattop,part_id)
    finally:
        root=previous


def parked_plane(x,y,paint,jet=False):
    for side in [-1,1]:
        gx=x+side*(.10 if jet else .13);gy=y+(-.08 if jet else .02)
        structural_rod('parked-main-gear',(gx,gy,.10),(gx,gy,.018),.008,FLEET_INK)
        fleet_cylinder('parked-main-wheel',(gx,gy,.018),.018,.016,FLEET_INK,'X')
    gy=y+(.23 if jet else -.20)
    structural_rod('parked-nose-or-tail-gear',(x,gy,.105 if jet else .09),(x,gy,.014),.007,FLEET_INK)
    fleet_cylinder('parked-nose-or-tail-wheel',(x,gy,.014),.014,.014,FLEET_INK,'X')
    if jet:
        wing('parked-jet-swept-wing',[(x,y+.24),(x-.29,y-.08),(x-.29,y-.17),(x,y-.07),(x+.29,y-.17),(x+.29,y-.08)],.12,.035,paint)
        body=fuselage('parked-jet-airframe',[(y-.27,.045,.045,.10),(y-.12,.066,.057,.11),(y+.10,.047,.052,.11),(y+.27,.020,.025,.12),(y+.36,.004,.006,.12)],paint)
        body.location.x=x
        wing('parked-jet-tailplane',[(x-.15,y-.27),(x-.12,y-.17),(x,y-.20),(x+.12,y-.17),(x+.15,y-.27)],.13,.025,paint)
        sphere('parked-jet-canopy',(x,y+.10,.17),(.037,.09,.035),FLEET_GLASS,12)
        for side in [-1,1]:
            fx=x+side*.045
            mesh('parked-jet-fin',[(fx-.006,y-.25,.12),(fx+.006,y-.25,.12),(fx-.006,y-.22,.30),(fx+.006,y-.22,.30),(fx-.006,y-.12,.14),(fx+.006,y-.12,.14)],[(0,2,4),(1,5,3),(0,1,3,2),(2,3,5,4),(4,5,1,0)],paint)
            fleet_cylinder('parked-jet-exhaust',(fx,y-.275,.11),.025,.025,FLEET_INK,'Y')
        return
    wing('parked-aircraft-wing',[(x-.055,y+.10),(x-.29,y+.045),(x-.30,y-.075),(x-.055,y-.10),(x+.055,y-.10),(x+.30,y-.075),(x+.29,y+.045),(x+.055,y+.10)],.105,.035,paint)
    body=fuselage('parked-aircraft-airframe',[(y-.25,.012,.018,.09),(y-.12,.036,.039,.10),(y+.11,.055,.050,.11),(y+.22,.045,.045,.11)],paint)
    body.location.x=x
    wing('parked-aircraft-tail',[(x-.12,y-.25),(x+.12,y-.25),(x+.13,y-.17),(x-.13,y-.17)],.115,.025,paint)
    sphere('parked-canopy',(x,y+.015,.158),(.035,.07,.028),FLEET_GLASS,12)
    fleet_cylinder('parked-engine-cowl',(x,y+.21,.11),.046,.045,FLEET_EDGE,'Y')
    structural_rod('parked-propeller',(x-.125,y+.240,.11),(x+.125,y+.240,.11),.010,FLEET_INK)
    mesh('parked-tail-fin',[(x-.008,y-.25,.09),(x+.008,y-.25,.09),(x-.008,y-.23,.23),(x+.008,y-.23,.23),(x-.008,y-.13,.11),(x+.008,y-.13,.11)],[(0,2,4),(1,5,3),(0,1,3,2),(2,3,5,4),(4,5,1,0)],paint)
    for side in [-1,1]:fleet_cylinder('parked-wing-mark',(x+side*.20,y-.015,.116),.03,.012,FLEET_MARK)


def wreck_part(part_id):
    # Torn plates and broken beams replace the former large black disk.
    width,length=(.92,1.22) if part_id=='flight-deck' else (.38,.35)
    points=[(-width*.5,-length*.4),(-width*.18,-length*.5),(width*.4,-length*.45),(width*.5,-length*.05),(width*.31,length*.5),(-width*.3,length*.4),(-width*.48,length*.1)]
    wing('torn-deck-opening',points,.025,.035,FLEET_INK)
    for i,side in enumerate([-1,1]):
        obj=deckhouse('buckled-steel-plate',side*width*.30,side*length*.18,.023,width*.37,length*.32,.05,FLEET_RUST)
        obj.rotation_euler.z=side*.23
    box('exposed-deck-beam',(0,0,.045),(width*.78,.035,.045),FLEET_EDGE)


def seat_ruin_bases(collection):
    # The intact part disappears in this state. Use only permanent solids,
    # after sheer and height transforms, to anchor each torn base.
    def permanent(obj):
        parent=obj
        while parent:
            if 'game_part' in parent or 'game_ruin' in parent:return False
            parent=parent.parent
        return True
    bpy.context.view_layer.update()
    vertices=[];faces=[]
    for obj in collection.objects:
        if obj.type!='MESH' or not permanent(obj):continue
        offset=len(vertices)
        vertices.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset+i for i in face.vertices) for face in obj.data.polygons)
    surface=BVHTree.FromPolygons(vertices,faces)
    for ruin in [obj for obj in collection.objects if 'game_ruin' in obj]:
        base=next(obj for obj in ruin.children if obj.name.startswith('torn-deck-opening'))
        points=[base.matrix_world@vertex.co for vertex in base.data.vertices]
        bottom=min(point.z for point in points);top=max(point.z for point in points)
        gaps=[]
        for face in base.data.polygons:
            corners=[points[i] for i in face.vertices]
            if any(abs(point.z-bottom)>.00001 for point in corners):continue
            centre=sum(corners,Vector())/len(corners)
            hit,_,_,_=surface.ray_cast(Vector((centre.x,centre.y,top+.0001)),Vector((0,0,-1)))
            if hit is not None:gaps.append(bottom-hit.z)
        if not gaps:raise ValueError(f'{ruin.name}: no permanent support below torn base')
        gap=min(gaps)
        if gap>-.0002:ruin.location.z-=gap+.001
    bpy.context.view_layer.update()


def jet_carrier_island(profile,beam):
    g=profile['geometry'];modern_ford=profile['id']=='gerald-ford'
    width=beam*(.24 if modern_ford else .28 if profile['id']=='enterprise-nuclear' else .26)
    length=.66 if modern_ford else 1.04
    deckhouse('carrier-island-lower-house',0,-.12,-.02,width,length,.19,FLEET_EDGE,.10)
    deckhouse('carrier-gallery',0,-.045,.17,width*1.04,length*.76,.045,FLEET_ROOF,.10)
    deckhouse('carrier-navigation-house',0,.015,.215,width*.92,length*.63,.24,FLEET_EDGE,.12)
    box('carrier-bridge-glazing',(0,length*.328,.34),(width*.82,.018,.075),FLEET_GLASS)
    for side in [-1,1]:box('carrier-bridge-side-glazing',(side*width*.46,.04,.34),(.012,length*.45,.075),FLEET_GLASS)
    deckhouse('carrier-bridge-roof',0,.01,.455,width*.99,length*.67,.045,FLEET_ROOF,.14)
    if g.get('radar')=='planar':
        deckhouse('early-enterprise-array-block',0,-.06,.50,width*.98,.43,.35,FLEET_EDGE,.05)
        for side in [-1,1]:
            box('enterprise-flat-array',(side*width*.50,-.06,.68),(.010,.31,.25),FLEET_INK)
            box('enterprise-array-face',(0,-.06+side*.215,.68),(width*.82,.010,.25),FLEET_INK)
        fleet_cylinder('array-block-mast',(0,-.06,.96),.025,.26,FLEET_EDGE)
        return
    if modern_ford:
        tapered_house('ford-integrated-sensor-house',width*.86,.32,.50,.36,.88)
        for side in [-1,1]:box('ford-embedded-array',(side*width*.39,.04,.68),(.014,.20,.18),FLEET_INK)
        fleet_cylinder('ford-top-mast',(0,-.06,.98),.025,.26,FLEET_EDGE)
        return
    if profile['id']=='forrestal':
        for x,y in [(-width*.30,-.28),(width*.30,-.28),(0,.03)]:structural_rod('forrestal-tripod-leg',(x,y,.50),(0,-.16,.99),.020,FLEET_EDGE)
        deckhouse('forrestal-radar-platform',0,-.16,.96,width*.80,.19,.035,FLEET_ROOF)
        fleet_cylinder('forrestal-radar-spindle',(0,-.16,1.06),.024,.16,FLEET_EDGE)
        box('forrestal-air-search-radar',(0,-.16,1.16),(width*1.14,.065,.12),FLEET_ROOF)
        return
    for station,top in [(-.32,1.05),(.20,.91)]:
        for side in [-1,1]:structural_rod('carrier-lattice-leg',(side*width*.30,station,.50),(0,station,top-.10),.018,FLEET_EDGE)
        for z in [.64,.78]:structural_rod('carrier-lattice-cross',(-width*.18,station,z),(width*.18,station,z),.014,FLEET_ROOF)
        fleet_cylinder('carrier-radar-spindle',(0,station,top-.05),.022,.16,FLEET_ROOF)
        box('carrier-air-search-array',(0,station,top+.015),(width*1.10,.055,.085),FLEET_ROOF)


def aegis_house(width,depth,all_faces=True):
    plan=[(-.50,-.28),(-.28,-.50),(.28,-.50),(.50,-.28),(.50,.28),(.28,.50),(-.28,.50),(-.50,.28)]
    vertices=[(x*width*gain,y*depth*gain,z) for z,gain in [(-.015,1),(.54,.87)] for x,y in plan]
    faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    shell=mesh('integral-aegis-deckhouse',vertices,faces,FLEET_EDGE)
    shell.data.materials.append(FLEET_ROOF);shell.data.polygons[1].material_index=1
    for edge in ([0,2,4,6] if all_faces else [4,6]):
        a=Vector((plan[edge][0]*width,plan[edge][1]*depth,0))
        b=Vector((plan[(edge+1)%8][0]*width,plan[(edge+1)%8][1]*depth,0))
        points=[]
        for fraction,z in [(.10,.19),(.90,.19),(.90,.40),(.10,.40)]:
            p=a.lerp(b,fraction)*(1-.13*(z-.015)/.525)*1.008
            points.append((p.x,p.y,z))
        mesh('embedded-spy-array',points,[(0,1,2,3)],FLEET_INK)
    box('aegis-navigation-glazing',(0,depth*.438,.49),(width*.48,.009,.045),FLEET_GLASS)
    fleet_cylinder('aegis-mast-spindle',(0,-depth*.13,.78),.020,.49,FLEET_EDGE)
    box('aegis-top-search-array',(0,-depth*.13,1.025),(width*.72,.045,.08),FLEET_ROOF)


def bridge_shell(name,levels,round_plan=False):
    # The bridge anchor sits above the deck. Extend only the foot into its
    # support, retaining the authored upper silhouette and gameplay anchor.
    if abs(levels[0][0]-.015)<1e-6:
        _,width,depth,station=levels[0]
        levels=[(-.015,width,depth,station),*levels[1:]]
    contour=[(math.cos(i*math.tau/12)*.5,math.sin(i*math.tau/12)*.5) for i in range(12)] if round_plan else [(-.50,-.30),(-.30,-.50),(.30,-.50),(.50,-.30),(.50,.28),(.28,.50),(-.28,.50),(-.50,.28)]
    vertices=[(x*width,y*depth+station,z) for z,width,depth,station in levels for x,y in contour]
    count=len(contour)
    faces=[tuple(reversed(range(count)))]
    for level in range(len(levels)-1):
        faces.extend((level*count+i,level*count+(i+1)%count,(level+1)*count+(i+1)%count,(level+1)*count+i) for i in range(count))
    faces.append(tuple(range((len(levels)-1)*count,len(levels)*count)))
    obj=mesh(name,vertices,faces,FLEET_EDGE)
    obj.data.materials.append(FLEET_ROOF);obj.data.polygons[-1].material_index=1
    return obj


def bridge_windows(width,depth,z,station=0,round_plan=False):
    # Continuous glazing follows the actual front and side facets of the bridge.
    bpy.context.view_layer.update()
    vertices=[];faces=[]
    for obj in current.objects:
        if obj.type!='MESH' or obj.parent!=root:continue
        offset=len(vertices)
        vertices.extend(obj.matrix_local@vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset+i for i in face.vertices) for face in obj.data.polygons)
    surface=BVHTree.FromPolygons(vertices,faces)
    def attached(x,y,height):
        direction=Vector((-x,station-y,0)).normalized()
        start=Vector((x,y,height))-direction*.03
        point,normal,_,_=surface.ray_cast(start,direction)
        if point is None:raise ValueError('Navigation glazing has no structural backing')
        return point+normal*.0014
    contour=[(math.cos(i*math.tau/12)*.5,math.sin(i*math.tau/12)*.5) for i in range(12)] if round_plan else [(-.50,-.30),(-.30,-.50),(.30,-.50),(.50,-.30),(.50,.28),(.28,.50),(-.28,.50),(-.50,.28)]
    for first,second in zip(contour,contour[1:]+contour[:1]):
        if first[1]<-.30 and second[1]<-.30:continue
        a=Vector((first[0]*width*1.006,first[1]*depth*1.006+station,0))
        b=Vector((second[0]*width*1.006,second[1]*depth*1.006+station,0))
        for start,end in [(.09,.45),(.55,.91)]:
            p=a.lerp(b,start);q=a.lerp(b,end)
            mesh('recessed-navigation-window',[attached(p.x,p.y,z),attached(q.x,q.y,z),attached(q.x,q.y,z+.042),attached(p.x,p.y,z+.042)],[(0,1,2,3)],FLEET_GLASS)


def small_combatant_bridge(profile,width,style):
    hull=profile['hull'];navy=profile['navy'];identity=profile['id'];g=profile['geometry']
    if profile['year']>=1950 or g.get('radar') in ('aegis','stealth','planar'):return False
    cruiser=hull=='cruiser' and navy=='us'
    destroyer=hull=='destroyer'
    if not (cruiser or destroyer):return False
    # Body heights carry the silhouette at 192px. Keep the previous X/Y envelope.
    rounded=False;director=.13;upper_width=.82;depth=.34;station=-.025
    if cruiser:
        if identity in ('atlanta','oakland','juneau','worcester'):
            height=.75;upper_width=.62;rounded=False
            levels=[(.015,width,.42,0),(.19,width,.42,0),(.23,width*.78,.36,0),(.45,width*.78,.36,0),(.49,width*upper_width,.29,station),(height,width*upper_width,.29,station)]
        elif identity in ('omaha','pensacola','northampton'):
            height=.54;upper_width=.88;rounded=True
            levels=[(.015,width,.42,0),(.22,width,.42,0),(.26,width*upper_width,depth,0),(height,width*upper_width,depth,0)]
        else:
            height=.66 if identity in ('cleveland','fargo','baltimore','oregon-city','des-moines','alaska') else .58
            levels=[(.015,width,.42,0),(.23,width,.42,0),(.27,width*.92,.37,0),(.43,width*.92,.37,0),(.47,width*upper_width,depth,station),(height,width*upper_width,depth,station)]
    elif navy=='us':
        if identity in ('sampson','caldwell','wickes','clemson'):
            height=.30;upper_width=.92;rounded=False
            levels=[(.015,width,.40,0),(.15,width,.40,0),(.19,width*upper_width,depth,0),(height,width*upper_width,depth,0)]
        elif identity in ('porter','somers'):
            height=.66;upper_width=.72;rounded=False
            levels=[(.015,width,.42,0),(.23,width,.42,0),(.27,width*.90,.36,0),(.46,width*.90,.36,0),(.50,width*upper_width,depth,station),(height,width*upper_width,depth,station)]
        elif identity=='fletcher':
            height=.57;upper_width=.94;rounded=False
            levels=[(.015,width,.42,0),(.20,width,.42,0),(.24,width*upper_width,.38,0),(height,width*upper_width,.38,0)]
        elif identity in ('allen-sumner','gearing'):
            height=.62;upper_width=.88;rounded=False
            levels=[(.015,width,.42,0),(.24,width,.42,0),(.28,width*upper_width,.37,0),(height,width*upper_width,.37,0)]
        else:
            height=.50 if identity=='sims' else .46 if identity in ('farragut-1934','mahan','gridley','bagley','benham') else .54
            upper_width=.90;rounded=True
            levels=[(.015,width,.42,0),(.20,width,.42,0),(.24,width*upper_width,depth,0),(height,width*upper_width,depth,0)]
    elif navy in ('gb','ca','au','nz','no','pl'):
        height=.47;upper_width=1.05;rounded=True
        levels=[(.015,width*.96,.42,0),(.18,width*.96,.42,0),(.22,width*upper_width,.36,0),(height,width*upper_width,.36,0)]
    elif navy=='jp':
        height=.67;upper_width=.60;rounded=False
        levels=[(.015,width*.96,.42,0),(.22,width*.96,.42,0),(.26,width*.80,.35,0),(.44,width*.80,.35,0),(.48,width*upper_width,.28,station),(height,width*upper_width,.28,station)]
    elif navy=='fr':
        height=.54;upper_width=.92;rounded=False
        levels=[(.015,width,.42,0),(.20,width,.42,0),(.24,width*upper_width,.36,0),(height,width*upper_width,.36,0)]
    elif navy=='it':
        height=.43;upper_width=.95;rounded=True
        levels=[(.015,width,.42,0),(.16,width,.42,0),(.20,width*upper_width,.37,0),(height,width*upper_width,.37,0)]
    else:
        height=.52;upper_width=.84;rounded=navy in ('su','nl')
        levels=[(.015,width,.42,0),(.20,width,.42,0),(.24,width*upper_width,depth,0),(height,width*upper_width,depth,0)]
    house=bridge_shell('class-navigation-superstructure',levels,rounded)
    house.data.materials.append(FLEET_HULL)
    for face in house.data.polygons:
        if face.center.z<.20:face.material_index=2
    top_z,top_width,top_depth,top_station=levels[-1]
    bridge_windows(top_width,top_depth,top_z-.085,top_station,rounded)
    deckhouse('class-compass-platform',0,top_station,top_z,width*1.18,.39,.033,FLEET_ROOF,.26)
    # A raised open bulwark gives the navigating platform an actual rim.
    for side in [-1,1]:
        box('compass-bridge-wing-bulwark',(side*width*.54,top_station,top_z+.057),(.018,.28,.07),FLEET_EDGE)
    bridge_shell('class-optical-director-pedestal',[(top_z+.033,width*.34,.19,-.07),(top_z+.033+director,width*.31,.18,-.07)])
    box('class-optical-rangefinder',(0,-.07,top_z+.033+director),(width*.91,.065,.045),FLEET_ROOF)
    if not g.get('radar'):
        mast_top=1.15 if cruiser or style=='tripod' or identity in ('porter','somers') else 1.03
        if style=='tripod' or navy in ('gb','ca','fr'):
            for x,y in [(-width*.31,-.16),(width*.31,-.16),(0,.11)]:
                structural_rod('class-tripod-leg',(x,y,top_z+.035),(0,-.10,mast_top-.025),.017,FLEET_EDGE)
        else:
            structural_rod('class-pole-mast',(0,-.13,top_z+.035),(0,-.13,mast_top),.020,FLEET_EDGE)
        box('class-main-yardarm',(0,-.10 if style=='tripod' or navy in ('gb','ca','fr') else -.13,mast_top-.04),(width*1.05,.027,.025),FLEET_ROOF)
        if cruiser:
            box('cruiser-upper-yardarm',(0,-.10,mast_top-.01),(width*.62,.025,.023),FLEET_ROOF)
    return True


# Structural feet overlap the lower solids; keep authored roof heights fixed.
def bridge_character(profile,width,style):
    navy=profile['navy'];identity=profile['id'];hull=profile['hull'];radar=profile['geometry'].get('radar')
    capital=hull=='battleship'
    british=navy in ('gb','ca','au','nz','no','pl')
    if small_combatant_bridge(profile,width,style):return
    if style=='island':
        length=.52 if navy in ('us','gb') else .38
        bridge_shell('carrier-navigation-island',[(.015,width,length,-.04),(.15,width,length,-.04),(.19,width*.86,length*.88,-.02),(.34,width*.86,length*.88,-.02)])
        bridge_windows(width*.86,length*.88,.265,-.02)
        deckhouse('island-open-compass-platform',0,-.035,.34,width*1.13,length*.80,.035,FLEET_ROOF,.24)
        bridge_shell('island-director-pedestal',[(.375,width*.47,.19,-.08),(.57,width*.40,.17,-.08)])
        if navy=='jp':
            fleet_cylinder('island-light-pole',(0,-.10,.79),.018,.45,FLEET_EDGE)
        elif navy=='gb':
            for side in [-1,1]:structural_rod('island-tripod-support',(side*width*.32,-.15,.37),(0,-.12,.92),.015,FLEET_EDGE)
            fleet_cylinder('island-director',(0,-.10,.69),width*.26,.12,FLEET_EDGE)
        else:
            fleet_cylinder('carrier-period-mast',(0,-.14,.84),.020,.55,FLEET_EDGE)
            box('island-director-rangefinder',(0,-.08,.57),(width*1.10,.07,.045),FLEET_ROOF)
        box('carrier-signal-yard',(0,-.13,.915 if navy=='gb' else .97),(width*1.15,.030,.026),FLEET_ROOF)
        return
    if style=='pagoda':
        factors={'nagato':[1.12,.91,1.22,.84,.72],'kongo':[1,.86,1.02,.77,.59],'mogami':[.95,1.09,.79,.69]}
        floors=factors.get(identity,[1,.94,.83,.73])
        step=.16 if capital else .135
        top=.17+step*len(floors)
        bridge_shell('pagoda-armoured-core',[(.015,width*.88,.38,0),(.18,width*.57,.28,-.025),(top,width*.35,.21,-.05)])
        for i,factor in enumerate(floors):
            z=.18+i*step;station=-.01-i*.014
            bridge_shell('pagoda-observation-level',[(z,width*factor,.30,station),(z+.075,width*factor,.30,station)],True)
            deckhouse('pagoda-overhanging-eave',0,station,z+.075,width*(factor+.10),.34,.023,FLEET_ROOF,.26)
            if i in (0,len(floors)-1):bridge_windows(width*factor,.30,z+.026,station,True)
        box('pagoda-top-rangefinder',(0,-.07,top+.025),(width*1.02,.07,.055),FLEET_ROOF)
        fleet_cylinder('pagoda-signal-mast',(0,-.09,top+.18),.022,.38,FLEET_EDGE)
        return
    if capital and navy=='jp':
        # Yamato-family rounded command tower and broad optical rangefinder.
        bridge_shell('japanese-command-tower',[(.015,width*.88,.42,0),(.23,width*.86,.40,0),(.36,width*.60,.29,-.01),(.71,width*.44,.25,-.03),(.80,width*.62,.30,-.03)],True)
        for z,gain in [(.23,.98),(.43,.72),(.64,.58)]:
            bridge_shell('rounded-observation-platform',[(z,width*gain,.35,0),(z+.035,width*gain,.35,0)],True)
        bridge_windows(width*.86,.40,.16,0,True)
        fleet_cylinder('main-optical-director',(0,-.03,.865),width*.23,.16,FLEET_EDGE)
        box('japanese-main-rangefinder',(0,-.03,.88),(width*1.26,.09,.065),FLEET_ROOF)
        fleet_cylinder('japanese-light-mast',(0,-.08,1.09),.020,.32,FLEET_EDGE)
    elif capital and navy=='it':
        bridge_shell('italian-cylindrical-command-tower',[(.015,width*.80,.42,0),(.17,width*.80,.42,0),(.28,width*.66,.35,0),(.68,width*.54,.30,-.015)],True)
        for z,gain in [(.17,1.10),(.38,.96),(.62,.80)]:
            bridge_shell('italian-round-bridge-balcony',[(z,width*gain,.43,0),(z+.04,width*gain,.43,0)],True)
        bridge_windows(width*.80,.42,.105,0,True)
        box('italian-director-head',(0,-.03,.745),(width*.63,.22,.15),FLEET_EDGE)
        box('italian-optical-rangefinder',(0,-.03,.81),(width*1.22,.065,.05),FLEET_ROOF)
        fleet_cylinder('italian-signal-pole',(0,-.10,1.015),.023,.40,FLEET_EDGE)
    elif navy=='de' and style=='tower':
        bridge_shell('german-armoured-conning-base',[(.015,width*.92,.42,0),(.19,width*.92,.42,0),(.30,width*.67,.32,.015)],True)
        tower_height=.83 if identity=='graf-spee' else .70
        bridge_shell('german-stepped-director-tower',[(.22,width*.64,.30,-.045),(.42,width*.81,.36,-.025),(.50,width*.72,.32,-.045),(tower_height,width*.45,.23,-.07)])
        bridge_windows(width*.81,.36,.435,-.025)
        deckhouse('german-wing-balcony',0,-.025,.40,width*1.17,.24,.035,FLEET_ROOF,.25)
        fleet_cylinder('german-rangefinder-turret',(0,-.07,tower_height+.055),width*.21,.12,FLEET_EDGE)
        box('german-rangefinder-arms',(0,-.07,tower_height+.10),(width*1.30,.075,.055),FLEET_ROOF)
        fleet_cylinder('german-pole-mast',(0,-.11,1.03),.020,.42,FLEET_EDGE)
    elif navy=='fr' and style=='tower':
        height=.80 if capital else .64
        bridge_shell('french-faceted-command-tower',[(.015,width,.42,0),(.21,width*.94,.40,0),(.29,width*.66,.32,-.03),(height,width*.48,.25,-.055)])
        for z,gain in [(.22,1.13),(.49,.86)]:
            deckhouse('french-traverse-platform',0,-.025,z,width*gain,.34,.035,FLEET_ROOF,.26)
        bridge_windows(width*.94,.40,.155)
        box('french-optical-director',(0,-.05,height+.06),(width*.60,.24,.12),FLEET_EDGE)
        box('french-rangefinder-beam',(0,-.05,height+.10),(width*1.15,.07,.05),FLEET_ROOF)
        foot=height+.10;top=1.21
        fleet_cylinder('french-signal-pole',(0,-.11,(foot+top)/2),.022,top-foot,FLEET_EDGE)
    elif capital and british:
        nelson=identity=='rodney'
        bridge_shell('british-armoured-tower',[(.015,width,.42,0),(.19,width,.42,0),(.24,width*.83,.38,0),(.57 if nelson else .45,width*.74,.34,-.02),(.70 if nelson else .57,width*.52,.25,-.045)])
        bridge_windows(width*.83,.38,.27)
        deckhouse('british-open-compass-bridge',0,0,.45,width*1.18,.31,.045,FLEET_ROOF,.25)
        fleet_cylinder('british-director-pedestal',(0,-.055,.695),width*.17,.26,FLEET_EDGE)
        box('british-director-control-top',(0,-.055,.84),(width*.50,.23,.12),FLEET_EDGE)
        box('british-rangefinder',(0,-.055,.87),(width*1.14,.065,.05),FLEET_ROOF)
        if style!='tripod':fleet_cylinder('british-pole-mast',(0,-.12,1.04),.022,.34,FLEET_EDGE)
    elif navy=='us' and style!='low':
        bridge_shell('american-tiered-navigation-house',[(.015,width,.43,0),(.16,width,.43,0),(.19,width*.86,.37,0),(.39,width*.86,.37,0),(.43,width*.64,.29,-.03),(.57,width*.64,.29,-.03)])
        bridge_windows(width*.86,.37,.31)
        deckhouse('american-command-wings',0,-.015,.40,width*1.22,.25,.037,FLEET_ROOF,.25)
        if not radar:
            bridge_shell('american-director-stalk',[(.57,width*.43,.22,-.06),(.78,width*.35,.19,-.06)])
            fleet_cylinder('american-optical-top',(0,-.06,.825),width*.25,.10,FLEET_EDGE)
            box('american-rangefinder',(0,-.06,.85),(width*1.16,.07,.055),FLEET_ROOF)
            fleet_cylinder('american-pole-mast',(0,-.12,1.045),.022,.38,FLEET_EDGE)
    else:
        # Open navigating bridges, round-front destroyer houses, and compact escorts.
        escort=hull=='patrol-boat'
        rounded=british or navy in ('it','nl','su')
        height=.26 if escort else .32 if style=='low' else .43
        width_gain=1.12 if british else .91 if navy=='jp' else 1
        bridge_shell('round-front-wheelhouse' if rounded else 'faceted-destroyer-wheelhouse',[(.015,width*width_gain,.42,0),(.14,width*width_gain,.42,0),(.17,width*.85,.35,0),(height,width*.85,.35,0)],rounded)
        bridge_windows(width*.85,.35,height-.075,0,rounded)
        deckhouse('open-navigating-bridge',0,-.015,height,width*1.20,.40,.035,FLEET_ROOF,.26)
        if navy=='jp':
            bridge_shell('japanese-enclosed-bridge-top',[(height+.035,width*.63,.27,-.04),(height+.25,width*.52,.24,-.055)])
        if escort:
            fleet_cylinder('escort-chartroom-vent',(0,-.11,height+.10),.035,.14,FLEET_EDGE)
        if style!='tripod' and not radar:
            if british or navy=='fr':
                for side in [-1,1]:structural_rod('mast-backstay',(side*width*.28,-.13,height+.035),(0,-.10,.94),.016 if hull=='destroyer' else .007,FLEET_EDGE)
            foot=min(.405,height+.025);top=.995
            fleet_cylinder('destroyer-signal-mast',(0,-.10,(foot+top)/2),.020,top-foot,FLEET_EDGE)
    if style=='tripod':
        for x,y in [(0,.13),(-width*.36,-.18),(width*.36,-.18)]:
            structural_rod('period-tripod-mast',(x,y,.27),(0,-.045,1.03),.022,FLEET_EDGE)
        fleet_cylinder('tripod-observation-top',(0,-.045,1.055),width*.33,.075,FLEET_EDGE)
        box('tripod-rangefinder',(0,-.045,1.1175),(width*1.08,.065,.055),FLEET_ROOF)
    if not radar:box('national-signal-yardarm',(0,-.10,1.01),(width*.93,.030,.027),FLEET_ROOF)


def historic_bridge(profile, beam):
    style=profile['geometry']['bridge']
    if style=='island' and profile['geometry'].get('aviation')=='jet':
        jet_carrier_island(profile,beam)
        return
    wide=profile['hull'] in ('battleship','fleet-carrier')
    width=.60 if wide else .45
    if style=='island': width=min(.37,beam*.24)
    width*=profile['geometry'].get('bridgeWidth',1)
    if profile['geometry'].get('islandless'):
        deckhouse('under-deck-control-station',0,0,-.20,.20,.36,.16,FLEET_EDGE)
        box('control-station-window',(0,.18,-.07),(.16,.025,.06),FLEET_GLASS)
        return
    radar=profile['geometry'].get('radar')
    if radar=='aegis':
        aegis_house(beam*1.30,.59,profile['id']!='ticonderoga')
        return
    if radar=='stealth':
        span=profile['shape']['halfLength']
        house_width=beam*1.20
        house_length=span*.80
        center=-span*.06
        house=tapered_house('integrated-stealth-deckhouse',house_width,house_length,.02,.66,.66)
        for vertex in house.data.vertices:vertex.co.y+=center
        deckhouse('stealth-deckhouse-foot',0,center,-.012,house_width,house_length,.038,FLEET_EDGE)
        deckhouse('stealth-roof-sensor',0,center-.08,.68,house_width*.30,.26,.07,FLEET_HULL)
        # Attach the array and window quads to the sloping shell planes.
        for side in [-1,1]:
            points=[]
            for y,z in [(center-.14,.30),(center+.10,.30),(center+.10,.46),(center-.14,.46)]:
                points.append((side*(house_width*.5*(1-.34*(z-.02)/.66)+.001),y,z))
            mesh('embedded-stealth-array',points,[(0,1,2,3)],FLEET_INK)
        front=[]
        for x,z in [(-house_width*.13,.55),(house_width*.13,.55),(house_width*.13,.60),(-house_width*.13,.60)]:
            front.append((x,center+house_length*.5*(1-.34*(z-.02)/.66)+.001,z))
        mesh('stealth-bridge-window',front,[(0,1,2,3)],FLEET_GLASS)
        for side in [-1,1]:
            door=[]
            for x,z in [(side*house_width*.34,.09),(side*.012,.09),(side*.012,.30),(side*house_width*.34,.30)]:
                door.append((x,center-house_length*.5*(1-.34*(z-.02)/.66)-.001,z))
            mesh('integrated-hangar-door',door,[(0,1,2,3)],FLEET_INK)
        return
    bridge_character(profile,width,style)
    radar_ships={'iowa','missouri','south-dakota','enterprise','essex','fletcher','cleveland','brooklyn','baltimore','warspite','king-george-v','rodney','belfast','renown','bismarck','tirpitz','scharnhorst','prinz-eugen','roma','yamato','musashi','nagato','kongo'}
    if profile['id'] in radar_ships:
        station,height=(-.14,1.09) if style=='island' else (-.10,.99) if profile['id']=='belfast' else (-.08,1.18) if profile['id'] in ('yamato','musashi') else (-.13,1.18 if style!='low' else .98)
        box('period-radar',(0,station,height),(.26,.055,.06),FLEET_EDGE)
    if radar:
        if radar in ('planar','aegis'):
            deckhouse('radar-array-house',0,-.08,.51,width*.85,.30,.36,FLEET_EDGE)
            for side in [-1,1]:
                box('phased-array-side',(side*width*.43,-.08,.70),(.018,.22,.22),FLEET_INK)
                box('phased-array-face',(0,-.08+side*.155,.70),(width*.60,.018,.22),FLEET_INK)
        else:
            low_postwar=style=='low' and profile['year']>=1950
            for side in [-1,1]:
                # The tiered house's wing spans z=.400..437; sink each foot into that roof.
                start=Vector((side*width*.38,-.10,.32 if low_postwar else .425));end=Vector((0,-.10,1.05));delta=end-start
                obj=fleet_cylinder('lattice-mast-leg',(start+end)/2,.016,delta.length,FLEET_EDGE if low_postwar else FLEET_INK)
                obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
            for z in [.66,.84]:box('lattice-cross-brace',(0,-.10,z),(width*.46,.025,.02),FLEET_ROOF)
        fleet_cylinder('radar-mast',(0,-.10,.98),.018,.32,FLEET_INK)
        box('air-search-radar',(0,-.10,1.15),(width*.87,.05,.12),FLEET_ROOF)


def funnel_character(profile,index):
    navy=profile['navy'];identity=profile['id'];hull=profile['hull']
    if profile['geometry'].get('roundFunnels'):return (1,1,1,-.12)
    if navy=='us':
        if hull=='battleship':return (1.23,1.26,1.06,-.11) if identity=='south-dakota' else (1.03,1.31,1.11,-.11)
        if len(profile['geometry']['funnels'])>=4:return (.80,.65,1.20,-.10)
        if hull=='destroyer' and profile['year']<1950 and len(profile['geometry']['funnels'])==1:return (1.10,1.26,1.20,-.18)
        return (1.12,1.20,.98,-.13) if hull=='cruiser' else (.83,.92,1.18,-.22)
    if navy in ('gb','ca','au','nz','pl','no'):
        if hull=='battleship':return (1.27,1.10,.95,-.13) if len(profile['geometry']['funnels'])==1 else (1.03,1.13,1.14,-.17)
        return (.82,1.12,1.15,-.15) if hull=='destroyer' else (1.02,1.15,1.04,-.12)
    if navy=='jp':return (1.12,1.40,1.12,-.30) if hull=='battleship' else (.84,1.17,1.17,-.24)
    if navy=='de':return (1.39,1.39,1.02,-.10) if hull=='battleship' else (1.13,1.20,1.17,-.18)
    if navy=='it':return (1.08,1.14,.98,-.12) if hull=='battleship' else (.89,1.05,1.20,-.17)
    if navy=='fr':return (1.12,1.20,1.04,-.10) if hull=='battleship' else (.88,1.07,1.22,-.12)
    if navy=='su':return (.97,1.22,1.15,-.20)
    return (.88,1.05,1.10,-.15)


def historic_funnel(profile, station, index, beam, length):
    global root
    previous=root;root=group('historic_funnel_'+str(index),(0,station*length,0))
    root['historic_funnel']=True
    style=profile['geometry'].get('funnelStyle','raked')
    if profile['geometry'].get('hangar') and station<-.15:root.location.z=.27
    scale=min(1,beam/.53)
    if profile['id']=='ranger':
        root.location.x=beam*.94*(1 if index<3 else -1)
        root.location.z=-.13
        funnel(0,0,.45)
        root=previous
        return
    if profile['geometry'].get('paddleWheels'):
        root.location.x=beam*1.03
        funnel(0,0,.55)
        root=previous
        return
    if profile['hull']=='fleet-carrier' and style!='side':
        root.location.x=beam*.79*profile['geometry'].get('islandSide',1)
        root.location.z=.12
        delta=(profile['geometry']['bridgeY']-station)*length
        deckhouse('island-stack-foundation',0,delta/2,.277,.34*scale,abs(delta)+.40,.14,FLEET_EDGE)
    if style=='side':
        root.location.x=beam*.94
        # Continuous elbow, with an open downturned mouth below the flight deck.
        centers=[(-.04,.30),(.08,.30),(.15,.27),(.20,.20),(.20,.085)]
        vertices=[];segments=12
        for at,(cx,cz) in enumerate(centers):
            a=Vector(centers[max(0,at-1)]);b=Vector(centers[min(len(centers)-1,at+1)])
            tangent=(b-a).normalized();normal=Vector((-tangent.y,tangent.x))
            for i in range(segments):
                angle=i*math.tau/segments
                vertices.append((cx+normal.x*.10*math.cos(angle),.10*math.sin(angle),cz+normal.y*.10*math.cos(angle)))
        vertices.extend((.20+.077*math.cos(i*math.tau/segments),.077*math.sin(i*math.tau/segments),.085) for i in range(segments))
        vertices.extend((.20+.077*math.cos(i*math.tau/segments),.077*math.sin(i*math.tau/segments),.16) for i in range(segments))
        faces=[]
        for band in range(len(centers)+1):
            faces.extend((band*segments+i,band*segments+(i+1)%segments,(band+1)*segments+(i+1)%segments,(band+1)*segments+i) for i in range(segments))
        obj=mesh('curved-downturned-exhaust',vertices,faces,FLEET_EDGE)
        obj.data.materials.append(FLEET_INK)
        for polygon in obj.data.polygons:
            if polygon.index>=(len(centers)-1)*segments:polygon.material_index=1
    else:
        cant=profile['geometry'].get('funnelCant',26 if profile['id']=='shinano' else 0)
        if cant:
            uptake=group('outward-canted-uptake');root=uptake
            uptake['naval_funnel_cant']=cant
            uptake.rotation_euler.y=math.radians(cant)*profile['geometry'].get('islandSide',1)
        if profile['geometry'].get('roundFunnels'):
            funnel(0,0,scale,'round',funnel_character(profile,index))
        else:
            character=None if profile['hull']=='fleet-carrier' else funnel_character(profile,index)
            funnel(0,0,scale*(1.15 if style=='trunked' and index==0 else 1),style if style=='trunked' else 'oval',character)
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
    if profile['id']=='pt-109':hull_color,edge_color='#50694e','#879775'
    tag=profile['id'] if profile['id'] in ('tashkent','pt-109') else profile['navy']
    hull_mat=bpy.data.materials.get('fleet_hull_'+tag) or material('fleet_hull_'+tag,hull_color,.12,.85)
    edge_mat=bpy.data.materials.get('fleet_edge_'+tag) or material('fleet_edge_'+tag,edge_color,.1,.8)
    for obj in current.objects:
        if obj.type!='MESH': continue
        for slot in obj.material_slots:
            if slot.material==FLEET_HULL: slot.material=hull_mat
            elif slot.material==FLEET_EDGE: slot.material=edge_mat


def naval_launcher(spec, beam, length, index, profile):
    global root
    previous=root
    root=group('naval_launcher_'+str(index),(spec['x']*beam,spec['y']*length,.319))
    kind=spec['kind'];root['naval_launcher']=kind
    if profile['id']=='arleigh-burke' and spec['y']<0:root.location.y-=length*.04
    root.rotation_euler.z=math.radians(spec.get('bearing',180 if spec['y']<0 else 0))
    size=min(1,beam/.50)
    root.scale=(size,)*3
    if kind=='vls':
        rows,columns=spec.get('rows',2),spec.get('columns',4)
        width=min(.50,columns*.07);depth=rows*.075
        deckhouse('vls-coaming',0,0,0,width+.045,depth+.045,.045,FLEET_INK)
        for row in range(rows):
            for col in range(columns):
                box('vls-cell-hatch',((col-(columns-1)/2)*width/columns,(row-(rows-1)/2)*.075,.048),(width/columns*.72,.052,.014),FLEET_ROOF)
    elif kind in ('asroc','alpha'):
        fleet_cylinder('asw-traversing-base',(0,0,.055),.13,.10,FLEET_INK)
        if kind=='alpha':
            deckhouse('weapon-alpha-mount',0,0,.10,.24,.22,.17,FLEET_EDGE)
            fleet_cylinder('weapon-alpha-projector',(0,.17,.25),.05,.26,FLEET_INK,'Y')
        else:
            for row in range(2):
                for col in range(4):
                    box('asroc-launch-box',((col-1.5)*.065,0,.135+row*.060),(.056,.28,.065),FLEET_EDGE)
                    box('asroc-box-mouth',((col-1.5)*.065,.139,.135+row*.060),(.042,.012,.05),FLEET_INK)
    else:
        fleet_cylinder('missile-traversing-base',(0,0,.065),.14,.13,FLEET_INK)
        box('missile-elevation-pedestal',(0,0,.21),(.14,.13,.25),FLEET_EDGE)
        count=1 if kind=='single' else 2
        if count==2:
            fleet_cylinder('missile-elevation-trunnion',(0,.035,.34),.042,.29,FLEET_EDGE,'X')
        for i in range(count):
            x=(i-(count-1)/2)*.24
            box('missile-launch-rail',(x,.035,.34),(.045,.46 if kind=='talos' else .34,.035),FLEET_INK)
            fleet_cylinder('display-missile',(x,.06,.39),.035,.56 if kind=='talos' else .37,FLEET_MARK,'Y')
            wing('missile-fins',[(x-.11,-.05),(x,-.01),(x+.11,-.05),(x+.035,.06),(x-.035,.06)],.40,.018,FLEET_ROOF)
    root=previous


def aviation_fittings(profile, beam, length):
    global root
    geometry=profile['geometry']
    if geometry.get('hangar') and geometry.get('radar')!='stealth':
        deckhouse('helicopter-hangar',0,-length*.33,.33,beam*1.35,length*.20,.27,FLEET_EDGE)
        box('hangar-doors',(0,-length*.431,.45),(beam*1.12,.022,.19),FLEET_INK)
        box('hangar-door-divider',(0,-length*.435,.45),(.025,.027,.19),FLEET_ROOF)
        if profile['id']=='ticonderoga':
            previous=root;root=group('aft-aegis-deckhouse',(0,-length*.35,.33))
            aegis_house(beam*1.22,length*.16,False)
            root.scale.z=.75
            # The rear pair belongs on the aft house, facing astern.
            root.rotation_euler.z=math.pi
            root=previous
    if geometry.get('helipad'):
        deckhouse('helicopter-flight-platform',0,-length*.86,.322,beam*1.42,length*.17,.035,FLEET_DECK)
        for x in [-.23,.23]:box('helipad-h-upright',(x*beam,-length*.86,.359),(.022,length*.10,.012),FLEET_MARK)
        box('helipad-h-crossbar',(0,-length*.86,.359),(beam*.46,.024,.012),FLEET_MARK)
        for side in [-1,1]:
            box('helipad-edge-stripe',(side*beam*.60,-length*.86,.359),(.018,length*.13,.012),FLEET_MARK)


def angled_carrier_deck(profile):
    # Low polygon exterior plans preserve class-specific bow and port-waist breaks.
    # Coordinates are art envelopes, not engineering measurements.
    plans={
        'midway':[(-.68,-.97),(.68,-.97),(.91,-.76),(.91,.66),(.61,.97),(-.48,.97),(-.64,.71),(-1.13,.32),(-1.13,-.18),(-.86,-.57)],
        'forrestal':[(-.72,-.97),(.72,-.97),(.94,-.64),(.94,.62),(.60,.97),(-.46,.97),(-.68,.73),(-1.13,.31),(-1.13,-.25),(-.83,-.57)],
        'kitty-hawk':[(-.72,-.97),(.72,-.97),(.97,-.65),(.97,.68),(.63,.97),(-.48,.97),(-.72,.73),(-1.17,.34),(-1.17,-.23),(-.84,-.56)],
        'enterprise-nuclear':[(-.72,-.97),(.72,-.97),(.98,-.72),(.98,.65),(.64,.97),(-.49,.97),(-.70,.73),(-1.17,.29),(-1.17,-.19),(-.84,-.56)],
        'john-f-kennedy':[(-.72,-.97),(.72,-.97),(.97,-.69),(.97,.66),(.64,.97),(-.49,.97),(-.70,.73),(-1.18,.30),(-1.18,-.22),(-.84,-.56)],
        'nimitz':[(-.73,-.97),(.73,-.97),(.98,-.72),(.98,.67),(.65,.97),(-.49,.97),(-.72,.74),(-1.17,.30),(-1.17,-.20),(-.85,-.56)],
        'gerald-ford':[(-.74,-.97),(.74,-.97),(.99,-.71),(.99,.68),(.66,.97),(-.50,.97),(-.73,.74),(-1.19,.32),(-1.19,-.22),(-.86,-.58)],
    }
    return plans[profile['id']]


def deck_edge_paint(deck, x, length):
    # Intersect the stripe with the real inset deck, including the port-waist
    # break. Leave a narrow deck-coloured margin around its clipped ends.
    points=[(px*.99,py*.9975) for px,py in deck]
    for axis,bound,sign in [(0,x-.009,1),(0,x+.009,-1),
                            (1,-length*.86,1),(1,length*.76,-1)]:
        clipped=[]
        for a,b in zip(points,points[1:]+points[:1]):
            a_inside=(a[axis]-bound)*sign>=0
            b_inside=(b[axis]-bound)*sign>=0
            if a_inside:clipped.append(a)
            if a_inside!=b_inside:
                t=(bound-a[axis])/(b[axis]-a[axis])
                clipped.append(tuple(a[i]+(b[i]-a[i])*t for i in range(2)))
        points=clipped
    if len(points)>=3:
        wing('flight-deck-edge-paint',points,.39175,.0015,FLEET_MARK)


def carrier_side_platform(name,deck,side,y,beam,outer,z,height):
    crossings=[]
    for a,b in zip(deck,deck[1:]+deck[:1]):
        if abs(b[1]-a[1])>1e-9 and min(a[1],b[1])<=y<=max(a[1],b[1]):
            crossings.append(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))
    edge=min(crossings) if side<0 else max(crossings)
    inner=edge-side*beam*.08
    outside=side*beam*outer
    deckhouse(name,(inner+outside)/2,y,z,abs(outside-inner),.26,height,FLEET_HULL,.10)


def warship(kind, profile=None):
    global root
    friendly=kind=='carrier'
    profile=profile or (HISTORICAL_BY_ID['enterprise'] if friendly else HISTORICAL_DEFAULTS[kind])
    geometry=profile['geometry'];shape=profile['shape']
    flattop=profile['hull']=='fleet-carrier'
    beam,length=(1.254,3.03) if friendly else (shape['halfBeam'],shape['halfLength'])
    root['historic_id']=profile['id'];root['historic_year']=profile['year'];root['game_role']=profile['hull']
    if profile.get('classId'):root['naval_class']=profile['classId']
    if flattop:
        root['naval_flight_deck']=geometry.get('flightDeck','straight')
        root['naval_aviation']=geometry.get('aviation','propeller')
    root['combat_stretch']=1 if friendly else shape['combatStretch']
    root['waterline_beam']=beam*(.80 if flattop else 1);root['waterline_length']=length
    fleet_hull(beam*(.80 if flattop else 1),length,profile)
    deck_kind=geometry.get('deck','wood')
    deck_mat=FLEET_TEAK if deck_kind=='wood' else FLEET_PLANK if deck_kind=='linoleum' else FLEET_DECK
    if profile['id']=='pt-109':deck_mat=OLIVE
    if flattop:
        deck=[(x*beam,y*length) for x,y in [(-.72,-.97),(.72,-.97),(.93,-.86),(.96,.71),(.78,.91),(.52,.97),(-.52,.97),(-.78,.91),(-.96,.71),(-.93,-.86)]]
        angled=geometry.get('flightDeck')=='angled'
        if angled:
            deck=[(x*beam,y*length) for x,y in angled_carrier_deck(profile)]
        wing('flight-deck-shadow',deck,.35,.075,FLEET_INK)
        flight_deck=[(x*.96,y*.995) for x,y in deck]
        wing('period-flight-deck',flight_deck,.39,.04,deck_mat)
        if deck_kind=='wood':
            for i in range(-4,5):box('flight-deck-plank',(i*beam*.18,-.04,.3905),(.012,length*1.73,.001),FLEET_PLANK)
        for side in [-1,1]:
            if angled:deck_edge_paint(flight_deck,side*beam*.82,length)
            else:box('flight-deck-edge-paint',(side*beam*.82,-length*.05,.391),(.018,length*1.62,.0015),FLEET_MARK)
        for y in [length*.15+i*.28 for i in range(7)]:box('runway-dash',(0,y,.3915),(.025,.15,.0015),FLEET_MARK)
        for x in [-.42,-.21,0,.21,.42]:box('launch-threshold',(x*beam,length*.82,.3915),(.045,.19,.0015),FLEET_MARK)
        if angled:
            for side in [-1,1]:
                start=Vector(((.13+side*.23)*beam,-length*.85,.3915));end=Vector(((-.67+side*.23)*beam,length*.37,.3915));delta=end-start
                obj=box('angled-landing-lane',(start+end)/2,(.022,delta.length,.0015),FLEET_MARK)
                obj.rotation_euler.z=-math.atan2(delta.x,delta.y)
            # Midway's 1991 fit has two bow catapults (USS Midway Museum).
            tracks=[(-.32,.56),(.26,.56)]
            if profile['id']!='midway':tracks.extend([(-.73,.08),(-.43,.12)])
            for x,y in tracks:
                track=box('catapult-track',(x*beam,y*length,.390),(.026,length*.49,.002),FLEET_INK)
                track['flight_deck_catapult']=True
                edge=box('catapult-track-edge',((x+.035)*beam,y*length,.391),(.012,length*.49,.001),FLEET_MARK)
                if y<.20:track.rotation_euler.z=edge.rotation_euler.z=.13
        if geometry.get('paddleWheels'):
            for side in [-1,1]:
                deckhouse('sidewheel-housing',side*beam*.83,-length*.10,.12,beam*.42,length*.32,.23,FLEET_EDGE)
                for y in [-.19,-.10,-.01]:box('paddlewheel-slat',(side*beam*.99,length*y,.13),(.035,length*.025,.18),FLEET_INK)
        for i,(x,y) in enumerate(geometry.get('lifts',[])):
            previous=root;root=group('aircraft_lift_'+str(i),(x*beam,y*length,0))
            root['naval_lift']=True
            deckhouse('lift-rim-'+str(i),0,0,.388,beam*.54,.37,.003,FLEET_INK)
            deckhouse('lift-deck-'+str(i),0,0,.391,beam*.47,.31,.002,FLEET_PLANK if deck_kind=='wood' else FLEET_EDGE)
            root=previous
        for side in [-1,1]:
            for y in [-length*.60,length*.05,length*.63]:carrier_side_platform('sponson-support',flight_deck,side,y,beam,1.035,.20,.14)
    else:
        weather_deck('inset-main-deck',hull_outline(beam*(.72 if geometry.get('radar')=='stealth' else .87),length*.95,profile),.327,.014,deck_mat,length,profile)
        deck_fittings(beam,length,profile,deck_kind=='wood',geometry.get('radar')=='stealth' or bool(geometry.get('launchers')))
        if geometry.get('bowStripes'):
            for i in range(5):box('recognition-bow-stripe',(0,length*(.81+i*.027),.330),(beam*(.65-i*.10),.034,.012),FLEET_MARK if i%2==0 else FLEET_RUST)
    if profile['hull']=='transport':
        for y in [.75,.50,.27,-.39,-.68]:
            deckhouse('cargo-hatch-coaming',0,y*length,.315,beam*1.30,length*.18,.100,FLEET_INK)
            deckhouse('cargo-hatch-cover',0,y*length,.415,beam*1.17,length*.15,.045,FLEET_EDGE)
            box('cargo-hatch-rib',(0,y*length,.47),(.025,length*.13,.02),FLEET_ROOF)
        previous=root;root=group('cargo-wheelhouse',(0,geometry['bridgeY']*length,.33));root.scale=(min(1,beam/.40),)*3
        historic_bridge(profile,beam);root=previous
        for y in [.64,.38,-.52]:
            fleet_cylinder('cargo-derrick-mast',(0,y*length,.74),.022,.83,FLEET_EDGE)
            obj=box('cargo-derrick-boom',(beam*.25,y*length+beam*.25*math.tan(.22),.98),(beam*.85,.03,.03),FLEET_MARK);obj.rotation_euler.z=.22
    if profile['hull']=='patrol-boat':
        if profile['id']=='pt-109':
            patrol_cabin(beam,length,profile)
        else:
            previous=root;root=group('patrol-wheelhouse',(0,geometry['bridgeY']*length,.33))
            root.scale=(min(1,beam/.40),)*3;historic_bridge(profile,beam);root=previous
        if profile['id']=='pt-109':
            for side in [-1,1]:
                machinegun_tub(side*beam*.42,.04*length,beam*.19)
                structural_rod('machinegun-pintle',(side*beam*.42,.04*length,.35),(side*beam*.42,.04*length,.43),.012,OLIVE)
                box('machinegun-breech',(side*beam*.42,.04*length,.43),(.045,.055,.035),FLEET_INK)
                for barrel in [-1,1]:structural_rod('open-machinegun-barrel',(side*beam*.42+barrel*.014,.04*length,.43),(side*beam*.42+barrel*.014,.04*length+.24,.43),.009,FLEET_INK)
    if profile['id']=='forrestal':
        # 1960 reference: eight single 5-inch mounts in four side galleries.
        for side in [-1,1]:
            for i,station in enumerate([-.76,-.61,.58,.73]):
                x=side*beam*.99;y=station*length
                carrier_side_platform('forrestal-gun-gallery',flight_deck,side,y,beam,1.085,.20,.085)
                mount=naval_gun('forrestal-5-inch-'+str(side)+'-'+str(i),x,y,.275,1,profile=profile)
                mount.scale=(min(.55,beam*.65),)*3
                mount.rotation_euler.z=-side*math.pi/2
                mount['main_battery']=False
    for i,station in enumerate(geometry['funnels']):historic_funnel(profile,station,i,beam,length)
    for i,spec in enumerate(geometry.get('launchers',[])):naval_launcher(spec,beam,length,i,profile)
    if not flattop:aviation_fittings(profile,beam,length)
    for i,gun in enumerate(geometry['guns']):
        size=min(1,beam/(.72 if geometry['calibre']>=250 else .43))
        if gun['raised']:
            fleet_cylinder('raised-main-barbette',(gun['x']*beam,gun['y']*length,.325+gun['raised']/2),(.36 if geometry['calibre']>=250 else .16)*size,gun['raised']+.03,FLEET_EDGE)
        mount=naval_gun('turret_main_'+str(i),gun['x']*beam,gun['y']*length,.34+gun['raised'],gun['barrels'],geometry['calibre']>=250,geometry.get('openGuns',False),geometry.get('radar')=='stealth',profile)
        mount.rotation_euler.z=math.radians(gun['bearing']);mount.scale=(size,)*3
        mount['historic_main']=True
    for i,gun in enumerate(geometry.get('secondary',[])):
        size=.48 if gun['x'] else .65
        if gun['raised']:
            fleet_cylinder('raised-secondary-barbette',(gun['x']*beam,gun['y']*length,.325+gun['raised']/2),.16*size,gun['raised']+.03,FLEET_EDGE)
        mount=naval_gun('turret_secondary_'+str(i),gun['x']*beam,gun['y']*length,.34+gun['raised'],gun['barrels'],profile=profile)
        mount.rotation_euler.z=math.radians(gun['bearing']);mount.scale=(size,)*3
        mount['main_battery']=False
    if not flattop:
        if profile['id']!='pt-109' and geometry.get('radar')!='stealth' and not geometry.get('launchers'):
            boat_scale=.90 if profile['hull']=='battleship' else .75 if profile['hull']=='cruiser' else .59
            for side in [-1,1]:lifeboat(side*beam*.63,-length*.10,boat_scale,profile['hull']=='battleship')
        banks=geometry.get('torpedoes',0)
        if profile['id']=='pt-109':
            for side in [-1,1]:
                for y in [-.37,.12]:fleet_cylinder('patrol-torpedo-tube',(side*beam*.62,y*length,.39),.043,.64,FLEET_INK,'Y')
        else:
            for i in range(banks):
                station=-.30+i*.45/max(1,banks-1)
                x=(1 if i%2 else -1)*beam*.55 if profile['hull']=='cruiser' or banks>=3 else 0
                if banks>=3:station=-.33+(i//2)*.36
                previous=root;root=group('torpedo_bank_'+str(i),(x,station*length,0))
                root['naval_torpedo_bank']=True
                tubes=geometry.get('torpedoTubes',3)
                deckhouse('torpedo-launcher-base',0,0,.31,beam*.85,max(.16,(tubes-1)*.055+.05),.11,FLEET_EDGE)
                for tube in range(tubes):
                    offset=(tube-(tubes-1)/2)*.055
                    fleet_cylinder('deck-torpedo-tube',(0,offset,.43),.023,beam*.85,FLEET_INK,'X')
                root=previous
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
                deckhouse('catapult-pivot',x,y,.31,.10,.10,.09,FLEET_EDGE)
    parts=shape['parts']
    if friendly:
        parts={'aa-port':{'x':-beam*.73,'y':length*.15},'aa-starboard':{'x':beam*.73,'y':length*.15},'bridge':{'x':beam*.79,'y':-length*geometry['bridgeY']},'flight-deck':{'x':0,'y':length*.34}}
    for part_id,point in parts.items():
        x,y=point['x'],-point['y']
        previous=root;part=group('part_'+part_id,(x,y,.40 if flattop else .33));root=part
        if part_id.startswith('aa-'):
            part.scale=(min(1,beam/.60),)*3
            light_aa_station(profile,beam,flattop,part_id)
        elif part_id=='bridge':
            part.scale=(min(1,beam/.40),)*3
            historic_bridge(profile,beam)
        else:
            deckhouse('flight-operations-surface',0,0,-.011,beam*1.42,length*.63,.002,deck_mat)
            for yy in [-.70,-.35,0,.35,.70]:box('arresting-cable',(0,yy+.09,-.007),(beam*1.30,.014,.002),FLEET_INK)
            parking_x=geometry.get('islandSide',1)*beam*.60 if geometry.get('aviation')=='jet' else -geometry.get('islandSide',1)*beam*(.68 if friendly else .62)
            for i,yy in enumerate([-length*.36,length*.81,length*1.07] if geometry.get('aviation')=='jet' else [-1.18,-.58,.02]):
                aircraft=group('parked_aircraft_'+str(i),(parking_x,yy,-.009));root=aircraft
                aircraft['parked_aircraft']=True;aircraft.scale=(1 if friendly else min(1,beam*(.88 if geometry.get('aviation')=='jet' else 1)),)*3
                parked_plane(0,0,NAVY if friendly else OLIVE,geometry.get('aviation')=='jet');root=part
        root=previous
        if not friendly:
            # The intact operations layer is hidden when this state appears.
            # Seat the torn plate in the surviving deck, before height scaling.
            ruin_height=.3975 if part_id=='flight-deck' else .41 if flattop else .34
            ruin=group('ruin_'+part_id,(x,y,ruin_height));root=ruin
            if part_id!='flight-deck':ruin.scale=(min(1,beam/.60),)*3
            else:ruin.scale.x=min(1,beam)
            wreck_part(part_id);root=previous
    follow_deck_sheer(current,profile,length)
    apply_ship_height_envelope(current,profile,beam,length)
    seat_ruin_bases(current)
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
requested={item for item in os.environ.get('SKY_MODEL_IDS','').split(',') if item}
if requested-set(name for name,_ in builds):
    raise ValueError('Unknown SKY_MODEL_IDS entry')
previous_models=json.loads((OUT/'manifest.json').read_text())['models'] if requested else []
for index,(name,build) in enumerate(builds):
    if requested and name not in requested:continue
    current=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(current)
    root=bpy.data.objects.new(name,None)
    current.objects.link(root)
    build()
    if name not in ('island','pickup-xp','pickup-health','pickup-bomb','enemy-round','enemy-aimed','coastal-battery','oil-depot'):
        root['rebuild_generation']=9
        conform_wing_markings(current)
        bevel_structures(current)
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
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=False,export_normals=name in ('island','pickup-xp','pickup-health','pickup-bomb','enemy-round','enemy-aimed','coastal-battery','oil-depot'))
    triangles=sum(len(obj.data.polygons) for obj in current.objects if obj.type=='MESH')
    models.append({'id':name,'file':name+'.glb','polygons':triangles,'bytes':(OUT/(name+'.glb')).stat().st_size})
    root.location=(index%5*7,index//5*12,0)
    for obj in current.objects: obj.select_set(False)
    # Keep finished assets out of dependency-graph updates while constructing the archive.
    current.hide_viewport=True

if requested:
    # Preserve the rest of the editable library during a focused iteration.
    with tempfile.TemporaryDirectory(prefix='sky-strike-library-') as temporary:
        snapshot=Path(temporary)/'previous.blend'
        shutil.copy2(SOURCE/'sky-strike-ww2.blend',snapshot)
        with bpy.data.libraries.load(str(snapshot),link=False) as (available,loaded):
            loaded.collections=[name for name in available.collections if name not in requested]
    for collection in loaded.collections:
        bpy.context.scene.collection.children.link(collection)
    replacements={item['id']:item for item in models}
    models=[replacements.get(item['id'],item) for item in previous_models]

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
