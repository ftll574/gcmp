import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import { greatCirclePath } from '../lib/calc/haversine.ts';
import type {
  LandingShowcase,
  LandingShowcaseAirport,
  LandingShowcaseCatalog,
  LandingShowcaseLeg,
} from '../lib/schemas/landing-showcase.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { shouldHandleSiteLink, siteViewHref } from '../lib/site-navigation.ts';

interface Props {
  readonly catalog: LandingShowcaseCatalog;
  readonly onPlan: () => void;
}

interface AnimatedPlane {
  readonly object: THREE.Group;
  readonly curve: THREE.CatmullRomCurve3;
  readonly offset: number;
  readonly speed: number;
}

interface GlobeRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly globe: THREE.Group;
  readonly routeLayer: THREE.Group;
  readonly markerLayer: THREE.Group;
  readonly markerMeshes: THREE.Mesh[];
  planes: AnimatedPlane[];
  pointerX: number;
  pointerY: number;
  spin: number;
  pitch: number;
  dragging: boolean;
  dragPointerId: number | null;
  dragLastX: number;
  dragLastY: number;
  velocityYaw: number;
  velocityPitch: number;
  reducedMotion: boolean;
}

const GLOBE_RADIUS = 1.28;
const WORLD_FILE = '/data/world-countries-50m.json';
const ALLIANCE_COLORS: Readonly<Record<LandingShowcase['alliance'], number>> = {
  star: 0x58d5d0,
  oneworld: 0xffbd70,
  skyteam: 0x91a7ff,
  mixed: 0xff846f,
};

function canUseWebGl(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!('WebGLRenderingContext' in window)) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function latLonToVector3(lat: number, lon: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lon);
  const cosPhi = Math.cos(phi);
  return new THREE.Vector3(
    radius * cosPhi * Math.sin(theta),
    radius * Math.sin(phi),
    radius * cosPhi * Math.cos(theta),
  );
}

function pushRingSegments(output: number[], ring: ReadonlyArray<Position>, radius: number): void {
  for (let index = 1; index < ring.length; index += 1) {
    const previous = ring[index - 1];
    const current = ring[index];
    if (!previous || !current) continue;
    const a = latLonToVector3(previous[1] ?? 0, previous[0] ?? 0, radius);
    const b = latLonToVector3(current[1] ?? 0, current[0] ?? 0, radius);
    output.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function countryLineGeometry(features: FeatureCollection<Geometry>): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const item of features.features) {
    const geometry = item.geometry;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates) pushRingSegments(positions, ring, GLOBE_RADIUS + 0.008);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) pushRingSegments(positions, ring, GLOBE_RADIUS + 0.008);
      }
    } else if (geometry.type === 'GeometryCollection') {
      for (const nested of geometry.geometries) {
        if (nested.type === 'Polygon') {
          for (const ring of nested.coordinates) pushRingSegments(positions, ring, GLOBE_RADIUS + 0.008);
        } else if (nested.type === 'MultiPolygon') {
          for (const polygon of nested.coordinates) {
            for (const ring of polygon) pushRingSegments(positions, ring, GLOBE_RADIUS + 0.008);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function graticuleGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const radius = GLOBE_RADIUS + 0.003;
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 4) {
      const a = latLonToVector3(lat, lon, radius);
      const b = latLonToVector3(lat, lon + 4, radius);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -75; lat < 75; lat += 3) {
      const a = latLonToVector3(lat, lon, radius);
      const b = latLonToVector3(lat + 3, lon, radius);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function seededRandomFactory(): () => number {
  let seed = 0x42f0e1eb;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function starField(): THREE.Points {
  const random = seededRandomFactory();
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < 520; index += 1) {
    const radius = 5 + random() * 5;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    points.push(new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    ));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.PointsMaterial({
    color: 0xbfdad3,
    size: 0.018,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

function routeCurve(
  from: LandingShowcaseAirport,
  to: LandingShowcaseAirport,
  leg: LandingShowcaseLeg,
): THREE.CatmullRomCurve3 {
  const samples = greatCirclePath(from, to, 52);
  const maxLift = 0.08 + Math.min(0.17, (leg.distanceNm / 6000) * 0.14);
  const points = samples.map((point, index) => {
    const t = samples.length <= 1 ? 0 : index / (samples.length - 1);
    const radius = GLOBE_RADIUS + 0.028 + Math.sin(Math.PI * t) * maxLift;
    return latLonToVector3(point.lat, point.lon, radius);
  });
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

function createPlaneModel(color: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.058, 4, 8), material);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 6), material);
  nose.position.y = 0.05;
  const wings = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.024), material);
  wings.position.y = -0.005;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.015), material);
  tail.position.y = -0.038;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), glowMaterial);
  group.add(glow, fuselage, nose, wings, tail);
  group.scale.setScalar(0.9);
  return group;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose?.();
  });
}

