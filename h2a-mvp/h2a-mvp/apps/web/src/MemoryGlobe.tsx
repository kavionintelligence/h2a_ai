import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MemoryRecord } from './model';

interface MemoryGlobeProps {
  records: MemoryRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function isLocked(record: MemoryRecord): boolean {
  const access = record.access.toLowerCase();
  return access.includes('only') || access.includes('required') || access.includes('members');
}

function recordPosition(index: number, count: number, radius: number): THREE.Vector3 {
  const offset = 2 / Math.max(count, 1);
  const y = (index * offset - 1) + offset / 2;
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial).multiplyScalar(radius);
}

export function MemoryGlobe({ records, selectedId, onSelect }: MemoryGlobeProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(onSelect);
  selectedRef.current = selectedId;
  selectRef.current = onSelect;

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas: HTMLCanvasElement = canvasElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const globe = new THREE.Group();
    globe.rotation.x = -0.12;
    scene.add(globe);

    const particleCount = 1500;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const teal = new THREE.Color('#47d9c0');
    const blue = new THREE.Color('#5b86eb');
    const violet = new THREE.Color('#a47ad0');
    const particleVectors: THREE.Vector3[] = [];

    for (let index = 0; index < particleCount; index += 1) {
      const vector = recordPosition(index, particleCount, 2.22 + Math.sin(index * 12.73) * 0.035);
      particleVectors.push(vector);
      particlePositions[index * 3] = vector.x;
      particlePositions[index * 3 + 1] = vector.y;
      particlePositions[index * 3 + 2] = vector.z;
      const blend = (vector.y + 2.3) / 4.6;
      const color = blend > 0.58 ? teal.clone().lerp(blue, (blend - 0.58) * 1.7) : blue.clone().lerp(violet, (0.58 - blend) * 0.9);
      particleColors[index * 3] = color.r;
      particleColors[index * 3 + 1] = color.g;
      particleColors[index * 3 + 2] = color.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    const particleMaterial = new THREE.PointsMaterial({ size: 0.022, transparent: true, opacity: 0.82, vertexColors: true, sizeAttenuation: true });
    globe.add(new THREE.Points(particleGeometry, particleMaterial));

    const linePositions: number[] = [];
    for (let index = 0; index < 240; index += 1) {
      const from = particleVectors[(index * 29) % particleCount];
      const to = particleVectors[(index * 29 + 21 + index % 11) % particleCount];
      if (from.distanceTo(to) < 1.12) linePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#5fd7c6', transparent: true, opacity: 0.18 });
    globe.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const shellGeometry = new THREE.IcosahedronGeometry(2.16, 3);
    const shellMaterial = new THREE.MeshBasicMaterial({ color: '#2b7f86', transparent: true, opacity: 0.07, wireframe: true });
    globe.add(new THREE.Mesh(shellGeometry, shellMaterial));

    const knowledgeNodes: THREE.Mesh[] = [];
    const nodeGeometry = new THREE.SphereGeometry(0.09, 18, 18);
    const ringGeometry = new THREE.TorusGeometry(0.145, 0.008, 8, 42);
    records.forEach((record, index) => {
      const position = recordPosition(index, records.length, 2.3);
      const material = new THREE.MeshBasicMaterial({ color: record.tone });
      const node = new THREE.Mesh(nodeGeometry, material);
      node.position.copy(position);
      node.userData = { recordId: record.id, tone: record.tone };
      globe.add(node);
      knowledgeNodes.push(node);
      if (isLocked(record)) {
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#f4bb59', transparent: true, opacity: 0.9 }));
        ring.position.copy(position);
        ring.lookAt(0, 0, 0);
        globe.add(ring);
      }
    });

    const ambientParticles = new THREE.BufferGeometry();
    const ambientPositions = new Float32Array(270);
    for (let index = 0; index < ambientPositions.length; index += 3) {
      ambientPositions[index] = (Math.sin(index * 91.7) * 0.5) * 10;
      ambientPositions[index + 1] = (Math.cos(index * 37.1) * 0.5) * 6;
      ambientPositions[index + 2] = -2 - (index % 7);
    }
    ambientParticles.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
    scene.add(new THREE.Points(ambientParticles, new THREE.PointsMaterial({ color: '#6f91a0', size: 0.018, transparent: true, opacity: 0.32 })));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(2, 2);
    let hoveredId: string | null = null;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let animationFrame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setPointer(event: PointerEvent): void {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function onPointerDown(event: PointerEvent): void {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent): void {
      setPointer(event);
      if (!dragging) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) moved = true;
      globe.rotation.y += deltaX * 0.006;
      globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + deltaY * 0.004, -0.7, 0.7);
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerUp(event: PointerEvent): void {
      dragging = false;
      if (!moved && hoveredId) selectRef.current(hoveredId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }

    function onPointerLeave(): void {
      dragging = false;
      hoveredId = null;
      pointer.set(2, 2);
    }

    function resize(): void {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      globe.position.x = width < 760 ? 0 : -0.72;
      camera.position.z = width < 560 ? 8.1 : 7.2;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    resize();

    const clock = new THREE.Clock();
    function render(): void {
      const elapsed = clock.getElapsedTime();
      if (!dragging && !reducedMotion) globe.rotation.y += 0.0012;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(knowledgeNodes, false)[0];
      const nextHoveredId = hit ? String(hit.object.userData.recordId) : null;
      if (!dragging && nextHoveredId && nextHoveredId !== hoveredId) selectRef.current(nextHoveredId);
      hoveredId = nextHoveredId;
      canvas.style.cursor = hoveredId ? 'pointer' : dragging ? 'grabbing' : 'grab';
      knowledgeNodes.forEach((node, index) => {
        const active = node.userData.recordId === (hoveredId ?? selectedRef.current);
        const scale = active ? 1.55 + Math.sin(elapsed * 3 + index) * 0.08 : 1;
        node.scale.setScalar(scale);
      });
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    }
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      nodeGeometry.dispose();
      ringGeometry.dispose();
      knowledgeNodes.forEach((node) => (node.material as THREE.Material).dispose());
      ambientParticles.dispose();
      renderer.dispose();
    };
  }, [records]);

  return <canvas ref={canvasRef} className="memory-globe-canvas" aria-label="Interactive three-dimensional company knowledge network. Drag to rotate and select a highlighted memory node." />;
}
