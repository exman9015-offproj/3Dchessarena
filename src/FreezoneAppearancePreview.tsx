import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createFreezoneAppearancePreview } from './freezoneAppearance.js';

type Props = { appearance: string; label: string };

export default function FreezoneAppearancePreview({ appearance, label }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    setPreviewError('');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(2.1, 1.8, 2.5);
    camera.lookAt(0, 0.8, 0);
    scene.add(new THREE.HemisphereLight(0xdceeff, 0x252033, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffe6bc, 2.3);
    keyLight.position.set(2, 4, 3);
    scene.add(keyLight);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'WebGL is unavailable');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(112, 112);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    const model = createFreezoneAppearancePreview(appearance, '#777d96');
    scene.add(model);
    let frame = 0;
    const render = () => {
      model.rotation.y += 0.006;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      scene.remove(model);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry.type === 'CylinderGeometry') object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [appearance]);

  return (
    <div ref={hostRef} className="freezone-appearance-preview" role="img" aria-label={`${label} 3D preview`}>
      {previewError && <span role="status">3D preview unavailable: {previewError}</span>}
    </div>
  );
}
