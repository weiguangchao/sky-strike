"""Shared authored surface treatment for the vehicle library, before mesh joining."""
import math
import bpy


def cambered_fin(name,outline,width,material,parent,own_mesh):
    """Closed symmetric airfoil sections, retaining the authored Y/Z perimeter."""
    bottom=min(z for y,z in outline);top=max(z for y,z in outline)
    stations=sorted(set([z for y,z in outline]+[bottom+(top-bottom)*fraction for fraction in [.20,.35,.50,.65,.80]]))
    fractions=[0,.06,.15,.30,.50,.72,.90,1]
    def thickness(t):
        return max(0,.2969*math.sqrt(t)-.1260*t-.3516*t*t+.2843*t**3-.1036*t**4)
    reference=thickness(.30)
    sections=[]
    for height in stations:
        ends=[]
        for a,b in zip(outline,outline[1:]+outline[:1]):
            if abs(a[1]-b[1])<1e-9:
                if abs(height-a[1])<1e-9:ends.extend([a[0],b[0]])
            elif min(a[1],b[1])-1e-9<=height<=max(a[1],b[1])+1e-9:
                ends.append(a[0]+(b[0]-a[0])*(height-a[1])/(b[1]-a[1]))
        sections.append((height,max(ends),min(ends)))
    maximum_chord=max(leading-trailing for height,leading,trailing in sections)
    vertices=[];lookup={};rings=[]
    for height,leading,trailing in sections:
        chord=leading-trailing
        span=(height-bottom)/max(top-bottom,1e-9)
        gain=.85+.15*math.sin(math.pi*span)
        ring=[]
        # Counter-clockwise section: trailing edge, starboard, leading edge, port.
        for side,steps in [(1,list(reversed(fractions))),(-1,fractions[1:-1])]:
            for t in steps:
                point=(side*width*.5*gain*chord/maximum_chord*thickness(t)/reference if chord>1e-9 else 0,leading-chord*t,height)
                key=tuple(round(value,9) for value in point)
                if key not in lookup:lookup[key]=len(vertices);vertices.append(point)
                ring.append(lookup[key])
        rings.append(ring)
    faces=[]
    for a,b in zip(rings,rings[1:]):
        for i in range(len(a)):
            face=tuple(dict.fromkeys([a[i],a[(i+1)%len(a)],b[(i+1)%len(b)],b[i]]))
            if len(face)>=3:faces.append(face)
    for ring,reverse in [(rings[0],True),(rings[-1],False)]:
        cap=tuple(dict.fromkeys(ring))
        if len(cap)>=3:faces.append(tuple(reversed(cap)) if reverse else cap)
    return own_mesh(name,vertices,faces,material,parent)


def bevel_structures(collection):
    """Chamfer structural edges; leave fine fittings and reference wing boundaries intact."""
    eligible = ('bridge-', 'gunhouse-', 'funnel-', 'raked-funnel','rolled-rim-funnel', 'navigation-level',
                'armored-gunhouse', 'armored-turret', 'sail_shell', 'sail_roof',
                'engine-cowling', 'radial-engine-front', 'canopy_frame')
    for obj in list(collection.objects):
        if obj.type != 'MESH' or not obj.name.startswith(eligible):
            continue
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = obj.modifiers.new('fabricated-edge-chamfer', 'BEVEL')
        bevel.width = min(.025, min(obj.dimensions) * .13)
        bevel.segments = 1
        bevel.affect = 'EDGES'
        bevel.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        obj.select_set(False)


def interpolated_sections(sections, samples=2):
    """Add continuous longitudinal curvature while retaining every authored station."""
    result = []
    for index in range(len(sections) - 1):
        a, b = sections[index], sections[index + 1]
        previous = sections[max(0, index - 1)]
        following = sections[min(len(sections) - 1, index + 2)]
        result.append(a)
        for part in range(1, samples):
            t = part / samples
            values = [a[0] + (b[0] - a[0]) * t]
            for channel in range(1, len(a)):
                pa, pb = a[channel], b[channel]
                slope_a = (pb - previous[channel]) / max(.0001, b[0] - previous[0])
                slope_b = (following[channel] - pa) / max(.0001, following[0] - a[0])
                span = b[0] - a[0]
                value = (2*t**3-3*t**2+1)*pa + (t**3-2*t**2+t)*span*slope_a + (-2*t**3+3*t**2)*pb + (t**3-t**2)*span*slope_b
                values.append(max(min(pa, pb), min(max(pa, pb), value)))
            result.append(tuple(values))
    result.append(sections[-1])
    return result


def swept_propeller_blade(name, center_x, center_y, angle, radius, material, parent, own_mesh):
    """A twisted blade has a root, broad swept tip and a real thickness."""
    stations = [(.10,.10,0),(.30,.22,.08),(.64,.25,.16),(.94,.13,.25),(1,.025,.28)]
    vertices = []
    for radial, chord, sweep in stations:
        for side in [-1, 1]:
            for surface in [-1, 1]:
                tangent = sweep * radius + side * chord * radius * .5
                axial = surface * .012 + side * chord * radius * (.20 - radial*.12)
                vertices.append((center_x + math.cos(angle)*tangent + math.sin(angle)*radial*radius,
                                 center_y + axial,
                                 -math.sin(angle)*tangent + math.cos(angle)*radial*radius))
    faces = [(0,2,3,1)]
    for at in range(len(stations) - 1):
        start = at * 4
        faces.extend((start+a,start+b,start+b+4,start+a+4) for a,b in [(0,1),(1,3),(3,2),(2,0)])
    end = (len(stations) - 1) * 4
    faces.append((end,end+1,end+3,end+2))
    return own_mesh(name, vertices, faces, material, parent)
