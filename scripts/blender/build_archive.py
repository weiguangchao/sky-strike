"""Build the century archive without modifying the existing combat library.

Input: assets/blender/century-archive.json (exported from TypeScript).
Output: editable century-archive.blend, embedded local GLBs and manifest.
Coordinates: +Y forward, +Z up; aircraft length 6, submarine length 10.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from refine_geometry import bevel_structures, interpolated_sections, swept_propeller_blade, cambered_fin

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/blender'
OUT = ROOT / 'game/public/assets/models'
ENTRIES = json.loads((SOURCE / 'century-archive.json').read_text())['entries']
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metal=0):
    mat = bpy.data.materials.new('archive_' + name)
    mat.use_nodes = True
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    mat.diffuse_color = (*linear, 1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = .62
    return mat


PAINTS = {key: material(key, color, .25 if key == 'silver' else 0) for key, color in
          [('olive', '#68804b'), ('silver', '#abbec6'), ('navy', '#365e57'), ('grey', '#829ba5')]}
LIGHT = material('underside', '#bbc5b5')
DARK = material('structure', '#253942', .20)
BLACK = material('openings', '#0e1b26')
GLASS = material('glazing', '#287c8a', .35)
WOOD = material('wood', '#ad8147')
IVORY = material('ivory', '#e9ddbd')
SUB = material('submarine_hull', '#6c8083', .15)
DECK = material('submarine_casing', '#8c9a90')
SONAR = material('sonar', '#354751')
MODERN_SUB = material('modern_submarine_hull', '#53656c', .10)
MODERN_CASING = material('modern_submarine_casing', '#788985')
root = None
collection = None


def own(obj, mat=None, parent=None):
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent or root
    if mat:
        obj.data.materials.append(mat)
    return obj


def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.parent = parent or root
    obj.data.materials.append(mat)
    return obj


def empty(name, component=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = root
    if component:
        obj['archive_component'] = component
    return obj


def box(name, pos, size, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    obj.scale = size
    return obj


def ellipsoid(name, pos, size, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=pos)
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    obj.scale = size
    return obj


def rod(name, a, b, radius, mat, parent=None):
    direction = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=direction.length,
                                       location=(Vector(a) + Vector(b)) / 2)
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def plate(name, points, z, thickness, mat, parent=None):
    points = list(points)
    area = sum(points[i][0] * points[(i + 1) % len(points)][1] -
               points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))
    if area < 0:
        points.reverse()
    n = len(points)
    verts = [(x, y, z - thickness / 2) for x, y in points] + [(x, y, z + thickness / 2) for x, y in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(name, verts, faces, mat, parent)


def ring(name, pos, radius, tube, mat, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=6,
                                    major_radius=radius, minor_radius=tube, location=pos,
                                    rotation=(math.pi / 2, 0, 0))
    obj = own(bpy.context.object, mat, parent)
    obj.name = name
    return obj


def vertical_fin(name, outline, width, mat, parent=None):
    return cambered_fin(name,[(y,-z) for z,y in outline],width,mat,parent,mesh)


def propeller(name, x, y, z, radius, blades, mat=WOOD):
    parent = empty(name, 'propeller')
    parent.location = (x, y, z)
    for index in range(blades):
        swept_propeller_blade('aircraft-blade-surface',0,0,index*math.tau/blades,radius,mat,parent,mesh)
    hub=max(.11,radius*.13)
    ellipsoid('spinner-shell', (0, 0, 0), (hub, .12, hub), DARK, parent)


def surface_tree(objects):
    bpy.context.view_layer.update()
    vertices=[];faces=[]
    for obj in objects:
        offset=len(vertices)
        vertices.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset+index for index in face.vertices) for face in obj.data.polygons)
    return BVHTree.FromPolygons(vertices,faces)


def loft_body(name, sections, mat, parent=None, sides=16, open_front=False, underside=None):
    sections = interpolated_sections(sections, 3)
    if sides >= 16:
        sides = 24 if sides == 16 else 32
    verts = []
    phase = math.pi / 4 if sides == 4 else 0
    gain = math.sqrt(2) if sides == 4 else 1
    for section in sections:
        y, rx, rz, z = section[:4]
        x = section[4] if len(section) > 4 else 0
        for index in range(sides):
            angle = index * math.tau / sides + phase
            verts.append((x + rx * math.cos(angle) * gain, y, z + rz * math.sin(angle) * gain))
    faces = []
    for station in range(len(sections) - 1):
        for index in range(sides):
            a = station * sides + index
            b = station * sides + (index + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.append(tuple(range(sides)))
    if not open_front:
        faces.append(tuple(reversed(range((len(sections) - 1) * sides, len(sections) * sides))))
    obj = mesh(name, verts, faces, mat, parent)
    if underside:
        obj.data.materials.append(underside)
        for polygon in obj.data.polygons:
            if polygon.normal.z < -.5:
                polygon.material_index = 1
    return obj


def interpolate(points, at):
    if at <= points[0][0]:
        return points[0][1]
    for (a, va), (b, vb) in zip(points, points[1:]):
        if a <= at <= b:
            return va + (vb - va) * (at - a) / (b - a)
    return points[-1][1]


def chord_edges(outline, at):
    hits = []
    for index, (ax, ay) in enumerate(outline):
        bx, by = outline[(index + 1) % len(outline)]
        if abs(ax - at) < 1e-7:
            hits.append(ay)
        if ax != bx and min(ax, bx) <= at <= max(ax, bx):
            hits.append(ay + (by - ay) * (at - ax) / (bx - ax))
    return min(hits), max(hits)


def wing_surface(name, outline, half_span, z, thickness, tip_rise, side, mat, parent, chord_scale=3, shift=0, dihedral_start=0):
    # The authored centre section reaches X=0. Preserve its actual stations;
    # shifting root points during export would change sweep and area silently.
    if min(x for x, _ in outline) != 0:
        raise ValueError(f'{name}: explicitly author the centre section at X=0')
    stations = sorted(set([0, .16, .32, .48, .64, .80, .92, 1] + [dihedral_start] + [x for x, _ in outline]))
    foil = [(0, 0), (.08, .62), (.25, 1), (.55, .72), (.85, .29), (1, 0), (.85, -.22), (.55, -.34), (.25, -.43), (.08, -.25)]
    verts, rings = [], []
    for fraction in stations:
        trailing, leading = chord_edges(outline, fraction)
        trailing, leading = trailing * chord_scale + shift, leading * chord_scale + shift
        chord = leading - trailing
        indices = []
        for t, lift in ([(0, 0)] if chord < 1e-7 else foil):
            indices.append(len(verts))
            verts.append((side * half_span * fraction, leading - chord * t,
                          z + tip_rise * max(0,fraction-dihedral_start) + lift * thickness * (1 - fraction * .66)))
        rings.append(indices)
    faces = [tuple(reversed(rings[0]))]
    for left, right in zip(rings, rings[1:]):
        for index in range(len(left)):
            next_index = (index + 1) % len(left)
            faces.append((left[index], left[next_index], right[0]) if len(right) == 1 else
                         (left[index], left[next_index], right[next_index], right[index]))
    if len(rings[-1]) > 2:
        faces.append(tuple(rings[-1]))
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    return mesh(name, verts, faces, mat, parent)


def canopy_frame(profile, cockpit_y, framed):
    width, length, height, base = profile['canopy']
    ellipsoid('canopy_sill', (0, cockpit_y, base - .03), (width + .025, length + .025, height), DARK)
    ellipsoid('canopy_glass', (0, cockpit_y, base), (width, length, height), GLASS)
    for fraction in ([-.66, -.23, .20, .62] if framed else [.58]):
        shrink = math.sqrt(1 - fraction * fraction)
        previous = None
        for step in range(9):
            angle = step * math.pi / 8
            point = (width * shrink * math.cos(angle) * 1.035, cockpit_y + fraction * length,
                     base + height * shrink * math.sin(angle) * 1.035)
            if previous:
                rod('exposed_canopy_bow', previous, point, .016, LIGHT if framed else DARK)
            previous = point
    if framed:
        for side in [-1, 0, 1]:
            previous = None
            for fraction in [-.86, -.66, -.23, .20, .62, .86]:
                shrink = math.sqrt(1 - fraction * fraction)
                angle = math.pi / 2 + side * .66
                point = (width * shrink * math.cos(angle) * 1.035, cockpit_y + fraction * length,
                         base + height * shrink * math.sin(angle) * 1.035)
                if previous:
                    rod('exposed_canopy_longeron', previous, point, .013, LIGHT)
                previous = point


def intake_duct(name, sections, paint, shape=None):
    parent = empty(name, 'intake')
    contour = ([(1,0),(1,.55),(.85,.9),(.50,1),(-.95,1),(-1,.80),(-1,-.80),(-.95,-1),(.50,-1),(.85,-.9),(1,-.55)]
               if shape else [(math.cos(i*math.tau/16),math.sin(i*math.tau/16)) for i in range(16)])
    sections=[list(section)+([0] if len(section)==4 else []) for section in sections]
    if shape and sections[-1][4] < 0:
        contour = [(-x,z) for x,z in reversed(contour)]
    verts = []
    for y,rx,rz,z,x in sections:
        verts.extend((x+rx*u,y,z+rz*v) for u,v in contour)
    y,rx,rz,z,x = sections[-1]
    for inset,depth in [(.84,0),(.80,-.14)]:
        verts.extend((x+rx*u*inset,y+depth,z+rz*v*inset) for u,v in contour)
    n = len(contour)
    faces = [tuple(range(n))]
    for band in range(len(sections)-1):
        for i in range(n):
            j=(i+1)%n
            faces.append((band*n+i,(band+1)*n+i,(band+1)*n+j,band*n+j))
    front=(len(sections)-1)*n;inner=front+n;back=inner+n
    for i in range(n):
        j=(i+1)%n
        faces.extend([(front+i,inner+i,inner+j,front+j),(inner+i,back+i,back+j,inner+j)])
    shell=mesh(name+'_shell',verts,faces,paint,parent)
    shell.data.materials.append(DARK)
    for polygon in list(shell.data.polygons)[1+(len(sections)-1)*n:]:
        polygon.material_index=1
    mesh(name+'_recess',verts[back:back+n],[tuple(reversed(range(n)))],BLACK,parent)
    return


def wing_rise(profile, level, half_span):
    return math.tan(math.radians(profile['wingDihedralDegrees'][level]))*half_span


def cg4_details(airframe):
    body=surface_tree([airframe])
    glazing=empty('cargo_cockpit_glazing','cargo-glazing')
    def patch(name,points,direction,parent=glazing):
        vertices=[]
        ray=Vector(direction)
        for point in points:
            hit,_,_,_=body.ray_cast(Vector(point),ray)
            if hit is None:raise ValueError(f'CG-4A {name} misses the cargo fuselage')
            vertices.append(hit-ray*.003)
        mesh(name,vertices,[tuple(range(len(vertices)))],GLASS,parent)
        for a,b in zip(vertices,vertices[1:]+vertices[:1]):
            rod(name+'_frame',a,b,.010,DARK,parent)
    # Separate flush panes follow the actual box-section cockpit surface.
    for a,b in [(2.15,2.36),(2.40,2.57),(2.61,2.73)]:
        for left,right in [(-.21,-.02),(.02,.21)]:
            patch('roof_windscreen',[(left,a,2),(right,a,2),(right,b,2),(left,b,2)],(0,0,-1))
    for side in [-1,1]:
        for a,b in [(2.17,2.40),(2.45,2.63)]:
            patch('side_windscreen',[(side*2,a,.015),(side*2,b,.015),(side*2,b,.20),(side*2,a,.20)],(-side,0,0))
        for station in [.15,.67,1.22,1.75]:
            points=[(side*2,station+.053*math.cos(i*math.tau/12),.13+.053*math.sin(i*math.tau/12)) for i in range(12)]
            patch('cargo_porthole',points,(-side,0,0))
    # The closed nose section still shows its full perimeter seam and top hinge.
    for side in [-1,1]:
        rod('nose_hinge_seam',(side*.351,2.25,-.35),(side*.351,2.25,.365),.011,DARK)
    rod('nose_top_hinge',(-.30,2.25,.373),(.30,2.25,.373),.018,DARK,empty('opening_nose_hinge','cargo-nose'))
    door=empty('port_cargo_door','cargo-door')
    corners=[]
    for y,z in [(.29,-.29),(.67,-.29),(.67,.29),(.29,.29)]:
        hit,_,_,_=body.ray_cast(Vector((-2,y,z)),Vector((1,0,0)))
        if hit is None:raise ValueError('CG-4A cargo door misses its fuselage')
        corners.append(hit-Vector((.003,0,0)))
    for a,b in zip(corners,corners[1:]+corners[:1]):rod('cargo_door_outline',a,b,.009,DARK,door)
    wings=surface_tree([obj for obj in collection.objects if obj.type=='MESH' and obj.name.startswith('main_wing')])
    for side in [-1,1]:
        for station in [.62,1.52]:
            endpoint,_,_,_=wings.ray_cast(Vector((side*2.16,station,2)),Vector((0,0,-1)))
            if endpoint is None:raise ValueError('CG-4A lift strut misses the wing')
            endpoint.z-=.018
            rod('wing_lift_strut',(side*.37,1.10,-.24),endpoint,.025,PAINTS['olive'],empty('wing_brace','lift-strut'))
        gear=empty('main_landing_wheel','landing-wheel')
        rod('landing_leg',(side*.30,1.55,-.25),(side*.53,1.28,-.48),.027,DARK,gear)
        rod('gear_brace',(side*.30,.84,-.25),(side*.53,1.28,-.48),.022,DARK,gear)
        wheel=ring('fixed_wheel',(side*.55,1.28,-.48),.16,.035,BLACK,gear)
        wheel.rotation_euler=(0,math.pi/2,0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.135,depth=.045,
                                           location=(side*.55,1.28,-.48),rotation=(0,math.pi/2,0))
        own(bpy.context.object,DARK,gear).name='main_wheel_disc'
        rod('wheel_hub',(side*.50,1.28,-.48),(side*.60,1.28,-.48),.065,LIGHT,gear)
    rod('main_gear_axle',(-.56,1.28,-.48),(.56,1.28,-.48),.027,DARK)
    tail=empty('tail_landing_wheel','landing-wheel')
    rod('tail_wheel_leg',(0,-2.65,.10),(0,-2.57,-.20),.018,DARK,tail)
    wheel=ring('tail_wheel',(0,-2.57,-.22),.05,.016,BLACK,tail)
    wheel.rotation_euler=(0,math.pi/2,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.038,depth=.025,
                                       location=(0,-2.57,-.22),rotation=(0,math.pi/2,0))
    own(bpy.context.object,DARK,tail).name='tail_wheel_disc'
    for side in [-1,1]:
        skid=empty('nose_landing_skid','landing-skid')
        rod('landing_skid',(side*.25,2.50,-.34),(side*.25,.50,-.42),.019,WOOD,skid)
        for station in [.8,2.1]:
            hit,_,_,_=body.ray_cast(Vector((side*.25,station,-2)),Vector((0,0,1)))
            if hit is None:raise ValueError('CG-4A skid support misses the fuselage')
            rod('skid_support',hit+Vector((0,0,.012)),(side*.25,station,-.42+(station-.5)*.04),.014,DARK,skid)


def transport_aircraft(entry):
    g=entry['geometry'];p=g['profile'];t=g['transport'];paint=PAINTS[g['paint']]
    airframe=loft_body('transport_airframe',p['sections'],paint,empty('fuselage','fuselage'),underside=LIGHT)
    # Freeze the skin's diagonals before projecting glass onto it. Otherwise
    # the GLB exporter can triangulate a curved quad differently from BVH.
    triangulate=airframe.modifiers.new('transport_skin_triangles','TRIANGULATE')
    bpy.context.view_layer.objects.active=airframe
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    body=surface_tree([airframe]);half_span=3*g['span']/g['length']
    wing_z=t['wingZ'];wing_rise=math.tan(math.radians(p['wingDihedralDegrees'][0]))*half_span
    for side in [-1,1]:
        parent=empty('transport_main_wing','main-wing')
        wing_surface('transport_main_wing',g['wing'],half_span,wing_z,p['wingThickness'],wing_rise,side,paint,parent)
        if t['tailStructure'] != 'twin-boom':
            tailspan=half_span*g['tailSpan']
            wing_surface('transport_tailplane',p['tailplane'],tailspan,t['tailZ'],.055,0,side,paint,empty('transport_tailplane','horizontal-tail'),chord_scale=1)
    if t['tailStructure'] == 'twin-boom':
        for side in [-1,1]:
            x=side*t['boomX']
            loft_body('transport_tail_boom',[(y,rx,rz,z,x) for y,rx,rz,z in t['boomSections']],paint,empty('tail_boom','tail-boom'))
            fin_parent=empty('twin_vertical_fin','vertical-tail');fin_parent.location.x=x
            vertical_fin('twin_vertical_tail',[(-z,y) for y,z in p['fin']],.055,paint,fin_parent)
            wing_surface('connecting_tailplane',p['tailplane'],t['boomX'],t['tailZ'],.055,0,side,paint,empty('connecting_tailplane','horizontal-tail'),chord_scale=1)
    else:
        vertical_fin('transport_vertical_tail',[(-z,y) for y,z in p['fin']],.055,paint,empty('transport_fin','vertical-tail'))
    # Separately placed radial engines, with a closed aft fairing that enters the wing.
    for index,nacelle in enumerate(t['nacelles']):
        x=nacelle['x'];z=nacelle['z'];front=nacelle['front'];radius=nacelle['radius']
        parent=empty('radial_engine_'+str(index),'radial-engine')
        sections=[(y,rx,rz,center_z,x) for y,rx,rz,center_z in nacelle['sections']]
        loft_body('radial_nacelle',sections,paint,parent,open_front=True)
        ring('radial_cowling_lip',(x,front,z),radius-.025,.028,paint,parent)
        ellipsoid('radial_engine_recess',(x,front-.032,z),(radius*.94,.018,radius*.94),BLACK,parent)
        for cylinder in range(14):
            angle=cylinder*math.tau/14
            rod('radial_cylinder',(x,front-.018,z),(x+radius*.77*math.cos(angle),front-.018,z+radius*.77*math.sin(angle)),.021,DARK,parent)
        rod('radial_propeller_shaft',(x,front-.10,z),(x,front+.10,z),.034,DARK,parent)
        propeller('transport_propeller_'+str(index),x,front+.065,z,p['propellerDiameter']*3/g['length'],g['propellerBlades'],DARK)
        # Oil cooler projects from the nacelle's bottom and overlaps its body.
        loft_body('radial_oil_cooler',[(front-.50,.07,.04,z-radius*.78,x),(front-.09,.075,.055,z-radius*.90,x)],paint,parent,open_front=True)
        ellipsoid('oil_cooler_recess',(x,front-.096,z-radius*.90),(.060,.012,.040),BLACK,parent)
        # A shallow dorsal carburettor intake stays attached to the cowling.
        loft_body('carburettor_intake',[(front-.63,.05,.018,z+radius*.93,x),(front-.14,.055,.042,z+radius*.95,x)],paint,parent,open_front=True)
        ellipsoid('carburettor_recess',(x,front-.15,z+radius*.95),(.040,.012,.025),BLACK,parent)
        if nacelle['gear']=='partly-exposed':
            gear=empty('retracted_main_wheel','landing-wheel')
            y=nacelle['wheelY'];wheel_z=z-radius*.80
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.105,depth=.070,location=(x,y,wheel_z),rotation=(0,math.pi/2,0))
            own(bpy.context.object,BLACK,gear).name='retracted_main_tyre'
            rod('retracted_wheel_hub',(x-.042,y,wheel_z),(x+.042,y,wheel_z),.047,DARK,gear)
    glazing=empty('transport_glazing','cargo-glazing')
    def patch(name,points,direction,mat=GLASS,parent=glazing,frame=True):
        ray=Vector(direction);vertices=[];nu=12
        nv=t['sidePaneSubdivisions'] if name=='transport_side_windscreen' else 8
        a,b,c,d=[Vector(point) for point in points]
        for j in range(nv+1):
            v=j/nv
            for i in range(nu+1):
                u=i/nu;point=a*(1-u)*(1-v)+b*u*(1-v)+c*u*v+d*(1-u)*v
                hit,_,_,_=body.ray_cast(point,ray)
                if hit is None:raise ValueError(entry['id']+': '+name+' misses actual fuselage')
                vertices.append(hit-ray*.004)
        faces=[]
        for j in range(nv):
            for i in range(nu):
                start=j*(nu+1)+i
                faces.append((start,start+1,start+nu+2,start+nu+1))
        obj=mesh(name,vertices,faces,mat,parent)
        if frame:
            edges=[[i for i in range(nu+1)],[nv*(nu+1)+i for i in range(nu+1)],
                   [j*(nu+1) for j in range(nv+1)],[j*(nu+1)+nu for j in range(nv+1)]]
            for edge in edges:
                for left,right in zip(edge,edge[1:]):rod(name+'_frame',vertices[left],vertices[right],.006,paint,parent)
        return obj
    # Framed flight-deck panes are projected onto the sloping nose, never a bubble canopy.
    for a,b in t['cockpitRoofStations']:
        for left,right in [(-t['cockpitWidth'],-.012),(.012,t['cockpitWidth'])]:
            patch('transport_roof_windscreen',[(left,a,2),(right,a,2),(right,b,2),(left,b,2)],(0,0,-1))
    for side in [-1,1]:
        for a,b,lower,upper in t['cockpitSidePanes']:
            patch('transport_side_windscreen',[(side*2,a,lower),(side*2,b,lower),(side*2,b,upper),(side*2,a,upper)],(-side,0,0))
        for station in t['cabinWindows']:
            h=t['windowZ'];w=t['windowWidth'];height=t['windowHeight']
            if t['cabinWindowShape'] == 'round':
                ray=Vector((-side,0,0));verts=[]
                for i in range(17):
                    angle=i*math.tau/16;yy=station+math.cos(angle)*w/2;zz=h+math.sin(angle)*height/2
                    hit,_,_,_=body.ray_cast(Vector((side*2,yy,zz)),ray)
                    if hit is None:raise ValueError('round cabin port misses cargo pod')
                    verts.append(hit-ray*.004)
                mesh('round_cabin_port',verts,[tuple(range(16))],GLASS,glazing)
            else:
                patch('transport_cabin_window',[(side*2,station-w/2,h-height/2),(side*2,station+w/2,h-height/2),(side*2,station+w/2,h+height/2),(side*2,station-w/2,h+height/2)],(-side,0,0),frame=False)
    if t['tailStructure'] == 'twin-boom':
        doors=empty('clamshell_cargo_doors','cargo-door');vertices=[]
        for step in range(21):
            z=-.30+step*.026;hit,_,_,_=body.ray_cast(Vector((0,-2,z)),Vector((0,1,0)))
            if hit is not None:vertices.append(hit-Vector((0,.003,0)))
        for a,b in zip(vertices,vertices[1:]):rod('clamshell_center_seam',a,b,.006,DARK,doors)
        for side in [-1,1]:
            vertices=[]
            for step in range(21):
                angle=step*math.pi/20-math.pi/2;ray=Vector((-side*math.cos(angle),0,-math.sin(angle)))
                origin=Vector((side*math.cos(angle)*2,-.94,math.sin(angle)*2))
                hit,_,_,_=body.ray_cast(origin,ray)
                if hit is not None:vertices.append(hit-ray*.003)
            for a,b in zip(vertices,vertices[1:]):rod('clamshell_outer_seam',a,b,.006,DARK,doors)
    else:
        # Military cargo doors on port; the two leaves share a frame but stay flush.
        doors=empty('military_cargo_door','cargo-door')
        rear,front,lower,upper=t['cargoDoor']
        def seam(a,b):
            points=[]
            for step in range(13):
                u=step/12;y=a[0]+(b[0]-a[0])*u;z=a[1]+(b[1]-a[1])*u
                hit,_,_,_=body.ray_cast(Vector((-2,y,z)),Vector((1,0,0)))
                if hit is None:raise ValueError(entry['id']+': cargo door misses body')
                points.append(hit-Vector((.003,0,0)))
            for start,end in zip(points,points[1:]):rod('cargo_door_seam',start,end,.007,DARK,doors)
        corners=[(rear,lower),(front,lower),(front,upper),(rear,upper)]
        for a,b in zip(corners,corners[1:]+corners[:1]):seam(a,b)
        seam(((rear+front)/2,lower),((rear+front)/2,upper))
    if t['gearLayout'] == 'tailwheel':
        # Retained small tailwheel is supported inside the underside of the tail cone.
        gear=empty('transport_tailwheel','landing-wheel');wheel_y=t['tailwheelY'];wheel_z=t['tailwheelZ']
        hit,_,_,_=body.ray_cast(Vector((0,wheel_y,-2)),Vector((0,0,1)))
        if hit is None:raise ValueError(entry['id']+': tailwheel root misses body')
        rod('tailwheel_leg',hit+Vector((0,0,.025)),(0,wheel_y-.05,wheel_z),.016,DARK,gear)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.065,depth=.045,location=(0,wheel_y-.05,wheel_z),rotation=(0,math.pi/2,0))
        own(bpy.context.object,BLACK,gear).name='transport_tail_tyre'
        rod('tailwheel_hub',(-.03,wheel_y-.05,wheel_z),(.03,wheel_y-.05,wheel_z),.026,DARK,gear)


def aircraft(entry):
    if entry['geometry'].get('role')=='transport':
        transport_aircraft(entry)
        return
    g = entry['geometry']
    p = g['profile']
    paint = PAINTS[g['paint']]
    jet = g['body'] == 'jet'
    glider = g['body'] == 'glider'
    biplane = len(g['wingLevels']) > 1
    half_span = 3 * g['span'] / g['length']
    fuselage = empty('fuselage', 'fuselage')
    airframe=loft_body('airframe', p['sections'], paint, fuselage,
              sides=4 if entry['id'] in ('fokker-dvii','cg4a') else 16,
              open_front=g.get('intake') == 'nose' or g['body'] in ('radial', 'rotary'), underside=LIGHT)
    if p.get('spine'):
        loft_body('camel_hump' if entry['id'] == 'sopwith-camel' else 'dorsal_spine', p['spine'], paint)
    for index, sections in enumerate(p.get('nacelles', [])):
        loft_body('engine_nacelle_' + str(index), sections, paint)
    if not jet and not glider:
        nose = p['sections'][-1]
        radius = nose[1]
        if g['body'] in ('radial', 'rotary'):
            ring('engine_cowling_lip', (0, nose[0], 0), radius - .02, .045, LIGHT)
            ellipsoid('engine_recess', (0, nose[0] - .04, 0), (radius * .90, .01, radius * .90), BLACK)
            for index in range(9 if g['body'] == 'rotary' else 14):
                angle = index * math.tau / (9 if g['body'] == 'rotary' else 14)
                rod('engine_cylinder', (0, nose[0] + .015, 0),
                    (radius * .80 * math.cos(angle), nose[0] + .015, radius * .80 * math.sin(angle)), .04, DARK)
        elif biplane:
            if entry['id'] == 'spad-xiii':
                ring('round_radiator', (0, nose[0] + .01, 0), radius - .02, .035, DARK)
                ellipsoid('radiator_recess', (0, nose[0] + .01, 0), (.31, .012, .31), BLACK)
                for x in [-.22, -.15, -.075, 0, .075, .15, .22]:
                    rod('radiator_grille', (x, nose[0] + .03, -.22), (x, nose[0] + .03, .22), .012, LIGHT)
            else:
                box('box_radiator', (0, nose[0] + .015, .03), (.53, .025, .55), DARK)
                for x in [-.20, -.10, 0, .10, .20]:
                    rod('radiator_grille', (x, nose[0] + .04, -.18), (x, nose[0] + .04, .26), .014, LIGHT)
        spinner_radius = .12 if biplane else .22
        if p.get('spinner'):
            loft_body('continuous_spinner',p['spinner'],paint,empty('spinner','spinner'))
        else:
            ellipsoid('spinner', (0, 2.84, 0), (spinner_radius, .16, spinner_radius), paint)
        propeller('propeller_00', 0, 2.78, 0, p['propellerDiameter'] * 3 / g['length'],
                  g['propellerBlades'], WOOD if biplane else DARK)
        if biplane or entry['id'] == 'a6m5':
            rod('propeller_shaft',(0,p['sections'][-1][0]-.04,0),(0,2.84,0),.045,DARK)
        for side in [-1, 1]:
            if g.get('armament','guns')!='unarmed' and (biplane or entry['id'] == 'a6m5'):
                gun_z = .54 if entry['id'] == 'sopwith-camel' else .40 if biplane else .37
                rear = Vector((side * .14, .55, gun_z))
                if entry['id'] == 'spad-xiii':
                    surface = surface_tree([airframe])
                    hit, _, _, _ = surface.ray_cast(Vector((rear.x, rear.y, 2)), Vector((0, 0, -1)))
                    if hit is None: raise ValueError('SPAD gun root misses its airframe')
                    rear.z = hit.z - .012
                rod('synchronized_machine_gun', rear, (side * .14, 1.78, gun_z), .024, DARK)
            if entry['id'] in ('spitfire-ia', 'p51d'):
                for index in range(6):
                    y = 1.0 + index * .13
                    rod('exhaust_stub', (side * .27, y, .09), (side * .36, y - .035, .08), .022, DARK)
        if entry['id']=='spad-xiii':
            parent=empty('engine_exhaust','engine-exhaust')
            for side in [-1,1]:
                rod('long_exhaust_pipe',(side*.41,1.88,.12),(side*.41,-.88,.10),.041,DARK,parent)
                for y in [.65,1.16,1.67]:
                    rod('exhaust_header',(side*.32,y,.15),(side*.41,y-.12,.12),.028,DARK,parent)
        if entry['id']=='fokker-dvii':
            parent=empty('exposed_engine','exposed-engine')
            for index in range(6):
                y=1.08+index*.235
                rod('inline_cylinder',(0,y,.32),(0,y,.53),.069,DARK,parent)
                box('rocker_cover',(0,y,.54),(.17,.15,.045),DARK,parent)
                rod('exhaust_header',(.07,y,.45),(.37,y-.08,.37),.027,DARK,parent)
            rod('side_exhaust_manifold',(.37,2.26,.37),(.37,.68,.34),.041,DARK,parent)
            rod('exhaust_outlet',(.37,.68,.34),(.46,.46,.34),.039,DARK,parent)
        if entry['id']=='a6m5':
            parent=empty('cowl_exhausts','engine-exhaust')
            for side in [-1,1]:
                for z in [-.27,-.15,-.03,.09,.21]:
                    x=.43*math.sqrt(1-(z/.44)**2)
                    rod('individual_exhaust',(side*x*.98,1.98,z),(side*(x+.08),1.46,z-.03),.024,DARK,parent)
        if entry['id']=='p51d':
            parent=empty('chin_intake','chin-intake')
            loft_body('chin_fairing',[[1.65,.07,.035,-.27],[2.12,.115,.07,-.29],[2.64,.115,.065,-.27]],paint,parent,open_front=True)
            ellipsoid('chin_opening',(0,2.625,-.28),(.095,.015,.047),BLACK,parent)
    if not biplane:
        root_points=[y*3 for x,y in g['wing'] if x==0]
        trailing,leading=min(root_points),max(root_points)
        root_height=g['wingLevels'][0]*3+(.20 if g['wingLevels'][0]<-.07 else .08)
        fairing=[]
        for fraction,gain in [(0,.90),(.20,1.08),(.52,1.12),(.82,1.04),(1,.90)]:
            station=trailing+(leading-trailing)*fraction
            radius=interpolate([(s[0],s[1]) for s in p['sections']],station)
            fairing.append((station,radius*gain,.015 if fraction in (0,1) else .09,root_height+.025))
        loft_body('continuous_wing_root_fairing',fairing,paint,empty('wing_root_blend','wing-root-fairing'))
    for level, height in enumerate(g['wingLevels']):
        span = 3 * (p.get('lowerSpan', g['span']) if biplane and level == 0 else g['span']) / g['length']
        lift = .14 if biplane and level == 0 else 0 if biplane else .20 if height < -.07 else .08
        z = height * 3 + lift
        shift = p.get('stagger', 0) if level else 0
        lower_chord = p.get('lowerChord', 1) if biplane and level == 0 else 1
        source_outline=p.get('upperWing',g['wing']) if level else g['wing']
        outline = [(x, y * lower_chord) for x, y in source_outline]
        rise=wing_rise(p,level,span)
        for side in [-1, 1]:
            parent = empty(f'wing_{level}_{side}', 'main-wing')
            parent['wing_level'] = level
            wing_surface('main_wing', outline, span, z, p['wingThickness'], rise, side, paint, parent, shift=shift, dihedral_start=p.get('wingDihedralStart',0))
            seam = []
            for fraction in [.48, .64, .80, .92]:
                trailing, leading = chord_edges(outline, fraction)
                chord = (leading - trailing) * 3
                seam.append((side * span * fraction, trailing * 3 + shift + chord * .10,
                             z + rise * max(0,fraction-p.get('wingDihedralStart',0)) + p['wingThickness'] * .23 * (1 - fraction * .66) + .012))
            for a, b in zip(seam, seam[1:]):
                rod('aileron_seam', a, b, .009, DARK, parent)
            if biplane:
                for fraction in [.22, .35, .48, .61, .74, .87]:
                    trailing, leading = chord_edges(outline, fraction)
                    previous = None
                    for t, camber in [(.12,.76),(.25,1),(.55,.72),(.85,.29)]:
                        point = (side * span * fraction, (leading - (leading - trailing) * t) * 3 + shift,
                                 z + rise * fraction + camber * p['wingThickness'] * (1 - fraction * .66) + .006)
                        if previous:
                            rod('fabric_rib', previous, point, .006, LIGHT, parent)
                        previous = point
            elif not jet and not glider and g.get('armament','guns')!='unarmed':
                count = 4 if entry['id'] == 'spitfire-ia' else 3 if entry['id'] == 'p51d' else 1
                for gun in range(count):
                    fraction = .34 + gun * .075
                    _, leading = chord_edges(outline, fraction)
                    gun_y = leading * 3
                    gun_z = z + rise * fraction
                    rod('wing_gun', (side * span * fraction, gun_y - .10, gun_z),
                        (side * span * fraction, gun_y + .13, gun_z), .018, DARK)
    if entry['id']=='mig21pf':
        parent=empty('wing_fences','wing-fence')
        fraction=.66
        trailing,leading=chord_edges(outline,fraction)
        fence_z=z+rise*fraction
        for side in [-1,1]:
            obj=vertical_fin('wing_fence',[(-fence_z+.01,trailing*3+.03),(-fence_z-.10,trailing*3+.08),(-fence_z-.10,leading*3-.06),(-fence_z+.01,leading*3-.025)],.014,paint,parent)
            obj.location.x=side*half_span*fraction
    if biplane:
        lower_span = p['lowerSpan'] * 3 / g['length']
        for side in [-1, 1]:
            for fraction in p['strutBays']:
                x = side * lower_span * fraction
                upper_fraction = abs(x) / half_span
                lower_z = g['wingLevels'][0] * 3 + .14 + wing_rise(p,0,lower_span) * fraction + .02
                upper_z = g['wingLevels'][1] * 3 + wing_rise(p,1,half_span) * upper_fraction
                for y in [-.25, .43]:
                    rod('interplane_strut', (x, y, lower_z), (x, y + p.get('stagger', 0), upper_z), .024, WOOD)
                if g['struts'] == 'N':
                    rod('N_diagonal', (x, -.25, lower_z), (x, .43 + p.get('stagger', 0), upper_z), .024, WOOD)
                else:
                    rod('cross_rigging', (x, -.25, lower_z), (x, .43 + p.get('stagger', 0), upper_z), .007, DARK)
                    rod('cross_rigging', (x, .43, lower_z), (x, -.25 + p.get('stagger', 0), upper_z), .007, DARK)
            for y in [.1,.63]:
                rod('cabane_strut', (side * .20, y, .40), (side * .43, y + p.get('stagger', 0), g['wingLevels'][1] * 3 + wing_rise(p,1,half_span)*.43/half_span), .022, DARK)
            for y in [-.45,.80]:
                rod('landing_leg', (side * .22, y, -.15), (side * .64, .85, -1.32), .032, DARK)
            wheel = ring('fixed_wheel', (side * .65, .85, -1.32), .24, .065, BLACK)
            wheel.rotation_euler = (0, math.pi / 2, 0)
            rod('wheel_hub', (side * .60, .85, -1.32), (side * .72, .85, -1.32), .095, LIGHT)
        rod('wheel_axle', (-.67,.85,-1.32), (.67,.85,-1.32), .035, DARK)
        if entry['id']=='fokker-dvii':
            parent=empty('axle_airfoil','axle-fairing')
            for side in [-1,1]:
                wing_surface('axle_wing',[[0,1.15],[1,1.08],[1,.63],[0,.57]],.64,-1.30,.09,0,side,paint,parent,chord_scale=1)
        rod('tail_skid', (0,-2.52,-.04), (0,-2.72,-.62), .027, WOOD)
    cockpit_y = g['cockpit'] * 3
    if biplane:
        base = p['canopy'][3]
        ellipsoid('open_cockpit', (0,cockpit_y,base), (.20,.28,.055), BLACK)
        rim=[]
        for rx,ry,z in [(.235,.315,base+.055),(.195,.275,base+.055),(.195,.275,base-.025),(.235,.315,base-.025)]:
            rim.extend((rx*math.cos(i*math.tau/20),cockpit_y+ry*math.sin(i*math.tau/20),z) for i in range(20))
        faces=[]
        for band in range(4):
            faces.extend((band*20+i,band*20+(i+1)%20,((band+1)%4)*20+(i+1)%20,((band+1)%4)*20+i) for i in range(20))
        mesh('leather_cockpit_coaming',rim,faces,WOOD)
        ellipsoid('cockpit_windscreen', (0,cockpit_y+.24,base+.10), (.17,.055,.14), GLASS)
    elif entry['id']=='cg4a':
        cg4_details(airframe)
    else:
        canopy_frame(p,cockpit_y,entry['id'] in ('a6m5','cj6a','mb326'))
    if p.get('tipTanks'):
        for side in [-1,1]:
            tank=loft_body('wingtip_tank',p['tipTanks'],paint,empty('wingtip_tank','wingtip-tank'))
            tank.location.x=side*(half_span-max(section[1] for section in p['tipTanks']))
    if entry['id']=='cj6a':
        # The trainer has no wing guns; the radial cooling shutter is visible.
        parent=empty('radial_cooling_shutter','cooling-shutter')
        for index in range(18):
            a=index*math.tau/18
            rod('cooling_shutter_spoke',(.11*math.cos(a),2.63,.11*math.sin(a)),(.315*math.cos(a),2.63,.315*math.sin(a)),.014,LIGHT,parent)
    if p['tailplane']:
        tail_span = half_span * g['tailSpan']
        for side in [-1,1]:
            parent = empty('canard' if g['tail']=='canard' else 'tailplane', 'canard' if g['tail']=='canard' else 'horizontal-tail')
            wing_surface('tail_surface',p['tailplane'],tail_span,.19,.045,math.tan(math.radians(p.get('tailDihedralDegrees',0)))*tail_span,side,paint,parent,chord_scale=1)
            seam=[]
            for fraction in [.36,.56,.76,.94]:
                trailing,leading=chord_edges(p['tailplane'],fraction)
                seam.append((side*tail_span*fraction,leading-(leading-trailing)*.85,.19+math.tan(math.radians(p.get('tailDihedralDegrees',0)))*tail_span*fraction+.045*.29*(1-fraction*.66)+.005))
            for a,b in zip(seam,seam[1:]):rod('tail_control_hinge',a,b,.010,DARK,parent)
    fin_parent = empty('vertical_tail','vertical-tail')
    vertical_fin('fin',[(-z,y) for y,z in p['fin']],.065,paint,fin_parent)
    if g.get('radiator')=='belly':
        parent=empty('belly_radiator','radiator')
        sections=[[-1.35,.06,.06,-.28],[-.85,.20,.14,-.35],[-.10,.23,.16,-.40],[.48,.19,.13,-.38]]
        loft_body('radiator_fairing',sections,paint,parent,open_front=True)
        ellipsoid('radiator_inlet',(0,.43,-.39),(.165,.018,.10),BLACK,parent)
    elif g.get('radiator')=='wing':
        for x,width in [(.75,.18),(-.72,.13)]:
            parent=empty('wing_radiator' if x>0 else 'oil_cooler','wing-radiator' if x>0 else 'oil-cooler')
            sections=[[-.80,width*.70,.08,-.29],[-.3,width,.14,-.31],[.26,width,.13,-.32]] if x>0 else [[-.42,width*.70,.06,-.29],[-.15,width,.10,-.30],[.12,width,.09,-.30]]
            wing_z=g['wingLevels'][0]*3+.20+wing_rise(p,0,half_span)*abs(x)/half_span
            raise_by=wing_z+.015-max(section[2]+section[3] for section in sections)
            sections=[(y,rx,rz,z+raise_by) for y,rx,rz,z in sections]
            obj=loft_body('cooler_fairing',sections,paint,parent,open_front=True);obj.location.x=x
            ellipsoid('cooler_inlet',(x,sections[-1][0]-.025,sections[-1][3]),(width*.86,.016,sections[-1][2]*.76),BLACK,parent)
    if jet:
        if g['intake']=='nose':
            section=p['sections'][-1]
            y,rx,rz,z=section[:4]
            intake=empty('nose_intake','nose-intake') if entry['id']=='f86a' else None
            rolled=.032 if intake else .035
            lip=ring('nose_intake_lip',(0,y,z),rx-rolled if intake else rx-.020,rolled,paint,intake);lip.scale.y=rz/rx
            wall=[]
            for depth,gain in [(0,.91),(-.16,.82)]:
                wall.extend((rx*gain*math.cos(i*math.tau/24),y+depth,z+rz*gain*math.sin(i*math.tau/24)) for i in range(24))
            mesh('nose_intake_inner_wall',wall,[(i,i+24,(i+1)%24+24,(i+1)%24) for i in range(24)],DARK,intake)
            ellipsoid('intake_recess',(0,y-.13,z),(rx*.91,.012,rz*.91),BLACK,intake)
            if entry['id']=='mig21pf':
                loft_body('radar_shock_cone',[[y-.15,.17,.17,0],[y+.10,.13,.13,0],[y+.24,.003,.003,0]],DARK)
                rod('upper_nose_pitot',(0,y-.23,.27),(0,3.06,.27),.012,DARK,empty('nose_pitot','pitot'))
        for index,sections in enumerate(p.get('ducts',[])):
            intake_duct('intake_'+str(index),sections,paint,p.get('ductShape'))
            if entry['id']=='mirage2000c':
                x=sections[-1][4]
                loft_body('inlet_half_cone',[[.84,.11,.17,0,x],[1.10,.015,.02,0,x]],DARK)
        nozzle_y=-2.972 if entry['id']=='mb326' else -2.82 if entry['id']=='f16a' else -2.93
        for engine in range(g['engines']):
            x=(engine-(g['engines']-1)/2)*.42
            ring('jet_nozzle',(x,nozzle_y,-.04 if g['engines']==2 else 0),.18 if g['engines']==2 else .20 if entry['id']=='mb326' else .22,.028,DARK)
            ellipsoid('exhaust_recess',(x,nozzle_y-.01,-.04 if g['engines']==2 else 0),(.15 if g['engines']==2 else .19,.015,.15 if g['engines']==2 else .19),BLACK)
        if entry['id']=='f16a':
            body_surface=surface_tree([airframe])
            fins=empty('ventral_fins','ventral-fin')
            for side in [-1,1]:
                x=side*.27
                roots=[]
                for station in [-2.45,-1.61]:
                    hit,_,_,_=body_surface.ray_cast(Vector((x,station,-2)),Vector((0,0,1)))
                    if hit is None:raise ValueError('F-16 ventral-fin root misses its airframe')
                    roots.append(-hit.z-.012)
                obj=vertical_fin('ventral_fin',[(roots[0],-2.45),(.57,-2.42),(.42,-1.83),(roots[1],-1.61)],.04,DARK,fins)
                obj.location.x=x
        if p.get('ventralFin'):
            vertical_fin('ventral_fin',[(-z,y) for y,z in p['ventralFin']],.042,DARK,empty('ventral_fin','ventral-fin'))
        if p.get('refuelingProbe'):
            parent=empty('refueling_probe','refueling-probe')
            points=p['refuelingProbe']
            ellipsoid('probe_mount',points[0],(.07,.13,.07),paint,parent)
            for a,b in zip(points,points[1:]):
                rod('fixed_probe',a,b,.026,DARK,parent)
            x,y,z=points[-1]
            rod('probe_tip',(x,y-.05,z),(x,y+.08,z),.037,LIGHT,parent)
        if entry['id'] in ('f16a','gripen-c'):
            _,leading=chord_edges([(0 if x==min(v[0] for v in g['wing']) else x,y) for x,y in g['wing']],1)
            z=g['wingLevels'][0]*3+(.20 if g['wingLevels'][0]<-.07 else .08)+wing_rise(p,0,half_span)
            for side in [-1,1]:
                rod('wingtip_rail',(side*half_span,leading*3-.45,z),(side*half_span,leading*3+.15,z),.023,DARK)
        if entry['id']=='gripen-c':
            rod('nose_pitot',(0,2.72,0),(0,3.1,0),.012,DARK)


def deck_height(sheer, hull_sections, station):
    hull_top=interpolate([(y,rz+z) for y,_,rz,z in interpolated_sections(hull_sections,3)],station)
    return max(interpolate(sheer,station),hull_top+.018)


def sheer_deck(points, sheer, beam, hull_sections):
    hull_sections=interpolated_sections(hull_sections,3)
    low=min(y for _,y in points);high=max(y for _,y in points)
    stations=sorted({y for _,y in points}|{y for y,_ in sheer if low<y<high}|{s[0] for s in hull_sections if low<s[0]<high})
    hull_top=[(y,rz+z+.018) for y,_,rz,z in hull_sections]
    # Insert every crossing of the authored sheer and hull crown as well as
    # their breakpoints. Each top strip is planar and stays above the hull.
    crossings=[]
    for a,b in zip(stations,stations[1:]):
        da=interpolate(sheer,a)-interpolate(hull_top,a)
        db=interpolate(sheer,b)-interpolate(hull_top,b)
        if da*db<0:
            crossings.append(a+(b-a)*da/(da-db))
    stations=sorted(set(stations+crossings))
    centers=[(section[0],section[3]) for section in hull_sections]
    verts=[]
    for y in stations:
        left,right=chord_edges([(py,px) for px,py in points],y)
        bottom=(interpolate(centers,y)-.08)*beam
        top=max(interpolate(sheer,y),interpolate(hull_top,y))*beam
        verts.extend([(left*beam*.55,y,bottom),(right*beam*.55,y,bottom),
                      (right*beam*.96,y,top-.16*beam),(right*beam*1.02,y,top-.06*beam),
                      (right*beam,y,top),(left*beam,y,top),
                      (left*beam*1.02,y,top-.06*beam),(left*beam*.96,y,top-.16*beam)])
    faces=[tuple(range(8))]
    for station in range(len(stations)-1):
        for edge in range(8):
            a=station*8+edge;b=station*8+(edge+1)%8
            faces.append((a,a+8,b+8,b))
    faces.append(tuple(reversed(range(len(verts)-8,len(verts)))))
    return mesh('sheer_casing',verts,faces,DECK,empty('cruise_deck','deck-casing'))


def sail_mesh(g,p,beam,parent):
    length=g['sailLength']*10/1.2
    center=g['sailY']*5
    base=beam*p.get('sailBase',.82)
    height=g['sailHeight']*5
    outline=[(x*beam*1.15,y*length+center) for x,y in g['sail']]
    n=len(outline)
    if p['openBridge']:
        verts=[]
        for inner,top in [(False,False),(False,True),(True,True),(True,False)]:
            for x,y in outline:
                fraction=(y-center)/length
                roof=base+height*interpolate(p['sailRoof'],fraction)
                verts.append((x*(.72 if inner else 1),center+(y-center)*(.79 if inner else 1),roof if top else base+height*.45 if inner else base))
        faces=[]
        for i in range(n):
            j=(i+1)%n
            faces.extend([(i,j,j+n,i+n),(i+n,j+n,j+2*n,i+2*n),(i+2*n,j+2*n,j+3*n,i+3*n),(i+3*n,j+3*n,j,i)])
        mesh('open_bridge_coaming',verts,faces,DECK,parent)
        plate('bridge_floor',[(x*.75,center+(y-center)*.82) for x,y in outline],base+height*.45,.035,BLACK,parent)
    else:
        # Loft an airfoil planform with the individually authored side roof.
        ys=sorted(set([y for _,y in g['sail']]+[y for y,_ in p['sailRoof'] if min(v[1] for v in g['sail'])<y<max(v[1] for v in g['sail'])]))
        verts=[]
        for y in ys:
            left,right=chord_edges([(py,px) for px,py in g['sail']],y)
            top=base+height*interpolate(p['sailRoof'],y)
            verts.extend([(left*beam*1.22,center+y*length,base-.035*beam),(right*beam*1.22,center+y*length,base-.035*beam),
                          (right*beam*1.15,center+y*length,base+(top-base)*.15),
                          (right*beam*1.12,center+y*length,base+(top-base)*.86),
                          (right*beam*.94,center+y*length,top),(left*beam*.94,center+y*length,top),
                          (left*beam*1.12,center+y*length,base+(top-base)*.86),
                          (left*beam*1.15,center+y*length,base+(top-base)*.15)])
        faces=[tuple(range(8))]
        for at in range(len(ys)-1):
            for edge in range(8):
                a=at*8+edge;b=at*8+(edge+1)%8
                faces.append((a,a+8,b+8,b))
        faces.append(tuple(reversed(range((len(ys)-1)*8,len(ys)*8))))
        mesh('sloped_sail',verts,faces,DECK,parent)
    return base,height,length


def submarine(entry):
    g=entry['geometry'];p=g['profile'];beam=5*g['beam']/g['length']
    hull=empty('pressure_hull','submarine-hull')
    obj=loft_body('outer_hull',[(y,rx*beam,rz*beam,z*beam) for y,rx,rz,z in p['sections']],SUB,hull,sides=24)
    if g['hull']=='streamlined':
        obj.data.materials.append(SONAR)
        for polygon in obj.data.polygons:
            if polygon.center.y>4.15:
                polygon.material_index=1
    if p.get('deckOutline'):
        casing=sheer_deck(p['deckOutline'],p['deckSheer'],beam,p['sections'])
        surface=surface_tree([obj,casing])
        openings=empty('flood_openings','flood-openings')
        for side in [-1,1]:
            for index in range(24):
                y=-3.4+index*6.8/23
                z=deck_height(p['deckSheer'],p['sections'],y)*beam-.07
                points=[]
                for dy,dz in [(-.0325,-.0125),(.0325,-.0125),(.0325,.0125),(-.0325,.0125)]:
                    hit,normal,_,_=surface.ray_cast(Vector((side*beam*2,y+dy,z+dz)),Vector((-side,0,0)))
                    if hit is None:break
                    points.append(hit+normal*.0015)
                if len(points)==4:
                    mesh('flood_slot',points,[(0,1,2,3) if side>0 else (3,2,1,0)],BLACK,openings)
    if p.get('missileDeck'):
        p={**p,'missileCasing':p['missileDeck']['casing'],'missileRows':p['missileDeck']['hatchRows']}
    for key,component,mat in [('sonarFairing','sonar-fairing',SONAR),('lowerFairwater','fairwater',DECK),('periscopeHousing','periscope-housing',DECK),('tailPod','towed-array-pod',DECK),('missileCasing','missile-casing',DECK)]:
        if p.get(key):
            sections=p[key]['sections'] if key=='lowerFairwater' else p[key]
            parent=empty(key,component)
            if key=='missileCasing' or (key=='lowerFairwater' and p[key]['kind']=='skirted'):
                sections=interpolated_sections(sections,3)
                verts=[]
                contour=[(-.98,-1.4),(-1,.18),(-.84,.90),(-.58,1),(.58,1),(.84,.90),(1,.18),(.98,-1.4)]
                for y,rx,rz,z in sections:
                    verts.extend((x*rx*beam,y,(z+h*rz)*beam)for x,h in contour)
                faces=[tuple(range(8))]
                for station in range(len(sections)-1):
                    for edge in range(8):
                        a=station*8+edge;b=station*8+(edge+1)%8
                        faces.append((a,a+8,b+8,b))
                faces.append(tuple(reversed(range(len(verts)-8,len(verts)))))
                mesh(key,verts,faces,mat,parent)
            else:
                loft_body(key,[(y,rx*beam,rz*beam,z*beam) for y,rx,rz,z in sections],mat,parent)
    if p.get('missileRows'):
        skin=[part for part in collection.objects if part.type=='MESH' and part.name.startswith(('outer_hull','missileCasing'))]
        for part in skin:
            triangulate=part.modifiers.new('casing_skin_triangles','TRIANGULATE')
            bpy.context.view_layer.objects.active=part
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
        surface=surface_tree(skin)
        for station in p['missileRows']:
            for side in [-1,1]:
                parent=empty('missile_hatch_'+str(station)+'_'+str(side),'missile-hatch')
                verts=[]
                for bottom in [True,False]:
                    for index in range(16):
                        angle=index*math.tau/16
                        x=beam*(side*.43+.21*math.cos(angle))
                        y=station+beam*.27*math.sin(angle)
                        hit,_,_,_=surface.ray_cast(Vector((x,y,beam*4)),Vector((0,0,-1)))
                        if hit is None:raise ValueError('Missile hatch must meet casing')
                        verts.append((x,y,hit.z+(-.012 if bottom else .001)))
                faces=[tuple(reversed(range(16))),tuple(range(16,32))]
                faces.extend((i,(i+1)%16,(i+1)%16+16,i+16)for i in range(16))
                mesh('closed_missile_hatch',verts,faces,SONAR,parent)
    sail=empty('submarine_sail','sail')
    base,height,length=sail_mesh(g,p,beam,sail)
    sail_y=g['sailY']*5
    if p.get('aaPlatform'):
        parent=empty('early_aa_platform','aa-platform')
        y=sail_y-length*.53;z=base+height*.50
        outline=[(math.cos(i*math.tau/12)*beam*.60,y+math.sin(i*math.tau/12)*.24) for i in range(12)]
        plate('wintergarten',outline,z,.055,DECK,parent)
        for index,(x,station) in enumerate(outline):
            if station < sail_y-length*.40:
                rod('platform_stanchion',(x,station,z),(x,station,z+.17),.008,DARK,parent)
                nx,ny=outline[(index+1)%len(outline)]
                rod('platform_rail',(x,station,z+.17),(nx,ny,z+.17),.008,DARK,parent)
        rod('platform_support',(0,y,beam*.76),(0,y,z),.055,DECK,parent)
        rod('aa_pedestal',(0,y,z),(0,y,z+.19),.032,DARK,parent)
        rod('20mm_aa_barrel',(0,y+.03,z+.22),(0,y-.35,z+.27),.015,DARK,parent)
        box('aa_breech',(0,y,z+.20),(.065,.10,.055),DARK,parent)
    masts=p['masts']
    mast_heights=masts['heights'] if masts['kind']=='heights' else [.20+index*.065 for index in range(masts['count'])]
    for index,mast_height in enumerate(mast_heights):
        y=sail_y+(-.23+index*.21)*length
        roof=base+height*interpolate(p['sailRoof'],(y-sail_y)/length)
        if p.get('periscopeHousing') and p['periscopeHousing'][0][0]<=y<=p['periscopeHousing'][-1][0]:
            roof=max(roof,interpolate([(station,rz+z) for station,_,rz,z in p['periscopeHousing']],y)*beam)
        foot=base+height*.45-.025 if p['openBridge'] else roof-.04
        rod('periscope_mast',(0,y,foot),(0,y,roof+mast_height),.016,DARK,sail)
        rod('periscope_head',(0,y,roof+mast_height),(0,y+.055,roof+mast_height),.023,DARK,sail)
    plane_y=sail_y+p.get('planeFraction',.15)*length if g['planes']=='sail' else 3.15
    plane_z=base+height*.60 if g['planes']=='sail' else .04
    for side in [-1,1]:
        parent=empty('diving_plane_'+str(side),'diving-plane')
        parent['plane_mount']=g['planes']
        wing_surface('diving_plane',[(0,plane_y+.25),(.9257,plane_y+.10),(1,plane_y-.19),(0,plane_y-.31)],beam*1.75,plane_z,.055,0,side,SUB,parent,chord_scale=1)
    if p['stern'] in ('cruciform','x'):
        for index in range(4):
            parent=empty('stern_rudder_'+str(index),'stern-rudder')
            parent.rotation_euler.y=index*math.pi/2+(math.pi/4 if p['stern']=='x' else 0)
            wing_surface('stern_fin',[(0,-3.62),(1,-3.97),(.9341,-4.38),(0,-4.35)],beam*1.67,0,.06,0,1,SUB,parent,chord_scale=1)
    else:
        for side in [-1,1]:
            parent=empty('stern_plane_'+str(side),'stern-rudder')
            parent['stern_control']='plane'
            plate('stern_plane',[(side*beam*.10,-3.64),(side*beam*1.45,-3.90),(side*beam*1.40,-4.37),(side*beam*.10,-4.35)],-.04,.06,SUB,parent)
        for side in ([-1,1] if p['stern']=='twin-rudder' else [0]):
            parent=empty('steering_rudder_'+str(side),'stern-rudder')
            parent['stern_control']='rudder'
            offset=side*beam*.47
            fin=vertical_fin('steering_rudder',[(-beam*.30,-4.43),(-beam*.24,-4.92),(beam*.95,-4.95),(beam*.85,-4.48)],.05,SUB,parent)
            fin.location.x=offset
            if side:
                rod('rudder_support',(0,-4.43,0),(offset,-4.50,0),.023,DARK,parent)
    for station,mast_height in p.get('deckMasts',[]):
        z=deck_height(p['deckSheer'],p['sections'],station)*beam
        rod('radio_mast',(0,station,z),(0,station,z+mast_height),.016,DARK)
        rod('mast_backstay',(0,station-.65,z),(0,station,z+mast_height*.85),.005,DARK)
    for shaft in range(g['shafts']):
        x=(shaft-(g['shafts']-1)/2)*beam
        parent=empty('screw_'+str(shaft),'propulsor')
        screw_y=-4.80 if g['shafts']==1 else -4.56
        rod('drive_shaft',(x,p.get('shaftRootY',-3.85),0),(x,screw_y,0),.036,DARK,parent)
        if entry['id']=='virginia-block-i':
            # Public exterior only: a hollow axial shroud and its supports.
            verts=[];segments=24
            for y,radius in [(-4.46,beam*.48),(-4.94,beam*.44),(-4.94,beam*.34),(-4.46,beam*.38)]:
                verts.extend((x+radius*math.cos(i*math.tau/segments),y,radius*math.sin(i*math.tau/segments)) for i in range(segments))
            faces=[]
            for band in range(4):
                for i in range(segments):
                    j=(i+1)%segments;next_band=(band+1)%4
                    faces.append((band*segments+i,band*segments+j,next_band*segments+j,next_band*segments+i))
            mesh('pumpjet_shroud',verts,faces,DARK,parent)
            ring('pumpjet_outer_lip',(x,-4.94,0),beam*.395,beam*.035,DECK,parent)
            ring('pumpjet_inner_throat',(x,-4.80,0),beam*.355,beam*.015,SUB,parent)
            for angle in [0,math.tau/3,math.tau*2/3]:
                rod('shroud_support',(x,-4.48,0),(x+beam*.38*math.cos(angle),-4.48,beam*.38*math.sin(angle)),.018,DARK,parent)
        else:
            for blade in range(g['blades']):
                angle=blade*math.tau/g['blades']
                radius=beam*.48
                swept_propeller_blade('swept_screw_blade',x,screw_y,angle,radius,WOOD,parent,mesh)
    if g['deckGun']:
        parent=empty('deck_gun','deck-gun');y=p.get('deckGunY',1.95)
        z=deck_height(p['deckSheer'],p['sections'],y)*beam+.18
        rod('gun_pedestal',(0,y,z-.19),(0,y,z+.10),.085,DECK,parent)
        rod('gun_barrel',(0,y-.12,z+.16),(0,y+.72,z+.22),.027,DARK,parent)
        box('gun_breech',(0,y-.11,z+.14),(.14,.20,.10),DARK,parent)
    if entry['id']=='gato':
        plate('aft_bridge_platform',[(-beam*.50,sail_y-.70),(beam*.50,sail_y-.70),(beam*.46,sail_y-.21),(-beam*.46,sail_y-.21)],base+height*.51,.065,DECK)
        # Early fairwater: connected periscope shears rise above the bridge coaming.
        for station in [sail_y-.05*length,sail_y+.20*length]:
            roof=base+height*interpolate(p['sailRoof'],(station-sail_y)/length)
            top=roof+.30
            for side in [-1,1]:
                rod('periscope_shear_leg',(side*beam*.22,station,base+height*.45-.025),(side*beam*.13,station,top),.021,DECK,sail)
            rod('periscope_shear_crossbar',(-beam*.13,station,top),(beam*.13,station,top),.023,DECK,sail)
    if g['hull']=='streamlined':
        for obj in collection.objects:
            if obj.type!='MESH':continue
            for slot in obj.material_slots:
                if slot.material==SUB:slot.material=MODERN_SUB
                elif slot.material==DECK:slot.material=MODERN_CASING


models = []
for index, entry in enumerate(ENTRIES):
    name = entry['modelId']
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    for key, value in [('archive_id', entry['id']), ('archive_category', entry['category']),
                       ('archive_year', entry['year']), ('archive_country', entry['country'])]:
        root[key] = value
    root['reference_length_m'] = entry['geometry']['length']
    root['reference_width_m'] = entry['geometry'].get('span', entry['geometry'].get('beam'))
    if entry['category'] == 'aircraft':
        aircraft(entry)
    else:
        submarine(entry)
    root['rebuild_generation']=10
    bevel_structures(collection)
    for parent in sorted({obj.parent for obj in collection.objects if obj.type == 'MESH'}, key=lambda obj: obj.name):
        meshes = [obj for obj in collection.objects if obj.type == 'MESH' and obj.parent == parent]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bpy.context.object.name = name + '-' + parent.name + '-geometry'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    path = OUT / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=False, export_extras=True, export_texcoords=False, export_normals=False)
    models.append({'id': name, 'file': path.name, 'bytes': path.stat().st_size,
                   'polygons': sum(len(obj.data.polygons) for obj in collection.objects if obj.type == 'MESH')})
    root.location = (index % 4 * 12, index // 4 * 14, 0)
    collection.hide_viewport = True
for group in bpy.context.scene.collection.children:
    group.hide_viewport = False
bpy.context.scene['regenerate'] = 'npm run models:build:archive'
bpy.context.scene['scope'] = 'First reference batch; global coverage is incomplete; scores are external council records.'
bpy.context.scene.view_settings.view_transform = 'Standard'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'century-archive.blend'))
(OUT / 'archive-manifest.json').write_text(json.dumps({'generator': 'Blender ' + bpy.app.version_string,
    'source': 'assets/blender/century-archive.blend', 'models': models}, indent=2) + '\n')
print('CENTURY_ARCHIVE_COMPLETE', len(models))
