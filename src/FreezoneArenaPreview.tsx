import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  getFreezoneArenaCellPosition,
  getFreezoneArenaCells
} from './freezoneRules.js';

type PreviewPiece = {
  id: string;
  side: number;
  type: string;
  r: number;
  c: number;
  level?: number;
};

type PreviewSpawn = { side: number; r: number; c: number };
export type FreezoneDraftOrb = { id: string; r: number; c: number; level: number; type?: string };
type PreviewMove = { r: number; c: number; level?: number };
type GizmoMode = 'move' | 'scale';
type GizmoAxis = 'x' | 'y' | 'z';
export type FreezoneTerrainTool = 'pieces' | 'orb' | 'select' | 'floor' | 'wall' | 'erase' | 'paint';
export type FreezoneTerrainChange = {
  r: number;
  c: number;
  level: number;
  kind: 'floor' | 'wall' | 'erase';
  color?: string;
  rotationX?: number;
  rotationZ?: number;
};
type Props = {
  format: string;
  tileGeometry: string;
  boardSize: number;
  surfaceColor: string;
  edgeColor: string;
  pieces: PreviewPiece[];
  draftOrbs: FreezoneDraftOrb[];
  spawnPoints: PreviewSpawn[];
  selectedPieceId: string;
  terrainChanges: FreezoneTerrainChange[];
  selectedTerrainKeys: string[];
  terrainTool: FreezoneTerrainTool;
  terrainLevel: number;
  gizmoMode: GizmoMode;
  boundsSize: { width: number; depth: number; height: number };
  brushColor: string;
  immersive: boolean;
  playtestMode: boolean;
  legalMoves: PreviewMove[];
  onCellClick: (row: number, col: number) => void;
  onTerrainSelectCellClick: (row: number, col: number, level: number, additive: boolean) => void;
  onMoveSelectedTerrain: (axis: GizmoAxis, steps: number) => void;
  onScaleSelectedTerrain: (steps: number) => void;
  onPlaytestCellClick: (row: number, col: number, level: number) => void;
  onTerrainCellClick: (row: number, col: number, level: number, tool: FreezoneTerrainTool) => void;
};