function clearLayer(layer: THREE.Group): void {
  for (const child of [...layer.children]) {
    layer.remove(child);
    disposeObject(child);
  }
}

function formatAlliance(alliance: LandingShowcase['alliance']): string {
  if (alliance === 'star') return 'Star Alliance';
  if (alliance === 'oneworld') return 'oneworld';
  if (alliance === 'skyteam') return 'SkyTeam';
  return 'Mixed network';
}

export function LandingGlobe({ catalog, onPlan }: Props): React.ReactElement {
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GlobeRuntime | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const sceneActiveRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredAirport, setHoveredAirport] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [webglAvailable] = useState(canUseWebGl);
  const airportByIata = useMemo(
    () => new Map(catalog.airports.map((airport) => [airport.iata, airport] as const)),
    [catalog.airports],
  );
  const active = catalog.showcases[activeIndex] ?? catalog.showcases[0]!;
  const activeAirportCodes = useMemo(
    () => [...new Set(active.legs.flatMap((leg) => [leg.from, leg.to]))],
    [active],
  );
  const totalDistance = useMemo(
    () => active.legs.reduce((sum, leg) => sum + leg.distanceNm, 0),
    [active],
  );

  useEffect(() => {
    if (!webglAvailable || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const reducedMotion = motionQuery?.matches ?? false;
    reducedMotionRef.current = reducedMotion;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 40);
    camera.position.set(0, 0.08, 4.25);
    const globe = new THREE.Group();
    const routeLayer = new THREE.Group();
    const markerLayer = new THREE.Group();
    globe.add(routeLayer, markerLayer);
    scene.add(globe);
    scene.add(starField());

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x0f2326,
        roughness: 0.82,
        metalness: 0.08,
        clearcoat: 0.16,
        clearcoatRoughness: 0.8,
        emissive: 0x061214,
        emissiveIntensity: 0.5,
      }),
    );
    globe.add(sphere);
    globe.add(new THREE.LineSegments(
      graticuleGeometry(),
      new THREE.LineBasicMaterial({ color: 0x76a2a2, transparent: true, opacity: 0.12 }),
    ));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.065, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x54d5d0) } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          void main() {
            vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
            float rim = 1.0 - abs(dot(normalize(vNormal), viewDirection));
            float alpha = pow(rim, 2.2) * 0.52;
            gl_FragColor = vec4(glowColor, alpha);
          }
        `,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    globe.add(atmosphere);

    scene.add(new THREE.HemisphereLight(0xcbe6df, 0x0b1114, 2.4));
    const keyLight = new THREE.DirectionalLight(0xd8fff6, 3.4);
    keyLight.position.set(3, 2.5, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x6f80ff, 13, 10);
    rimLight.position.set(-3.2, 0.2, 1.8);
    scene.add(rimLight);

    const runtime: GlobeRuntime = {
      renderer,
      scene,
      camera,
      globe,
      routeLayer,
      markerLayer,
      markerMeshes: [],
      planes: [],
      pointerX: 0,
      pointerY: 0,
      spin: THREE.MathUtils.degToRad(-121),
      pitch: 0,
      dragging: false,
      dragPointerId: null,
      dragLastX: 0,
      dragLastY: 0,
      velocityYaw: 0,
      velocityPitch: 0,
      reducedMotion,
    };
    runtimeRef.current = runtime;

    const baseUrl = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    let disposed = false;
    void fetch(`${baseUrl}${WORLD_FILE}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((topology) => {
        if (disposed) return;
        const topoTyped = topology as Parameters<typeof feature>[0];
        const countriesKey: Parameters<typeof feature>[1] = 'countries';
        const features = feature(topoTyped, countriesKey) as unknown as FeatureCollection<Geometry>;
        const coastlines = new THREE.LineSegments(
          countryLineGeometry(features),
          new THREE.LineBasicMaterial({ color: 0xc0ded5, transparent: true, opacity: 0.56 }),
        );
        globe.add(coastlines);
      })
      .catch((error: unknown) => {
        console.warn('Landing globe country outlines unavailable:', error);
      });

    let requestRender = (): void => {};
    const resize = (): void => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(300, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      // On touch screens the globe sits in the main page scroll path. Leave
      // single-finger touch and pinch gestures to the browser; mouse/pen drag
      // keeps the direct grab-to-rotate interaction on larger screens.
      if (event.pointerType === 'touch') return;
      runtime.dragging = true;
      runtime.dragPointerId = event.pointerId;
      runtime.dragLastX = event.clientX;
      runtime.dragLastY = event.clientY;
      runtime.velocityYaw = 0;
      runtime.velocityPitch = 0;
      canvas.setPointerCapture?.(event.pointerId);
      setDragging(true);
      setHoveredAirport(null);
    };
    const pointerMove = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' && !runtime.dragging) return;
      const rect = canvas.getBoundingClientRect();
      runtime.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      runtime.pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      if (runtime.dragging && runtime.dragPointerId === event.pointerId) {
        const dx = event.clientX - runtime.dragLastX;
        const dy = event.clientY - runtime.dragLastY;
        runtime.dragLastX = event.clientX;
        runtime.dragLastY = event.clientY;
        runtime.spin += dx * 0.007;
        runtime.pitch = THREE.MathUtils.clamp(runtime.pitch + dy * 0.005, -0.92, 0.92);
        runtime.velocityYaw = dx * 0.00065;
        runtime.velocityPitch = dy * 0.00045;
        canvas.dataset['globeYaw'] = runtime.spin.toFixed(4);
        canvas.dataset['globePitch'] = runtime.pitch.toFixed(4);
        setHoveredAirport(null);
        requestRender();
        return;
      }

      pointer.set(runtime.pointerX, runtime.pointerY);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(runtime.markerMeshes, false)[0];
      const iata = typeof hit?.object.userData['iata'] === 'string' ? hit.object.userData['iata'] as string : null;
      setHoveredAirport(iata);
      setHoverPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const finishDrag = (event: PointerEvent): void => {
      if (!runtime.dragging || runtime.dragPointerId !== event.pointerId) return;
      runtime.dragging = false;
      runtime.dragPointerId = null;
      canvas.releasePointerCapture?.(event.pointerId);
      setDragging(false);
    };
    const pointerLeave = (): void => {
      runtime.pointerX = 0;
      runtime.pointerY = 0;
      setHoveredAirport(null);
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('pointerleave', pointerLeave);

    let animationFrame = 0;
    let inViewport = true;
    const start = performance.now();
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3();
    const canRender = (): boolean => !disposed && inViewport && document.visibilityState !== 'hidden';
    const stopRendering = (): void => {
      if (animationFrame === 0) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };
    const animate = (now: number): void => {
      animationFrame = 0;
      if (!canRender()) return;
      const elapsed = runtime.reducedMotion ? 1.8 : (now - start) / 1000;
      const intro = Math.min(1, elapsed / 1.8);
      const easedIntro = 1 - Math.pow(1 - intro, 3);
      if (!runtime.dragging) {
        if (!runtime.reducedMotion) {
          runtime.spin += 0.00075 + runtime.velocityYaw;
          runtime.pitch = THREE.MathUtils.clamp(runtime.pitch + runtime.velocityPitch, -0.92, 0.92);
          runtime.velocityYaw *= 0.935;
          runtime.velocityPitch *= 0.9;
        } else {
          runtime.velocityYaw = 0;
          runtime.velocityPitch = 0;
        }
      }
      globe.rotation.y = runtime.spin;
      globe.rotation.x = THREE.MathUtils.lerp(globe.rotation.x, runtime.pitch, runtime.dragging ? 0.55 : 0.12);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.08, 0.08);
      camera.position.z = 4.55 - easedIntro * 0.58;
      camera.lookAt(0, 0, 0);

      for (const plane of runtime.planes) {
        const progress = runtime.reducedMotion ? plane.offset : (elapsed * plane.speed + plane.offset) % 1;
        const position = plane.curve.getPointAt(progress);
        plane.curve.getTangentAt(progress, tangent).normalize();
        plane.object.position.copy(position);
        plane.object.quaternion.setFromUnitVectors(up, tangent);
        const pulse = runtime.reducedMotion ? 1 : 0.9 + Math.sin(elapsed * 3.2 + plane.offset * 8) * 0.08;
        plane.object.scale.setScalar(pulse);
      }
      renderer.render(scene, camera);
      if (!runtime.reducedMotion || runtime.dragging) requestRender();
    };
    requestRender = (): void => {
      if (animationFrame !== 0 || !canRender()) return;
      animationFrame = requestAnimationFrame(animate);
    };
    requestRenderRef.current = requestRender;

    const handleVisibilityChange = (): void => {
      sceneActiveRef.current = canRender();
      if (document.visibilityState === 'hidden') stopRendering();
      else requestRender();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
      runtime.reducedMotion = event.matches;
      reducedMotionRef.current = event.matches;
      requestRender();
    };
    motionQuery?.addEventListener?.('change', handleMotionPreferenceChange);

    let intersectionObserver: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        inViewport = entry?.isIntersecting ?? true;
        sceneActiveRef.current = canRender();
        if (inViewport) requestRender();
        else stopRendering();
      }, { rootMargin: '180px 0px' });
      intersectionObserver.observe(container);
    }

    sceneActiveRef.current = canRender();
    requestRender();
    setSceneReady(true);

    return () => {
      disposed = true;
      stopRendering();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionQuery?.removeEventListener?.('change', handleMotionPreferenceChange);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', finishDrag);
      canvas.removeEventListener('pointercancel', finishDrag);
      canvas.removeEventListener('pointerleave', pointerLeave);
      disposeObject(scene);
      renderer.dispose();
      sceneActiveRef.current = false;
      if (requestRenderRef.current === requestRender) requestRenderRef.current = null;
      runtimeRef.current = null;
    };
  }, [webglAvailable]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime) return;
    clearLayer(runtime.routeLayer);
    clearLayer(runtime.markerLayer);
    runtime.markerMeshes.splice(0, runtime.markerMeshes.length);
    runtime.planes = [];
    setHoveredAirport(null);

    const color = ALLIANCE_COLORS[active.alliance];
    for (const [index, leg] of active.legs.entries()) {
      const from = airportByIata.get(leg.from);
      const to = airportByIata.get(leg.to);
      if (!from || !to) continue;
      const curve = routeCurve(from, to, leg);
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 72, 0.018, 6, false),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const core = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 72, 0.0055, 6, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.94 }),
      );
      runtime.routeLayer.add(glow, core);
      const plane = createPlaneModel(color);
      runtime.routeLayer.add(plane);
      runtime.planes.push({
        object: plane,
        curve,
        offset: (index / Math.max(1, active.legs.length)) * 0.85,
        speed: 0.022 + (index % 3) * 0.003,
      });
    }

    for (const code of activeAirportCodes) {
      const airport = airportByIata.get(code);
      if (!airport) continue;
      const position = latLonToVector3(airport.lat, airport.lon, GLOBE_RADIUS + 0.025);
      const visible = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0xf5fff9 }),
      );
      visible.position.copy(position);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.028, 0.043, 24),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.position.copy(position);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitTarget.position.copy(position);
      hitTarget.userData['iata'] = airport.iata;
      runtime.markerLayer.add(visible, ring, hitTarget);
      runtime.markerMeshes.push(hitTarget);
    }
    requestRenderRef.current?.();
  }, [active, activeAirportCodes, airportByIata, sceneReady]);

  useEffect(() => {
    if (interactionPaused || catalog.showcases.length <= 1) return;
    const interval = window.setInterval(() => {
      if (reducedMotionRef.current || !sceneActiveRef.current) return;
      setActiveIndex((current) => (current + 1) % catalog.showcases.length);
    }, 7600);
    return () => window.clearInterval(interval);
  }, [catalog.showcases.length, interactionPaused]);

  const hovered = hoveredAirport ? airportByIata.get(hoveredAirport) : null;
  const hoveredLegs = hoveredAirport
    ? active.legs.filter((leg) => leg.from === hoveredAirport || leg.to === hoveredAirport)
    : [];
  const title = locale === 'zh-TW' ? active.titleZh : active.titleEn;
  const eyebrow = locale === 'zh-TW' ? active.eyebrowZh : active.eyebrowEn;
  const description = locale === 'zh-TW' ? active.descriptionZh : active.descriptionEn;

  return (
    <div
      ref={containerRef}
      className={`landing-three-card alliance-${active.alliance}${hovered ? ' has-hover' : ''}${dragging ? ' is-dragging' : ''}`}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
      aria-label={locale === 'zh-TW' ? '互動式三維世界航線地球' : 'Interactive 3D world route globe'}
    >
      <div className="landing-three-ambient" aria-hidden="true" />
      {webglAvailable ? (
        <canvas ref={canvasRef} className="landing-three-canvas" data-three-globe="true" />
      ) : (
        <div className="landing-three-fallback" data-three-fallback="true">
          <span>{formatAlliance(active.alliance)}</span>
          <strong>{activeAirportCodes.join(' → ')}</strong>
        </div>
      )}

      <div className="landing-three-copy">
        <span>{formatAlliance(active.alliance)}</span>
        <h2>{title}</h2>
        <p>{eyebrow}</p>
      </div>

      <div className="landing-three-metrics" aria-label={locale === 'zh-TW' ? '目前航線摘要' : 'Current route summary'}>
        <span>{active.legs.length} {locale === 'zh-TW' ? '航段' : 'legs'}</span>
        <span>{totalDistance.toLocaleString()} nm</span>
      </div>

      {hovered && (
        <div
          className="landing-airport-tooltip"
          style={{ left: Math.min(hoverPosition.x + 16, 520), top: Math.max(18, hoverPosition.y - 16) }}
        >
          <strong>{hovered.iata} · {hovered.city}</strong>
          {hoveredLegs.slice(0, 2).map((leg) => (
            <span key={`${leg.from}-${leg.to}-${leg.flightNumber}`}>
              {leg.flightNumber} · {leg.carrierName} · {leg.distanceNm.toLocaleString()} nm
            </span>
          ))}
        </div>
      )}

      <div className="landing-flight-strip" aria-label={locale === 'zh-TW' ? '目前航線班號' : 'Current flight designators'}>
        {active.legs.map((leg) => (
          <button
            type="button"
            key={`${active.id}-${leg.from}-${leg.to}`}
            onMouseEnter={() => setHoveredAirport(leg.from)}
            onMouseLeave={() => setHoveredAirport(null)}
            onFocus={() => setHoveredAirport(leg.from)}
            onBlur={() => setHoveredAirport(null)}
            title={`${leg.carrierName} ${leg.flightNumber} · ${leg.distanceNm.toLocaleString()} nm`}
          >
            <span>{leg.from}→{leg.to}</span>
            <strong>{leg.flightNumber}</strong>
          </button>
        ))}
      </div>

      <div className="landing-showcase-switcher" role="group" aria-label={locale === 'zh-TW' ? '經典航線切換' : 'Route showcase switcher'}>
        {catalog.showcases.map((showcase, index) => (
          <button
            type="button"
            key={showcase.id}
            aria-pressed={index === activeIndex}
            onClick={() => setActiveIndex(index)}
          >
            {locale === 'zh-TW' ? showcase.titleZh : showcase.titleEn}
          </button>
        ))}
      </div>

      <div className="landing-three-description">
        <p>{description}</p>
        <a href={siteViewHref('planner')} onClick={(event) => {
          if (!shouldHandleSiteLink(event.nativeEvent)) return;
          event.preventDefault();
          onPlan();
        }}>{locale === 'zh-TW' ? '用這條路線開始規劃' : 'Plan from this route'}</a>
      </div>
    </div>
  );
}
