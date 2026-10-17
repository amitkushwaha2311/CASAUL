"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface NetworkNodeData {
  id: string;
  name: string;
  code: string;
  domain: "power" | "water" | "transport" | "cyber" | "telecom";
  domainLabel: string;
  pos3d: [number, number, number];
  status: "NORMAL" | "DEGRADED" | "CRITICAL" | "FAILED";
  metric: string;
  description: string;
}

export interface NetworkEdgeData {
  from: string;
  to: string;
  label: string;
  delayMs: number;
  flowType: "high_voltage" | "traction" | "hydraulic" | "telemetry";
}

interface DimensionalNetworkCanvasProps {
  nodes: NetworkNodeData[];
  edges: NetworkEdgeData[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  isCascading: boolean;
  step: number;
  isPaused: boolean;
}

export function DimensionalNetworkCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  isCascading,
  step,
  isPaused,
}: DimensionalNetworkCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);
  const [screenCoords, setScreenCoords] = useState<
    Record<string, { x: number; y: number; visible: boolean }>
  >({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // References for 60fps render loop
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const isPausedRef = useRef(isPaused);
  const isCascadingRef = useRef(isCascading);
  const stepRef = useRef(step);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    selectedNodeIdRef.current = selectedNodeId;
    hoveredNodeIdRef.current = hoveredNodeId;
    isPausedRef.current = isPaused;
    isCascadingRef.current = isCascading;
    stepRef.current = step;
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect WebGL capability
    const testCanvas = document.createElement("canvas");
    const gl =
      testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) {
      setWebglSupported(false);
      return;
    }

    // ── 1. Scene, Camera, High-Fidelity Renderer ────────────
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 650;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111210, 0.035);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    // Cinematic elevated 3D perspective
    camera.position.set(0, 1.6, 9.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // ── 2. Atmospheric Infrastructure Lighting ───────────────
    // Low ambient tone for architectural contrast
    const ambientLight = new THREE.AmbientLight(0x232420, 1.5);
    scene.add(ambientLight);

    // Warm ivory key light from top-right
    const keyLight = new THREE.DirectionalLight(0xf0ede5, 2.2);
    keyLight.position.set(6, 10, 8);
    scene.add(keyLight);

    // Soft sage fill light from bottom-left
    const fillLight = new THREE.DirectionalLight(0x82977d, 1.2);
    fillLight.position.set(-8, -2, -5);
    scene.add(fillLight);

    // Dynamic root transformer flash point light
    const rootPointLight = new THREE.PointLight(0xb9955b, 2.8, 16, 1.6);
    rootPointLight.position.set(-3.8, 0.8, 0.4);
    scene.add(rootPointLight);

    // ── 3. Spatial Architectural Ground Floor & Grid ─────────
    const gridHelper = new THREE.GridHelper(22, 32, 0xa99a80, 0x1d1e1a);
    gridHelper.position.y = -2.8;
    const gridMat = gridHelper.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.22;
    scene.add(gridHelper);

    // Concentric coordinate range rings on ground
    const ringGeo1 = new THREE.RingGeometry(2.6, 2.64, 64);
    const ringGeo2 = new THREE.RingGeometry(5.8, 5.84, 64);
    const groundRingMat = new THREE.MeshBasicMaterial({
      color: 0xa99a80,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
    });
    const groundRing1 = new THREE.Mesh(ringGeo1, groundRingMat);
    groundRing1.rotation.x = Math.PI / 2;
    groundRing1.position.set(-3.8, -2.79, 0.2);
    scene.add(groundRing1);

    const groundRing2 = new THREE.Mesh(ringGeo2, groundRingMat.clone());
    groundRing2.rotation.x = Math.PI / 2;
    groundRing2.position.set(-3.8, -2.79, 0.2);
    scene.add(groundRing2);

    // Floating micro-particles
    const particleCount = 120;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 18;
      dustPositions[i + 1] = (Math.random() - 0.5) * 8;
      dustPositions[i + 2] = (Math.random() - 0.5) * 12;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xa99a80,
      size: 0.035,
      transparent: true,
      opacity: 0.25,
    });
    const dustParticles = new THREE.Points(dustGeo, dustMat);
    scene.add(dustParticles);

    // ── 4. Bespoke 3D Infrastructure Asset Meshes ─────────────
    const nodeGroups = new Map<
      string,
      {
        group: THREE.Group;
        interactiveMeshes: THREE.Object3D[];
        coreMaterials: THREE.MeshStandardMaterial[];
        pointLight: THREE.PointLight;
        targetPos: THREE.Vector3;
        domain: string;
      }
    >();

    const getStatusColors = (status: NetworkNodeData["status"]) => {
      switch (status) {
        case "FAILED":
          return { hex: 0x9b4540, emissive: 0x9b4540, intensity: 2.2 };
        case "CRITICAL":
          return { hex: 0x9b4540, emissive: 0xb94238, intensity: 1.8 };
        case "DEGRADED":
          return { hex: 0xb9955b, emissive: 0xb9955b, intensity: 1.3 };
        case "NORMAL":
        default:
          return { hex: 0x82977d, emissive: 0x4d6349, intensity: 0.8 };
      }
    };

    nodes.forEach((node) => {
      const colors = getStatusColors(node.status);
      const group = new THREE.Group();
      group.position.set(...node.pos3d);

      const interactiveMeshes: THREE.Object3D[] = [];
      const coreMaterials: THREE.MeshStandardMaterial[] = [];

      // Primary Standard Material
      const baseMat = new THREE.MeshStandardMaterial({
        color: colors.hex,
        emissive: colors.emissive,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        metalness: 0.75,
      });
      coreMaterials.push(baseMat);

      // Dark Chassis Steel Material
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x222420,
        roughness: 0.4,
        metalness: 0.85,
      });

      // ───────────────────────────────────────────────────────
      // ASSET 1: Power Substation Alpha (Transformer & Bushings)
      // ───────────────────────────────────────────────────────
      if (node.id === "node-power") {
        // Main Transformer Tank
        const tankGeo = new THREE.BoxGeometry(0.75, 0.65, 0.65);
        const tankMesh = new THREE.Mesh(tankGeo, baseMat);
        tankMesh.userData = { nodeId: node.id };
        group.add(tankMesh);
        interactiveMeshes.push(tankMesh);

        // Three High-Voltage Ceramic Bushings on top
        [-0.22, 0, 0.22].forEach((offset) => {
          const bushingGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.42, 12);
          const bushingMesh = new THREE.Mesh(bushingGeo, chassisMat);
          bushingMesh.position.set(offset, 0.48, 0);
          group.add(bushingMesh);

          // Top Terminal Sphere
          const termGeo = new THREE.SphereGeometry(0.065, 12, 12);
          const termMesh = new THREE.Mesh(termGeo, baseMat);
          termMesh.position.set(offset, 0.7, 0);
          group.add(termMesh);
        });

        // Overhead Busbar Collector Rail
        const railGeo = new THREE.BoxGeometry(0.72, 0.03, 0.03);
        const railMesh = new THREE.Mesh(railGeo, chassisMat);
        railMesh.position.set(0, 0.72, 0);
        group.add(railMesh);

        // Base Concrete Pad
        const padGeo = new THREE.BoxGeometry(0.95, 0.08, 0.85);
        const padMesh = new THREE.Mesh(padGeo, chassisMat);
        padMesh.position.set(0, -0.36, 0);
        group.add(padMesh);
      }

      // ───────────────────────────────────────────────────────
      // ASSET 2: Aqueduct Pump Station 4 (Volute Pump & Motor)
      // ───────────────────────────────────────────────────────
      else if (node.id === "node-pump") {
        // Spiral Volute Impeller Housing (Horizontal Torus)
        const voluteGeo = new THREE.TorusGeometry(0.38, 0.16, 16, 32);
        const voluteMesh = new THREE.Mesh(voluteGeo, baseMat);
        voluteMesh.rotation.x = Math.PI / 2;
        voluteMesh.userData = { nodeId: node.id };
        group.add(voluteMesh);
        interactiveMeshes.push(voluteMesh);

        // Vertical Electric Motor Cylinder on top
        const motorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.55, 24);
        const motorMesh = new THREE.Mesh(motorGeo, chassisMat);
        motorMesh.position.set(0, 0.38, 0);
        group.add(motorMesh);

        // Flanged Discharge Pipe
        const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.45, 16);
        const pipeMesh = new THREE.Mesh(pipeGeo, baseMat);
        pipeMesh.rotation.z = Math.PI / 2;
        pipeMesh.position.set(0.42, 0, 0);
        group.add(pipeMesh);

        // Heavy Base Mounting Plate
        const basePlateGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.08, 24);
        const basePlateMesh = new THREE.Mesh(basePlateGeo, chassisMat);
        basePlateMesh.position.set(0, -0.22, 0);
        group.add(basePlateMesh);
      }

      // ───────────────────────────────────────────────────────
      // ASSET 3: Metro Traction Feeder (Rail Catenary Gantry)
      // ───────────────────────────────────────────────────────
      else if (node.id === "node-transit") {
        // Catenary Overhead Portal Gantry
        const leftColGeo = new THREE.BoxGeometry(0.06, 0.8, 0.06);
        const leftCol = new THREE.Mesh(leftColGeo, chassisMat);
        leftCol.position.set(-0.35, 0.1, 0);
        group.add(leftCol);

        const rightCol = new THREE.Mesh(leftColGeo, chassisMat);
        rightCol.position.set(0.35, 0.1, 0);
        group.add(rightCol);

        const beamGeo = new THREE.BoxGeometry(0.82, 0.06, 0.06);
        const beamMesh = new THREE.Mesh(beamGeo, chassisMat);
        beamMesh.position.set(0, 0.52, 0);
        group.add(beamMesh);

        // Central Traction Transformer Core
        const coreGeo = new THREE.BoxGeometry(0.48, 0.42, 0.42);
        const coreMesh = new THREE.Mesh(coreGeo, baseMat);
        coreMesh.userData = { nodeId: node.id };
        group.add(coreMesh);
        interactiveMeshes.push(coreMesh);

        // High-Voltage Overhead Contact Wire Drop
        const dropGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8);
        const dropMesh = new THREE.Mesh(dropGeo, baseMat);
        dropMesh.position.set(0, 0.35, 0);
        group.add(dropMesh);
      }

      // ───────────────────────────────────────────────────────
      // ASSET 4: Water Treatment Plant 02 (Clarifiers & Matrix)
      // ───────────────────────────────────────────────────────
      else if (node.id === "node-treatment") {
        // Clarifier Circular Basin 1
        const clarifierGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 32);
        const clarifier1 = new THREE.Mesh(clarifierGeo, chassisMat);
        clarifier1.position.set(-0.25, 0, 0);
        clarifier1.userData = { nodeId: node.id };
        group.add(clarifier1);
        interactiveMeshes.push(clarifier1);

        // Water Basin Fluid Surface Disc 1
        const fluidGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32);
        const fluid1 = new THREE.Mesh(fluidGeo, baseMat);
        fluid1.position.set(-0.25, 0.1, 0);
        group.add(fluid1);

        // Clarifier Circular Basin 2
        const clarifier2 = new THREE.Mesh(clarifierGeo, chassisMat);
        clarifier2.position.set(0.25, 0, 0.15);
        clarifier2.userData = { nodeId: node.id };
        group.add(clarifier2);
        interactiveMeshes.push(clarifier2);

        const fluid2 = new THREE.Mesh(fluidGeo, baseMat);
        fluid2.position.set(0.25, 0.1, 0.15);
        group.add(fluid2);

        // Interconnecting Pipe Manifold
        const manifoldGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12);
        const manifold = new THREE.Mesh(manifoldGeo, baseMat);
        manifold.rotation.z = Math.PI / 2;
        manifold.position.set(0, 0.05, 0.08);
        group.add(manifold);
      }

      // ───────────────────────────────────────────────────────
      // ASSET 5: SCADA Telemetry Hub (Sensor Mast & Dishes)
      // ───────────────────────────────────────────────────────
      else {
        // Telemetry Equipment Enclosure Cabinet
        const cabinetGeo = new THREE.BoxGeometry(0.48, 0.42, 0.38);
        const cabinetMesh = new THREE.Mesh(cabinetGeo, chassisMat);
        cabinetMesh.position.set(0, -0.1, 0);
        cabinetMesh.userData = { nodeId: node.id };
        group.add(cabinetMesh);
        interactiveMeshes.push(cabinetMesh);

        // Antenna Mast Spire
        const spireGeo = new THREE.CylinderGeometry(0.02, 0.06, 0.85, 12);
        const spireMesh = new THREE.Mesh(spireGeo, chassisMat);
        spireMesh.position.set(0, 0.45, 0);
        group.add(spireMesh);

        // Microwave Parabolic Dish Receiver
        const dishGeo = new THREE.SphereGeometry(0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const dishMesh = new THREE.Mesh(dishGeo, baseMat);
        dishMesh.rotation.x = -Math.PI / 3;
        dishMesh.position.set(0, 0.6, 0.08);
        group.add(dishMesh);

        // Flashing Transceiver Beacon Core
        const beaconGeo = new THREE.SphereGeometry(0.09, 16, 16);
        const beaconMesh = new THREE.Mesh(beaconGeo, baseMat);
        beaconMesh.position.set(0, 0.88, 0);
        group.add(beaconMesh);
      }

      // Subtle Outer Refractive Glass Shell for Selection / Halo
      const haloGeo = new THREE.SphereGeometry(0.72, 24, 24);
      const haloMat = new THREE.MeshPhysicalMaterial({
        color: colors.hex,
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        transmission: 0.88,
        ior: 1.35,
        depthWrite: false,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.userData = { nodeId: node.id };
      group.add(haloMesh);
      interactiveMeshes.push(haloMesh);

      // Local Point Light
      const pLight = new THREE.PointLight(colors.hex, 1.4, 4.5, 2);
      group.add(pLight);

      scene.add(group);
      nodeGroups.set(node.id, {
        group,
        interactiveMeshes,
        coreMaterials,
        pointLight: pLight,
        targetPos: new THREE.Vector3(...node.pos3d),
        domain: node.domain,
      });
    });

    // ── 5. Upstream-to-Downstream Conduits & Flow Pulses ─────
    interface ConduitData {
      curve: THREE.CatmullRomCurve3;
      tubeMesh: THREE.Mesh;
      coreLine: THREE.Line;
      photons: THREE.Mesh[];
      edge: NetworkEdgeData;
      tOffset: number;
    }
    const conduits: ConduitData[] = [];
    const photonGeo = new THREE.SphereGeometry(0.08, 16, 16);

    edges.forEach((edge, edgeIdx) => {
      const fromGroup = nodeGroups.get(edge.from);
      const toGroup = nodeGroups.get(edge.to);
      if (!fromGroup || !toGroup) return;

      const p1 = fromGroup.targetPos.clone();
      const p2 = toGroup.targetPos.clone();

      // Fluid 3D curve with arched elevation & lateral bow
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mid.y += 0.55;
      mid.z += edgeIdx % 2 === 0 ? 0.4 : -0.3;

      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);

      // Volumetric Conduit Tube Geometry
      const tubeRadius =
        edge.flowType === "high_voltage"
          ? 0.034
          : edge.flowType === "hydraulic"
          ? 0.04
          : 0.024;

      const tubeGeo = new THREE.TubeGeometry(curve, 56, tubeRadius, 10, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x82977d,
        roughness: 0.35,
        metalness: 0.65,
        transparent: true,
        opacity: 0.55,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);

      // Core Line Hairline
      const linePts = curve.getPoints(45);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xa99a80,
        transparent: true,
        opacity: 0.35,
      });
      const coreLine = new THREE.Line(lineGeo, lineMat);
      scene.add(coreLine);

      // Flow Pulse Photons traveling along edge
      const photonMat = new THREE.MeshBasicMaterial({ color: 0xa99a80 });
      const p1Mesh = new THREE.Mesh(photonGeo, photonMat);
      const p2Mesh = new THREE.Mesh(photonGeo, photonMat.clone());
      scene.add(p1Mesh);
      scene.add(p2Mesh);

      conduits.push({
        curve,
        tubeMesh,
        coreLine,
        photons: [p1Mesh, p2Mesh],
        edge,
        tOffset: edgeIdx * 0.32,
      });
    });

    // ── 6. Mouse Parallax, Raycasting & Node Hover ──────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    const targetCameraPos = new THREE.Vector3(0, 1.6, 9.8);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      mouse.x = (clientX / rect.width) * 2 - 1;
      mouse.y = -(clientY / rect.height) * 2 + 1;

      // Restrained camera parallax tilt
      targetCameraPos.x = mouse.x * 1.6;
      targetCameraPos.y = 1.6 + mouse.y * 1.1;

      // Raycast for hover
      raycaster.setFromCamera(mouse, camera);
      const allMeshes: THREE.Object3D[] = [];
      nodeGroups.forEach((val) => allMeshes.push(...val.interactiveMeshes));

      const intersects = raycaster.intersectObjects(allMeshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const hitId = hit.userData.nodeId;
        if (hitId) setHoveredNodeId(hitId);
      } else {
        setHoveredNodeId(null);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const clickMouse = new THREE.Vector2(
        (clientX / rect.width) * 2 - 1,
        -(clientY / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(clickMouse, camera);
      const allMeshes: THREE.Object3D[] = [];
      nodeGroups.forEach((val) => allMeshes.push(...val.interactiveMeshes));

      const intersects = raycaster.intersectObjects(allMeshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const nodeId = hit.userData.nodeId;
        if (nodeId) onSelectNode(nodeId);
      }
    };

    container.addEventListener("mousemove", handlePointerMove);
    container.addEventListener("click", handleClick);

    // ── 7. Resize Observer ──────────────────────────────────
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // ── 8. Animation & Projection Render Loop ───────────────
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      // Smooth camera interpolation
      camera.position.lerp(targetCameraPos, 0.04);
      camera.lookAt(targetLookAt);

      // Rotate ground dust slowly
      dustParticles.rotation.y = elapsed * 0.015;

      // Pulse concentric ground rings
      groundRing1.rotation.z = elapsed * 0.03;
      groundRing2.rotation.z = -elapsed * 0.02;

      // Update Node Visuals & Failure State Animations
      const currentNodes = nodesRef.current;
      const activeId = selectedNodeIdRef.current;
      const hoveredId = hoveredNodeIdRef.current;

      currentNodes.forEach((node) => {
        const item = nodeGroups.get(node.id);
        if (!item) return;

        const isSelected = activeId === node.id;
        const isHovered = hoveredId === node.id;
        const colors = getStatusColors(node.status);

        // Dynamic scale pulse on failure or degradation
        if (node.status === "FAILED") {
          const failPulse = 1.0 + Math.sin(elapsed * 8.0) * 0.14;
          item.group.scale.set(failPulse, failPulse, failPulse);
        } else if (node.status === "CRITICAL" || node.status === "DEGRADED") {
          const warnPulse = 1.0 + Math.sin(elapsed * 4.5) * 0.08;
          item.group.scale.set(warnPulse, warnPulse, warnPulse);
        } else if (isSelected || isHovered) {
          item.group.scale.set(1.12, 1.12, 1.12);
        } else {
          item.group.scale.set(1.0, 1.0, 1.0);
        }

        // Material Updates
        item.coreMaterials.forEach((mat) => {
          mat.color.setHex(colors.hex);
          mat.emissive.setHex(colors.emissive);
          mat.emissiveIntensity = isSelected ? 1.0 : isHovered ? 0.8 : 0.6;
        });

        item.pointLight.color.setHex(colors.hex);
        item.pointLight.intensity = isSelected ? 2.6 : isHovered ? 2.2 : colors.intensity;
      });

      // Update Root Light color during cascade
      const rootNode = currentNodes.find((n) => n.id === "node-power");
      if (rootNode) {
        if (rootNode.status === "FAILED") {
          rootPointLight.color.setHex(0x9b4540);
          rootPointLight.intensity = 3.8 + Math.sin(elapsed * 10) * 1.5;
        } else {
          rootPointLight.color.setHex(0xb9955b);
          rootPointLight.intensity = 2.4;
        }
      }

      // Update Conduits & Traveling Energy Photons
      conduits.forEach((cond) => {
        const fromNode = currentNodes.find((n) => n.id === cond.edge.from);
        const toNode = currentNodes.find((n) => n.id === cond.edge.to);
        const isFailing =
          fromNode?.status !== "NORMAL" || toNode?.status !== "NORMAL";
        const isPathHovered =
          hoveredId === cond.edge.from || hoveredId === cond.edge.to;

        // Tube material color & glow
        const tubeMat = cond.tubeMesh.material as THREE.MeshStandardMaterial;
        if (isFailing) {
          tubeMat.color.setHex(0x9b4540);
          tubeMat.emissive = new THREE.Color(0x9b4540);
          tubeMat.emissiveIntensity = 0.9;
          tubeMat.opacity = 0.9;
        } else if (isPathHovered) {
          tubeMat.color.setHex(0xa99a80);
          tubeMat.emissive = new THREE.Color(0xa99a80);
          tubeMat.emissiveIntensity = 0.6;
          tubeMat.opacity = 0.85;
        } else {
          tubeMat.color.setHex(0x82977d);
          tubeMat.emissive = new THREE.Color(0x283025);
          tubeMat.emissiveIntensity = 0.2;
          tubeMat.opacity = 0.5;
        }

        // Animate Photons along 3D CatmullRom Curve
        if (!isPausedRef.current) {
          const speed = isFailing ? 0.78 : 0.38;
          cond.photons.forEach((photonMesh, pIdx) => {
            const t = (elapsed * speed + cond.tOffset + pIdx * 0.5) % 1.0;
            const pt = cond.curve.getPointAt(t);
            photonMesh.position.copy(pt);

            const pMat = photonMesh.material as THREE.MeshBasicMaterial;
            pMat.color.setHex(isFailing ? 0x9b4540 : 0xa99a80);
          });
        }
      });

      // ── 9. Project 3D Node Positions to 2D Screen Space ────
      const coords: Record<
        string,
        { x: number; y: number; visible: boolean }
      > = {};
      const rect = container.getBoundingClientRect();

      nodeGroups.forEach((item, id) => {
        const worldPos = new THREE.Vector3();
        item.group.getWorldPosition(worldPos);

        const projected = worldPos.clone().project(camera);
        const isBehind = projected.z > 1;

        const screenX = ((projected.x + 1) * rect.width) / 2;
        const screenY = ((-projected.y + 1) * rect.height) / 2;

        coords[id] = {
          x: Math.round(screenX),
          y: Math.round(screenY),
          visible: !isBehind,
        };
      });

      setScreenCoords(coords);

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ─────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener("mousemove", handlePointerMove);
      container.removeEventListener("click", handleClick);

      scene.clear();
      renderer.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      ringGeo1.dispose();
      ringGeo2.dispose();
      groundRingMat.dispose();
      photonGeo.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [nodes.length, edges.length]);

  return (
    <div className="relative w-full h-full select-none">
      {/* Three.js Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ minHeight: "460px" }}
      />

      {/* 2D Projected Screen HUD Tags tracking 3D Nodes */}
      {nodes.map((node) => {
        const coord = screenCoords[node.id];
        if (!coord || !coord.visible) return null;

        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;
        const isFailed = node.status === "FAILED" || node.status === "CRITICAL";
        const isDegraded = node.status === "DEGRADED";

        const badgeColor = isFailed
          ? "#9B4540"
          : isDegraded
          ? "#B9955B"
          : "#82977D";

        return (
          <div
            key={node.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelectNode(node.id)}
            aria-label={`Node ${node.name}, status ${node.status}`}
            style={{
              position: "absolute",
              left: `${coord.x}px`,
              top: `${coord.y}px`,
              transform: "translate(-50%, -50%)",
            }}
            className={`pointer-events-auto transition-all group focus:outline-none ${
              isSelected ? "z-30" : isHovered ? "z-25" : "z-20"
            }`}
          >
            {/* Click Hit-Box & Reticle */}
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? "ring-2 ring-white/80 ring-offset-2 ring-offset-[#111210]"
                  : isHovered
                  ? "ring-1 ring-[#A99A80]/70"
                  : "hover:ring-1 hover:ring-white/30"
              }`}
            >
              <span
                className="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded backdrop-blur-md"
                style={{
                  color: isSelected ? "#F0EDE5" : badgeColor,
                  backgroundColor: "rgba(17, 18, 16, 0.8)",
                  border: `1px solid ${isSelected ? "rgba(240,237,229,0.35)" : "rgba(240,237,229,0.12)"}`,
                }}
              >
                {node.code}
              </span>
            </div>

            {/* Dimensional Callout Tag below the 3D Node */}
            <div
              className={`absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded text-[10px] font-mono transition-all backdrop-blur-md shadow-xl pointer-events-none ${
                isSelected
                  ? "bg-[#20211D]/95 text-[#F0EDE5] border border-white/20 shadow-white/5"
                  : isHovered
                  ? "bg-[#191A17]/95 text-[#F0EDE5] border border-[#A99A80]/40"
                  : "bg-[#191A17]/90 text-[#A7A398] border border-[rgba(240,237,229,0.08)] group-hover:text-[#F0EDE5]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: badgeColor }}
                />
                <span className="font-semibold">
                  {node.name.split(" ")[0]} {node.name.split(" ")[1] || ""}
                </span>
                <span className="text-[9px] opacity-70">
                  [{node.domainLabel.split(" ")[0]}]
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {!webglSupported && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#111210] p-6 text-center text-xs font-mono text-[#A7A398]">
          <p>
            WebGL hardware acceleration unavailable. Telemetry inspector
            remains active.
          </p>
        </div>
      )}
    </div>
  );
}