const PREVIEW_TILE_SPACING = 0.13;
const PREVIEW_TILE_SIZE = PREVIEW_TILE_SPACING * 0.92;
const TILE_HEIGHT = 0.035;
const TERRAIN_LEVEL_HEIGHT = 0.18;
const SIDE_COLORS = [
  '#f5eee0', '#d4af37', '#e65b55', '#559ce3', '#59bd70',
  '#e6973f', '#a66be0', '#4cc8c7', '#db5aab', '#d6c941'
];

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  group.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export default function FreezoneArenaPreview(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const clickMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const terrainPlaneRef = useRef<THREE.Mesh | null>(null);
  const ghostTileRef = useRef<THREE.Mesh | null>(null);
  const ghostOrbRef = useRef<THREE.Mesh | null>(null);
  const scaleHandleRef = useRef<THREE.Mesh | null>(null);
  const moveHandlesRef = useRef<THREE.Mesh[]>([]);
  const terrainCenterRef = useRef({ x: 0, z: 0 });
  const propsRef = useRef(props);
  const [previewError, setPreviewError] = useState('');
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10141c');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(5, 6, 8);
    const renderer = (() => {
      try {
        return new THREE.WebGLRenderer({ antialias: true, alpha: false });
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'WebGL is unavailable');
        return null;
      }
    })();
    if (!renderer) return undefined;

    setPreviewError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D arena preview');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-describedby', 'freezone-preview-controls-hint');
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.48;
    const hemisphere = new THREE.HemisphereLight(0xdce9ff, 0x29212a, 2.1);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xffe6bc, 2.1);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    boardGroupRef.current = boardGroup;

    let frame = 0;
    let pointerStart: { x: number; y: number } | null = null;
    let moveDrag: {
      axis: GizmoAxis;
      startX: number;
      startY: number;
      screenX: number;
      screenY: number;
      lastSteps: number;
      pointerId: number;
    } | null = null;
    let scaleDrag: { startX: number; lastSteps: number; pointerId: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      if (event.button === 0 && propsRef.current.terrainTool === 'select' &&
          propsRef.current.gizmoMode === 'move' && moveHandlesRef.current.length) {
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(moveHandlesRef.current, false)[0];
        const axis = hit?.object.userData.gizmoAxis as GizmoAxis | undefined;
        const direction = hit?.object.userData.gizmoDirection as THREE.Vector3 | undefined;
        if (axis && direction) {
          const screenStart = hit.object.getWorldPosition(new THREE.Vector3()).project(camera);
          const screenEnd = hit.object.getWorldPosition(new THREE.Vector3())
            .add(direction)
            .project(camera);
          const screenX = screenEnd.x - screenStart.x;
          const screenY = screenStart.y - screenEnd.y;
          const screenLength = Math.hypot(screenX, screenY);
          moveDrag = {
            axis,
            startX: event.clientX,
            startY: event.clientY,
            screenX: screenX / Math.max(screenLength, 0.001),
            screenY: screenY / Math.max(screenLength, 0.001),
            lastSteps: 0,
            pointerId: event.pointerId
          };
          controls.enabled = false;
          renderer.domElement.setPointerCapture(event.pointerId);
          return;
        }
      }
      if (propsRef.current.terrainTool !== 'select' ||
          propsRef.current.gizmoMode !== 'scale' ||
          !scaleHandleRef.current || event.button !== 0) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.intersectObject(scaleHandleRef.current, false).length) return;
      scaleDrag = { startX: event.clientX, lastSteps: 0, pointerId: event.pointerId };
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (moveDrag && moveDrag.pointerId === event.pointerId) {
        moveDrag = null;
        controls.enabled = true;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        pointerStart = null;
        return;
      }
      if (scaleDrag && scaleDrag.pointerId === event.pointerId) {
        scaleDrag = null;
        controls.enabled = true;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        pointerStart = null;
        return;
      }
      if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
        pointerStart = null;
        return;
      }
      pointerStart = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      if (propsRef.current.terrainTool === 'select') {
        const hit = raycaster.intersectObjects(clickMeshesRef.current, false)[0];
        if (!hit || hit.instanceId === undefined) return;
        const cells = hit.object.userData.cells as Array<{ r: number; c: number; level: number }> | undefined;
        const cell = cells?.[hit.instanceId];
        if (cell) {
          propsRef.current.onTerrainSelectCellClick(cell.r, cell.c, cell.level, event.shiftKey);
        }
        return;
      }
      if (propsRef.current.terrainTool === 'pieces') {
        const hit = raycaster.intersectObjects(clickMeshesRef.current, false)[0];
        if (!hit || hit.instanceId === undefined) return;
        const cells = hit.object.userData.cells as Array<{ r: number; c: number; level: number }> | undefined;
        const cell = cells?.[hit.instanceId];
        if (cell) {
          if (propsRef.current.playtestMode) {
            propsRef.current.onPlaytestCellClick(cell.r, cell.c, cell.level);
          } else {
            propsRef.current.onCellClick(cell.r, cell.c);
          }
        }
        return;
      }
      const plane = terrainPlaneRef.current;
      const hit = plane ? raycaster.intersectObject(plane, false)[0] : undefined;
      if (!hit) return;
      const { format, boardSize, terrainLevel, terrainTool, onTerrainCellClick } = propsRef.current;
      let nearest: { r: number; c: number } | null = null;
      let nearestDistance = Infinity;
      for (const cell of getFreezoneArenaCells(boardSize, format)) {
        const position = getFreezoneArenaCellPosition(cell.r, cell.c, boardSize, format);
        const x = position.x * PREVIEW_TILE_SPACING - terrainCenterRef.current.x;
        const z = position.z * PREVIEW_TILE_SPACING - terrainCenterRef.current.z;
        const distance = Math.hypot(hit.point.x - x, hit.point.z - z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = cell;
        }
      }
      if (nearest && nearestDistance <= PREVIEW_TILE_SPACING * 0.72) {
        onTerrainCellClick(nearest.r, nearest.c, terrainLevel, terrainTool);
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      if ((!scaleDrag || scaleDrag.pointerId !== event.pointerId) &&
          (!moveDrag || moveDrag.pointerId !== event.pointerId)) return;
      scaleDrag = null;
      moveDrag = null;
      pointerStart = null;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (moveDrag && moveDrag.pointerId === event.pointerId && event.buttons === 1) {
        const distance =
          (event.clientX - moveDrag.startX) * moveDrag.screenX +
          (event.clientY - moveDrag.startY) * moveDrag.screenY;
        const steps = Math.trunc(distance / 12);
        if (steps !== moveDrag.lastSteps) {
          propsRef.current.onMoveSelectedTerrain(moveDrag.axis, steps - moveDrag.lastSteps);
          moveDrag.lastSteps = steps;
        }
        return;
      }
      if (scaleDrag && scaleDrag.pointerId === event.pointerId && event.buttons === 1) {
        const steps = Math.trunc((event.clientX - scaleDrag.startX) / 12);
        if (steps !== scaleDrag.lastSteps) {
          propsRef.current.onScaleSelectedTerrain(steps - scaleDrag.lastSteps);
          scaleDrag.lastSteps = steps;
        }
        return;
      }
      const ghost = ghostTileRef.current;
      const { terrainTool, brushColor, terrainLevel, format: currentFormat, boardSize: currentSize } = propsRef.current;
      const orbGhost = ghostOrbRef.current;
      if (terrainTool === 'pieces' || terrainTool === 'select') {
        if (ghost) ghost.visible = false;
        if (orbGhost) orbGhost.visible = false;
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const plane = terrainPlaneRef.current;
      const hit = plane ? raycaster.intersectObject(plane, false)[0] : undefined;
      if (!hit) {
        if (ghost) ghost.visible = false;
        if (orbGhost) orbGhost.visible = false;
        return;
      }
      let nearest: THREE.Vector3 | null = null;
      let nearestDistance = Infinity;
      for (const cell of getFreezoneArenaCells(currentSize, currentFormat)) {
        const position = getFreezoneArenaCellPosition(cell.r, cell.c, currentSize, currentFormat);
        const x = position.x * PREVIEW_TILE_SPACING - terrainCenterRef.current.x;
        const z = position.z * PREVIEW_TILE_SPACING - terrainCenterRef.current.z;
        const distance = Math.hypot(hit.point.x - x, hit.point.z - z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = new THREE.Vector3(x, 0, z);
        }
      }
      if (!nearest || nearestDistance > PREVIEW_TILE_SPACING * 0.72) {
        if (ghost) ghost.visible = false;
        if (orbGhost) orbGhost.visible = false;
        return;
      }
      if (terrainTool === 'orb') {
        if (ghost) ghost.visible = false;
        if (!orbGhost) return;
        if (orbGhost.material instanceof THREE.MeshStandardMaterial) {
          orbGhost.material.color.set(brushColor);
        }
        orbGhost.position.set(
          nearest.x,
          terrainLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.038,
          nearest.z
        );
        orbGhost.visible = true;
      } else {
        if (orbGhost) orbGhost.visible = false;
        if (!ghost) return;
        if (ghost.material instanceof THREE.MeshBasicMaterial) {
          ghost.material.color.set(terrainTool === 'erase' ? '#ef6171' : brushColor);
        }
        ghost.position.set(
          nearest.x,
          terrainLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT * 0.5,
          nearest.z
        );
        ghost.visible = true;
      }
    };
    const onPointerLeave = () => {
      if (ghostTileRef.current) ghostTileRef.current.visible = false;
      if (ghostOrbRef.current) ghostOrbRef.current.visible = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        return;
      }
      event.preventDefault();
      const forward = controls.target.clone().sub(camera.position);
      forward.y = 0;
      forward.normalize();
      const right = forward.clone().cross(camera.up).normalize();
      const direction = new THREE.Vector3();
      if (key === 'w' || key === 'arrowup') direction.add(forward);
      if (key === 's' || key === 'arrowdown') direction.sub(forward);
      if (key === 'd' || key === 'arrowright') direction.add(right);
      if (key === 'a' || key === 'arrowleft') direction.sub(right);
      if (key === 'e') direction.y += 1;
      if (key === 'q') direction.y -= 1;
      if (!direction.lengthSq()) return;
      direction.normalize().multiplyScalar(0.35);
      camera.position.add(direction);
      controls.target.add(direction);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('lostpointercapture', onPointerCancel);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('keydown', onKeyDown);

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', onPointerCancel);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('keydown', onKeyDown);
      controls.dispose();
      disposeGroup(boardGroup);
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      boardGroupRef.current = null;
      clickMeshesRef.current = [];
      terrainPlaneRef.current = null;
      ghostTileRef.current = null;
      ghostOrbRef.current = null;
      scaleHandleRef.current = null;
      moveHandlesRef.current = [];
      terrainCenterRef.current = { x: 0, z: 0 };
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const group = boardGroupRef.current;
    if (!scene || !camera || !controls || !group) return;

    disposeGroup(group);
    const { format, boardSize, surfaceColor, edgeColor, pieces, spawnPoints, selectedPieceId } = props;
    const cells = getFreezoneArenaCells(boardSize, format);
    if (!cells.length) return;

    const terrainChanges = new Map(
      props.terrainChanges.map((change) => [`${change.r},${change.c},${change.level}`, change])
    );
    const positions = new Map<string, THREE.Vector3>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const cell of cells) {
      const position = getFreezoneArenaCellPosition(cell.r, cell.c, boardSize, format);
      const vector = new THREE.Vector3(
        position.x * PREVIEW_TILE_SPACING,
        0,
        position.z * PREVIEW_TILE_SPACING
      );
      positions.set(`${cell.r},${cell.c}`, vector);
      minX = Math.min(minX, vector.x);
      maxX = Math.max(maxX, vector.x);
      minZ = Math.min(minZ, vector.z);
      maxZ = Math.max(maxZ, vector.z);
    }
    const offsetX = (minX + maxX) * 0.5;
    const offsetZ = (minZ + maxZ) * 0.5;
    terrainCenterRef.current = { x: offsetX, z: offsetZ };
    group.position.set(0, 0, 0);

    const floorTiles: Array<{
      r: number;
      c: number;
      level: number;
      color?: string;
      rotationX?: number;
      rotationZ?: number;
    }> = [];
    for (const cell of cells) {
      const baseChange = terrainChanges.get(`${cell.r},${cell.c},0`);
      if (baseChange?.kind !== 'erase') {
        floorTiles.push({
          ...cell,
          level: 0,
          color: baseChange?.color,
          rotationX: baseChange?.rotationX,
          rotationZ: baseChange?.rotationZ
        });
      }
    }
    for (const change of props.terrainChanges) {
      if (change.level !== 0 && change.kind === 'floor') {
        floorTiles.push({
          r: change.r,
          c: change.c,
          level: change.level,
          color: change.color,
          rotationX: change.rotationX,
          rotationZ: change.rotationZ
        });
      }
    }
    const byShade = [[], []] as Array<Array<{
      r: number;
      c: number;
      level: number;
      color?: string;
      rotationX?: number;
      rotationZ?: number;
    }>>;
    for (const tile of floorTiles) byShade[(tile.r + tile.c) % 2].push(tile);
    const tileMaterials = [
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.68 }),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72 })
    ];
    const tileGeometry = props.tileGeometry === 'hexagonal'
      ? new THREE.CylinderGeometry(
        PREVIEW_TILE_SPACING * 0.9,
        PREVIEW_TILE_SPACING * 0.9,
        TILE_HEIGHT,
        6
      )
      : props.tileGeometry === 'triangle'
        ? new THREE.CylinderGeometry(
          PREVIEW_TILE_SPACING * 0.62,
          PREVIEW_TILE_SPACING * 0.62,
          TILE_HEIGHT,
          3
        )
        : props.tileGeometry === 'round'
          ? new THREE.CylinderGeometry(
            PREVIEW_TILE_SPACING * 0.48,
            PREVIEW_TILE_SPACING * 0.48,
            TILE_HEIGHT,
            20
          )
          : new THREE.BoxGeometry(PREVIEW_TILE_SIZE, TILE_HEIGHT, PREVIEW_TILE_SIZE);
    const instanceMeshes: THREE.InstancedMesh[] = [];
    const transform = new THREE.Object3D();
    for (let shade = 0; shade < byShade.length; shade += 1) {
      const shadeCells = byShade[shade];
      const mesh = new THREE.InstancedMesh(tileGeometry, tileMaterials[shade], shadeCells.length);
      mesh.userData.cells = shadeCells;
      shadeCells.forEach((tile, index) => {
        const position = positions.get(`${tile.r},${tile.c}`)!;
        transform.position.set(position.x - offsetX, tile.level * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT * 0.5, position.z - offsetZ);
        transform.rotation.set(
          (tile.rotationX || 0) * Math.PI / 180,
          props.tileGeometry === 'triangle' && (tile.r + tile.c) % 2 ? Math.PI : 0,
          (tile.rotationZ || 0) * Math.PI / 180
        );
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        const tileColor = new THREE.Color(tile.color || surfaceColor);
        if (shade === 1) tileColor.multiplyScalar(0.42);
        mesh.setColorAt(index, tileColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.cells = shadeCells;
      group.add(mesh);
      instanceMeshes.push(mesh);
    }
    clickMeshesRef.current = instanceMeshes;
    const planeGeometry = new THREE.PlaneGeometry(
      Math.max(maxX - minX + PREVIEW_TILE_SPACING, PREVIEW_TILE_SPACING),
      Math.max(maxZ - minZ + PREVIEW_TILE_SPACING, PREVIEW_TILE_SPACING)
    );
    const terrainPlane = new THREE.Mesh(
      planeGeometry,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    terrainPlane.rotation.x = -Math.PI * 0.5;
    terrainPlane.position.set(
      -offsetX,
      props.terrainLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.02,
      -offsetZ
    );
    group.add(terrainPlane);
    terrainPlaneRef.current = terrainPlane;

    const ghostGeometry = tileGeometry.clone();
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: surfaceColor,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });
    const ghost = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghost.visible = false;
    ghost.renderOrder = 5;
    group.add(ghost);
    ghostTileRef.current = ghost;
    const ghostOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.034, 12, 10),
      new THREE.MeshStandardMaterial({
        color: props.brushColor,
        emissive: props.brushColor,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.68
      })
    );
    ghostOrb.visible = false;
    group.add(ghostOrb);
    ghostOrbRef.current = ghostOrb;

    scene.background = new THREE.Color(edgeColor);
    const boundaryColor = new THREE.Color(edgeColor).lerp(new THREE.Color(surfaceColor), 0.18);
    const boundaryMaterial = new THREE.MeshStandardMaterial({
      color: boundaryColor,
      emissive: edgeColor,
      emissiveIntensity: 0.35,
      metalness: 0.35,
      roughness: 0.45
    });
    const validKeys = new Set(cells.map(({ r, c }) => `${r},${c}`));
    const edgeGeometry = new THREE.BoxGeometry(1, 0.026, 0.014);
    const addBoundary = (x: number, z: number, dx: number, dz: number) => {
      const length = Math.hypot(dx, dz) * 1.02;
      const edge = new THREE.Mesh(edgeGeometry, boundaryMaterial);
      edge.position.set(x, TILE_HEIGHT + 0.005, z);
      edge.scale.x = length;
      edge.rotation.y = -Math.atan2(dz, dx);
      group.add(edge);
    };
    if (format === 'hexagonal') {
      const neighbors = [
        { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
        { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
        { dr: -1, dc: -1 }, { dr: 1, dc: 1 }
      ];
      for (const cell of cells) {
        const position = positions.get(`${cell.r},${cell.c}`)!;
        for (const neighbor of neighbors) {
          if (validKeys.has(`${cell.r + neighbor.dr},${cell.c + neighbor.dc}`)) continue;
          const next = getFreezoneArenaCellPosition(
            cell.r + neighbor.dr,
            cell.c + neighbor.dc,
            boardSize,
            format
          );
          const dx = (next.x - position.x) * PREVIEW_TILE_SPACING;
          const dz = (next.z - position.z) * PREVIEW_TILE_SPACING;
          addBoundary(
            position.x - offsetX + dx * 0.5,
            position.z - offsetZ + dz * 0.5,
            -dz / Math.sqrt(3),
            dx / Math.sqrt(3)
          );
        }
      }
    } else {
      const rowStep = getFreezoneArenaCellPosition(1, 0, boardSize, format);
      const rowOrigin = getFreezoneArenaCellPosition(0, 0, boardSize, format);
      const colStep = getFreezoneArenaCellPosition(0, 1, boardSize, format);
      const colOrigin = getFreezoneArenaCellPosition(0, 0, boardSize, format);
      const rowVector = {
        x: (rowStep.x - rowOrigin.x) * PREVIEW_TILE_SPACING,
        z: (rowStep.z - rowOrigin.z) * PREVIEW_TILE_SPACING
      };
      const colVector = {
        x: (colStep.x - colOrigin.x) * PREVIEW_TILE_SPACING,
        z: (colStep.z - colOrigin.z) * PREVIEW_TILE_SPACING
      };
      const neighbors = [
        { dr: -1, dc: 0, vector: { x: -rowVector.x, z: -rowVector.z }, edge: colVector },
        { dr: 1, dc: 0, vector: rowVector, edge: colVector },
        { dr: 0, dc: -1, vector: { x: -colVector.x, z: -colVector.z }, edge: rowVector },
        { dr: 0, dc: 1, vector: colVector, edge: rowVector }
      ];
      for (const cell of cells) {
        const position = positions.get(`${cell.r},${cell.c}`)!;
        for (const neighbor of neighbors) {
          if (validKeys.has(`${cell.r + neighbor.dr},${cell.c + neighbor.dc}`)) continue;
          const x = position.x - offsetX + neighbor.vector.x * 0.5;
          const z = position.z - offsetZ + neighbor.vector.z * 0.5;
          addBoundary(x, z, neighbor.edge.x, neighbor.edge.z);
        }
      }

    }

    const halfWidth = props.boundsSize.width * PREVIEW_TILE_SPACING * 0.5;
    const halfDepth = props.boundsSize.depth * PREVIEW_TILE_SPACING * 0.5;
    const halfHeight = props.boundsSize.height * TERRAIN_LEVEL_HEIGHT * 0.5;
    const volume = new THREE.Box3(
      new THREE.Vector3(
        -halfWidth,
        -halfHeight,
        -halfDepth
      ),
      new THREE.Vector3(
        halfWidth,
        halfHeight,
        halfDepth
      )
    );
    group.add(new THREE.Box3Helper(volume, new THREE.Color('#8de6ed')));

    const wallGeometry = new THREE.BoxGeometry(
      PREVIEW_TILE_SIZE * 0.88,
      TERRAIN_LEVEL_HEIGHT * 0.9,
      PREVIEW_TILE_SIZE * 0.16
    );
    for (const change of props.terrainChanges) {
      if (change.kind !== 'wall') continue;
      const position = positions.get(`${change.r},${change.c}`);
      if (!position) continue;
      const wall = new THREE.Mesh(
        wallGeometry,
        new THREE.MeshStandardMaterial({
          color: edgeColor,
          emissive: edgeColor,
          emissiveIntensity: 0.22,
          roughness: 0.55
        })
      );
      wall.position.set(
        position.x - offsetX,
        change.level * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + TERRAIN_LEVEL_HEIGHT * 0.45,
        position.z - offsetZ
      );
      group.add(wall);
    }

    const pieceGeometry = new THREE.CylinderGeometry(0.032, 0.046, 0.085, 12);
    for (const piece of pieces) {
      const position = positions.get(`${piece.r},${piece.c}`);
      if (!position) continue;
      const material = new THREE.MeshStandardMaterial({
        color: SIDE_COLORS[piece.side % SIDE_COLORS.length],
        metalness: 0.12,
        roughness: 0.38,
        emissive: piece.id === selectedPieceId ? '#42d4ff' : '#000000',
        emissiveIntensity: piece.id === selectedPieceId ? 0.65 : 0
      });
      const token = new THREE.Mesh(pieceGeometry, material);
      const pieceLevel = piece.level ?? 0;
      token.position.set(
        position.x - offsetX,
        pieceLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.047,
        position.z - offsetZ
      );
      group.add(token);
      if (piece.id === selectedPieceId) {
        const selection = new THREE.Mesh(
          new THREE.TorusGeometry(0.052, 0.006, 6, 18),
          new THREE.MeshBasicMaterial({ color: '#42d4ff' })
        );
        selection.rotation.x = -Math.PI * 0.5;
        selection.position.set(
          position.x - offsetX,
          pieceLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.008,
          position.z - offsetZ
        );
        group.add(selection);
      }
    }

    for (const orb of props.draftOrbs || []) {
      const position = positions.get(`${orb.r},${orb.c}`);
      if (!position) continue;
      const orbColors: Record<string, string> = {
        xp: '#45ddff',
        red: '#ff5364',
        blue: '#4ea8de',
        yellow: '#ffd84a',
        purple: '#c98bff',
        white: '#f3f5ff',
        bot: '#62e6a5',
        movement: '#ff9a45'
      };
      const orbColor = orbColors[orb.type || 'xp'] || orbColors.xp;
      const object = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 12, 10),
        new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 0.72,
          metalness: 0.12,
          roughness: 0.3
        })
      );
      object.position.set(
        position.x - offsetX,
        orb.level * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.038,
        position.z - offsetZ
      );
      group.add(object);
    }

    const spawnGeometry = new THREE.TorusGeometry(0.052, 0.006, 6, 18);
    for (const spawn of spawnPoints) {
      const position = positions.get(`${spawn.r},${spawn.c}`);
      if (!position) continue;
      const spawnRing = new THREE.Mesh(
        spawnGeometry,
        new THREE.MeshBasicMaterial({ color: '#67e8a5' })
      );
      spawnRing.rotation.x = -Math.PI * 0.5;
      spawnRing.position.set(position.x - offsetX, TILE_HEIGHT + 0.009, position.z - offsetZ);
      group.add(spawnRing);
    }

    const legalMoveGeometry = new THREE.TorusGeometry(0.043, 0.008, 6, 14);
    const legalMoveMaterial = new THREE.MeshBasicMaterial({ color: '#67e8a5' });
    for (const move of props.legalMoves) {
      const position = positions.get(`${move.r},${move.c}`);
      if (!position) continue;
      const marker = new THREE.Mesh(legalMoveGeometry, legalMoveMaterial);
      marker.rotation.x = -Math.PI * 0.5;
      marker.position.set(
        position.x - offsetX,
        props.playtestMode
          ? (move.level ?? pieces.find((piece) => piece.id === 'preview-test-piece')?.level ?? 0) *
            TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.009
          : TILE_HEIGHT + 0.009,
        position.z - offsetZ
      );
      group.add(marker);
    }

    const selectedGeometry = new THREE.TorusGeometry(0.054, 0.007, 6, 18);
    const selectedMaterial = new THREE.MeshBasicMaterial({ color: '#8de6ed' });
    for (const key of props.selectedTerrainKeys) {
      const [r, c, level] = key.split(',').map(Number);
      const position = positions.get(`${r},${c}`);
      if (!position || !Number.isFinite(level)) continue;
      const ring = new THREE.Mesh(selectedGeometry, selectedMaterial);
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.set(
        position.x - offsetX,
        level * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.01,
        position.z - offsetZ
      );
      group.add(ring);
    }

    moveHandlesRef.current = [];
    if (props.terrainTool === 'select' && props.gizmoMode === 'move' &&
        props.selectedTerrainKeys.some((key) => {
          const [r, c, level] = key.split(',').map(Number);
          return Number.isFinite(level) && positions.has(`${r},${c}`);
        })) {
      const selectedCells = props.selectedTerrainKeys
        .map((key) => key.split(',').map(Number))
        .filter(([r, c, level]) => positions.has(`${r},${c}`) && Number.isFinite(level));
      const center = selectedCells.reduce(
        (sum, [r, c]) => sum.add(positions.get(`${r},${c}`)!),
        new THREE.Vector3()
      ).multiplyScalar(1 / selectedCells.length);
      center.x -= offsetX;
      center.z -= offsetZ;
      const maxLevel = Math.max(...selectedCells.map(([, , level]) => level));
      center.y = maxLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.035;
      const shaftGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8);
      const headGeometry = new THREE.ConeGeometry(0.065, 0.1, 10);
      const rowOrigin = getFreezoneArenaCellPosition(0, 0, boardSize, format);
      const rowNext = getFreezoneArenaCellPosition(1, 0, boardSize, format);
      const colNext = getFreezoneArenaCellPosition(0, 1, boardSize, format);
      const axisHandles: Array<{ axis: GizmoAxis; direction: THREE.Vector3; color: string }> = [
        {
          axis: 'x',
          direction: new THREE.Vector3(colNext.x - rowOrigin.x, 0, colNext.z - rowOrigin.z).normalize(),
          color: '#ed6268'
        },
        { axis: 'y', direction: new THREE.Vector3(0, 1, 0), color: '#62d983' },
        {
          axis: 'z',
          direction: new THREE.Vector3(rowNext.x - rowOrigin.x, 0, rowNext.z - rowOrigin.z).normalize(),
          color: '#5e9cff'
        }
      ];
      for (const { axis, direction, color } of axisHandles) {
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.28,
          roughness: 0.42
        });
        const rotation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction
        );
        const shaft = new THREE.Mesh(shaftGeometry, material);
        shaft.position.copy(center).addScaledVector(direction, 0.14);
        shaft.quaternion.copy(rotation);
        shaft.userData.gizmoAxis = axis;
        shaft.userData.gizmoDirection = direction;
        const head = new THREE.Mesh(headGeometry, material);
        head.position.copy(center).addScaledVector(direction, 0.33);
        head.quaternion.copy(rotation);
        head.userData.gizmoAxis = axis;
        head.userData.gizmoDirection = direction;
        group.add(shaft, head);
        moveHandlesRef.current.push(shaft, head);
      }
    }

    scaleHandleRef.current = null;
    if (props.terrainTool === 'select' && props.gizmoMode === 'scale' &&
        props.selectedTerrainKeys.length) {
      const selectedCells = props.selectedTerrainKeys.map((key) => key.split(',').map(Number));
      const handleCell = selectedCells
        .filter(([r, c]) => positions.has(`${r},${c}`))
        .sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]))[0];
      const maxLevel = Math.max(...selectedCells.map(([, , level]) => level));
      const position = handleCell ? positions.get(`${handleCell[0]},${handleCell[1]}`) : undefined;
      if (position) {
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.1, 0.1),
          new THREE.MeshStandardMaterial({
            color: '#ffc857',
            emissive: '#ff9d22',
            emissiveIntensity: 0.55
          })
        );
        handle.position.set(
          position.x - offsetX + PREVIEW_TILE_SPACING * 0.5,
          maxLevel * TERRAIN_LEVEL_HEIGHT + TILE_HEIGHT + 0.055,
          position.z - offsetZ + PREVIEW_TILE_SPACING * 0.5
        );
        group.add(handle);
        scaleHandleRef.current = handle;
      }
    }

    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) child.renderOrder = child.userData.cells ? 1 : 2;
    });

    const key = `${format}:${boardSize}:${props.boundsSize.width}:${props.boundsSize.depth}:${props.boundsSize.height}`;
    if (group.userData.cameraKey !== key) {
      const span = Math.max(
        maxX - minX,
        maxZ - minZ,
        props.boundsSize.width * PREVIEW_TILE_SPACING,
        props.boundsSize.depth * PREVIEW_TILE_SPACING,
        props.boundsSize.height * TERRAIN_LEVEL_HEIGHT,
        1
      );
      controls.target.set(0, 0, 0);
      camera.position.set(span * 0.2, span * 3, span * 0.25);
      camera.near = 0.1;
      camera.far = Math.max(100, span * 8);
      camera.updateProjectionMatrix();
      controls.update();
      group.userData.cameraKey = key;
    }
  }, [
    props.format,
    props.tileGeometry,
    props.boardSize,
    props.surfaceColor,
    props.edgeColor,
    props.pieces,
    props.draftOrbs,
    props.spawnPoints,
    props.selectedPieceId,
    props.terrainChanges,
    props.selectedTerrainKeys,
    props.terrainTool,
    props.gizmoMode,
    props.boundsSize,
    props.brushColor,
    props.terrainLevel,
    props.playtestMode,
    props.legalMoves
  ]);

  return (
    <div
      ref={hostRef}
      className={`freezone-arena-preview${props.immersive ? ' immersive' : ''}`}
      aria-label="Interactive 3D arena preview; drag to rotate and click a tile to edit it"
    >
      {previewError && <span role="status">3D preview unavailable: {previewError}</span>}
    </div>
  );
}
