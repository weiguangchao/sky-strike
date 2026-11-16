import { Box3, DirectionalLight, HemisphereLight, Mesh, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { ModelLibrary } from '../game/models.ts';
import type { ModelId } from '../game/models.ts';

/** Browser-only review evidence, rendered from the exact exported GLBs. */
export async function archiveViews(modelId: ModelId): Promise<string[]> {
  const library = new ModelLibrary();
  await library.loadModel(modelId);
  const instance = library.instantiate(modelId, 1);
  const scene = new Scene();
  scene.add(instance.root, new HemisphereLight(0xd9edff, 0x162c42, 1.4));
  const sun = new DirectionalLight(0xfff2dc, 3);
  sun.position.set(-10, 20, -8); scene.add(sun);
  const fill = new DirectionalLight(0xd9edff, 1.4);
  fill.position.set(12, 6, 2); scene.add(fill);
  const renderer = new WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(640, 400); renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x162936, 1);
  const camera = new OrthographicCamera(-8, 8, 5, -5, .1, 100);
  instance.root.updateMatrixWorld(true);
  const center = new Box3().setFromObject(instance.root).getCenter(new Vector3());
  const images: string[] = [];
  for (const direction of [[2, 8, 4], [0, 10, .001], [10, .001, 0], [0, .001, -10]]) {
    camera.position.copy(center).add(new Vector3(...direction).multiplyScalar(2));
    camera.lookAt(center); camera.updateMatrixWorld(true);
    const projected = new Box3(), vertex = new Vector3();
    instance.root.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let at = 0; at < positions.count; at++) projected.expandByPoint(vertex.fromBufferAttribute(positions, at).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse));
    });
    const size = projected.getSize(new Vector3()), midpoint = projected.getCenter(new Vector3());
    const span = Math.max(size.y, size.x / 1.6) * 1.12;
    camera.left = midpoint.x - span * .8; camera.right = midpoint.x + span * .8;
    camera.bottom = midpoint.y - span / 2; camera.top = midpoint.y + span / 2;
    camera.updateProjectionMatrix(); renderer.render(scene, camera);
    images.push(renderer.domElement.toDataURL('image/png'));
  }
  // Evidence runs create many contexts; explicitly release GPU resources.
  instance.root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  renderer.dispose(); renderer.forceContextLoss();
  return images;
}
