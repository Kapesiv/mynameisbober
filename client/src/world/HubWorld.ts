import * as THREE from 'three';

/**
 * Skylanders-inspired colorful Hub Town
 * - Central fountain plaza
 * - Shop building
 * - Dungeon portals (Forest, more later)
 * - PvP Arena entrance
 * - NPCs scattered around
 * - Decorative elements: trees, flowers, lanterns, banners
 */
// ── Fissure gate GLSL ───────────────────────────────────────────────
const FISSURE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FISSURE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uProximity;
uniform vec3  uColor1;
uniform vec3  uColor2;
varying vec2  vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float xAbs = abs(p.x);

  // Jagged fissure edges
  float jaggedEdge = 0.08 + 0.04 * sin(p.y * 15.0 + uTime * 2.0)
                          + 0.03 * sin(p.y * 23.0 - uTime * 3.0)
                          + 0.02 * sin(p.y * 37.0 + uTime * 1.5);

  // Widen when player is close
  float width = jaggedEdge + uProximity * 0.06;

  // Core fissure shape
  float fissureMask = smoothstep(width + 0.03, width - 0.01, xAbs);

  // Hot core intensity
  float coreFactor = 1.0 - xAbs / max(width, 0.01);
  coreFactor = clamp(coreFactor, 0.0, 1.0);

  // Rising energy lines inside fissure
  float energy1 = sin(p.y * 8.0 - uTime * 4.0) * 0.5 + 0.5;
  float energy2 = sin(p.y * 12.0 - uTime * 6.0 + 1.5) * 0.5 + 0.5;
  float energy = (energy1 + energy2 * 0.5) * fissureMask;

  // Pulse
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0);

  // Color: white-hot center -> color1 -> color2 at edges
  vec3 hotCore = vec3(1.0, 0.95, 0.8);
  vec3 col = mix(uColor2, uColor1, coreFactor);
  col = mix(col, hotCore, coreFactor * coreFactor);
  col += energy * uColor1 * 0.4;
  col *= pulse * (0.8 + uProximity * 0.4);

  // Fade at ends of fissure
  float endFade = smoothstep(1.0, 0.7, abs(p.y));
  float alpha = fissureMask * endFade;

  gl_FragColor = vec4(col, alpha);
}
`;

const CORRUPT_FRAG = /* glsl */ `
uniform float uTime;
uniform float uProximity;
uniform vec3  uColor1;
varying vec2  vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float angle = atan(p.y, p.x);

  // Animated veins radiating from center
  float veins = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = angle + fi * 1.047 + uTime * 0.3;
    float vein = abs(sin(a * 3.0 + r * 5.0 - uTime * 1.5));
    vein = pow(vein, 8.0) * smoothstep(1.0, 0.2, r);
    veins += vein;
  }

  // Pulsing rings
  float rings = sin(r * 12.0 - uTime * 2.0) * 0.5 + 0.5;
  rings *= smoothstep(1.0, 0.3, r) * 0.3;

  float pattern = veins * 0.6 + rings;
  float brightness = 0.3 + uProximity * 0.5;

  vec3 col = uColor1 * pattern * brightness;

  // Dark base with glowing veins
  float alpha = (0.4 + pattern * 0.4) * smoothstep(1.05, 0.6, r);

  gl_FragColor = vec4(col, alpha);
}
`;

// JS smoothstep helper (mirrors GLSL smoothstep)
function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class HubWorld {
  public group: THREE.Group;

  // Interactive locations (for proximity checks)
  public shopPosition = new THREE.Vector3(-12, 0, -5);
  public pvpArenaPosition = new THREE.Vector3(15, 0, -8);
  public forestPortalPosition = new THREE.Vector3(0, 0, -25);
  public npcPositions: { name: string; position: THREE.Vector3; dialog: string[] }[] = [];

  // Fissure gate data
  private fissureData: {
    pos: THREE.Vector3;
    shaderMat: THREE.ShaderMaterial;
    corruptShaderMat: THREE.ShaderMaterial;
    embers: THREE.Mesh[];
    edgeStones: THREE.Mesh[];
    mainLight: THREE.PointLight;
    groundLight: THREE.PointLight;
  }[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'hub-world';

    this.buildGround();
    this.buildFountainPlaza();
    this.buildShop();
    this.buildPvPArena();
    this.buildDungeonPortals();
    this.buildNPCs();
    this.buildSpawnAltar();
    this.buildDecorations();
    this.buildLighting();

    scene.add(this.group);
  }

  private buildGround() {
    // Realistic grass ground with procedural detail
    const groundGeo = new THREE.CircleGeometry(65, 80);

    // Vertex color variation for natural grass look
    const count = groundGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = groundGeo.attributes.position.getX(i);
      const z = groundGeo.attributes.position.getY(i); // circle is XY before rotation
      const noise = Math.sin(x * 0.8) * Math.cos(z * 0.6) * 0.5 + 0.5;
      const noise2 = Math.sin(x * 2.1 + z * 1.7) * 0.5 + 0.5;
      // Mix between dark grass, medium grass, and light grass
      const r = 0.18 + noise * 0.08 + noise2 * 0.04;
      const g = 0.35 + noise * 0.15 + noise2 * 0.08;
      const b = 0.10 + noise * 0.05;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Soft ground edge fade - darker ring around border
    const edgeGeo = new THREE.RingGeometry(55, 65, 64);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a1a,
      roughness: 0.95,
      transparent: true,
      opacity: 0.6,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.01;
    this.group.add(edge);

    // ── Cobblestone paths with individual stones ──────────────────────
    const stoneColors = [0x8B7355, 0x7D6B4F, 0x9A8464, 0x746248, 0x887058];
    const gapMat = new THREE.MeshStandardMaterial({ color: 0x4a3a25, roughness: 0.98 });
    const mossPathMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.95 });

    const paths = [
      { from: [0, 0], to: [0, -30], width: 3 },    // North to portal
      { from: [0, 0], to: [-15, -5], width: 2.5 },  // West to shop
      { from: [0, 0], to: [18, -8], width: 2.5 },   // East to PvP
      { from: [0, 0], to: [0, 15], width: 2.5 },    // South spawn
    ];

    for (const p of paths) {
      const dx = p.to[0] - p.from[0];
      const dz = p.to[1] - p.from[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      const dirX = dx / len;
      const dirZ = dz / len;
      const perpX = -dirZ;
      const perpZ = dirX;

      // Dirt base under stones
      const basePath = new THREE.Mesh(
        new THREE.PlaneGeometry(p.width + 0.4, len + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x5a4a35, roughness: 0.96 }),
      );
      basePath.rotation.x = -Math.PI / 2;
      basePath.position.set(
        (p.from[0] + p.to[0]) / 2, 0.015,
        (p.from[1] + p.to[1]) / 2,
      );
      basePath.rotation.z = -angle;
      basePath.receiveShadow = true;
      this.group.add(basePath);

      // Individual cobblestones along the path
      const stoneSpacing = 0.55;
      const stoneCount = Math.floor(len / stoneSpacing);
      const halfWidth = p.width / 2 - 0.25;

      for (let i = 0; i < stoneCount; i++) {
        const t = (i + 0.5) / stoneCount;
        const cx = p.from[0] + dx * t;
        const cz = p.from[1] + dz * t;

        // 2-3 stones across width
        const acrossCount = Math.floor(p.width / 0.7);
        for (let j = 0; j < acrossCount; j++) {
          const offset = (j / (acrossCount - 1) - 0.5) * (p.width - 0.5);
          const sx = cx + perpX * offset + (Math.random() - 0.5) * 0.12;
          const sz = cz + perpZ * offset + (Math.random() - 0.5) * 0.12;

          // Randomly shaped stones
          const sw = 0.3 + Math.random() * 0.2;
          const sd = 0.3 + Math.random() * 0.2;
          const sh = 0.06 + Math.random() * 0.04;
          const colorIdx = Math.floor(Math.random() * stoneColors.length);
          const stoneMat = new THREE.MeshStandardMaterial({
            color: stoneColors[colorIdx], roughness: 0.85 + Math.random() * 0.1,
          });

          const stone = new THREE.Mesh(
            new THREE.BoxGeometry(sw, sh, sd), stoneMat,
          );
          stone.position.set(sx, 0.02 + sh / 2, sz);
          stone.rotation.y = Math.random() * 0.5 - 0.25;
          // Slightly rounded look via scale
          stone.scale.set(1, 1, 1);
          stone.receiveShadow = true;
          stone.castShadow = true;
          this.group.add(stone);
        }
      }

      // Grass tufts along path edges
      for (let i = 0; i < Math.floor(len / 1.2); i++) {
        const t = (i + 0.5) / Math.floor(len / 1.2);
        const cx = p.from[0] + dx * t;
        const cz = p.from[1] + dz * t;

        for (const side of [-1, 1]) {
          if (Math.random() > 0.6) continue;
          const edgeDist = (halfWidth + 0.3 + Math.random() * 0.3) * side;
          const gx = cx + perpX * edgeDist;
          const gz = cz + perpZ * edgeDist;

          const tuft = new THREE.Mesh(
            new THREE.ConeGeometry(0.08 + Math.random() * 0.06, 0.2 + Math.random() * 0.15, 4),
            mossPathMat,
          );
          tuft.position.set(gx, 0.08, gz);
          this.group.add(tuft);
        }
      }

      // Occasional moss between stones
      for (let i = 0; i < Math.floor(len / 2); i++) {
        if (Math.random() > 0.4) continue;
        const t = Math.random();
        const cx = p.from[0] + dx * t;
        const cz = p.from[1] + dz * t;
        const mossOff = (Math.random() - 0.5) * p.width * 0.6;

        const moss = new THREE.Mesh(
          new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 4, 3),
          mossPathMat,
        );
        moss.position.set(
          cx + perpX * mossOff, 0.03,
          cz + perpZ * mossOff,
        );
        moss.scale.y = 0.3;
        this.group.add(moss);
      }

      // Border stones (larger stones along edges)
      for (let i = 0; i < Math.floor(len / 1.5); i++) {
        const t = (i + 0.5) / Math.floor(len / 1.5);
        const cx = p.from[0] + dx * t;
        const cz = p.from[1] + dz * t;

        for (const side of [-1, 1]) {
          if (Math.random() > 0.7) continue;
          const edgeDist = (halfWidth + 0.15) * side;
          const bx = cx + perpX * edgeDist;
          const bz = cz + perpZ * edgeDist;

          const borderStone = new THREE.Mesh(
            new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 5, 4),
            new THREE.MeshStandardMaterial({
              color: stoneColors[Math.floor(Math.random() * stoneColors.length)],
              roughness: 0.9,
            }),
          );
          borderStone.position.set(bx, 0.06, bz);
          borderStone.scale.set(1, 0.5, 1);
          borderStone.receiveShadow = true;
          this.group.add(borderStone);
        }
      }
    }

    // ── Central plaza — circular cobblestone pattern ────────────────────
    // Base circle
    const plazaBase = new THREE.Mesh(
      new THREE.CircleGeometry(8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.9 }),
    );
    plazaBase.rotation.x = -Math.PI / 2;
    plazaBase.position.y = 0.025;
    plazaBase.receiveShadow = true;
    this.group.add(plazaBase);

    // Concentric stone rings
    const ringRadii = [2, 3.5, 5, 6.5, 7.8];
    for (const radius of ringRadii) {
      const stoneCountRing = Math.floor(radius * 6);
      for (let i = 0; i < stoneCountRing; i++) {
        const a = (i / stoneCountRing) * Math.PI * 2 + radius * 0.3; // offset per ring
        const sw = 0.35 + Math.random() * 0.15;
        const sd = 0.3 + Math.random() * 0.12;
        const colorIdx = Math.floor(Math.random() * stoneColors.length);

        const pStone = new THREE.Mesh(
          new THREE.BoxGeometry(sw, 0.07, sd),
          new THREE.MeshStandardMaterial({
            color: stoneColors[colorIdx], roughness: 0.85 + Math.random() * 0.1,
          }),
        );
        pStone.position.set(
          Math.cos(a) * radius, 0.055,
          Math.sin(a) * radius,
        );
        pStone.rotation.y = a + Math.random() * 0.3;
        pStone.receiveShadow = true;
        pStone.castShadow = true;
        this.group.add(pStone);
      }
    }

    // Decorative center ring around the tree
    const centerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.15, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.8 }),
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.06;
    this.group.add(centerRing);
  }

  // Collision radius for the fountain base (used by LocalPlayer)
  public static readonly FOUNTAIN_RADIUS = 3.6;

  private buildFountainPlaza() {
    const tree = new THREE.Group();
    tree.name = 'tree-of-life';

    // --- Materials ---
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
    const barkDark = new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.98 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.8, side: THREE.DoubleSide });
    const leafLight = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.75, side: THREE.DoubleSide });
    const leafGlow = new THREE.MeshStandardMaterial({
      color: 0x3a7a3a, emissive: 0x115511, emissiveIntensity: 0.3,
      roughness: 0.7, side: THREE.DoubleSide,
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x22aacc, transparent: true, opacity: 0.55,
      roughness: 0.05, metalness: 0.3,
      emissive: 0x115566, emissiveIntensity: 0.3,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x44ddaa, emissive: 0x22aa77, emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const mushroomMat = new THREE.MeshStandardMaterial({
      color: 0x88ddaa, emissive: 0x33aa66, emissiveIntensity: 0.5,
      roughness: 0.6,
    });

    // ============================
    // TRUNK - gnarled ancient tree
    // ============================
    const trunkGeo = new THREE.CylinderGeometry(0.7, 2.0, 9, 12, 20);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const twist = Math.sin(y * 0.6) * 0.25;
      const bulge = 1 + Math.sin(y * 2.5 + x * 3) * 0.12 + Math.sin(y * 4.1 + z * 2.7) * 0.08;
      tp.setX(i, x * bulge + twist * z);
      tp.setZ(i, z * bulge - twist * x);
    }
    tp.needsUpdate = true;
    trunkGeo.computeVertexNormals();

    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = 4.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // Trunk hollow - where water emerges
    const hollow = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0805, roughness: 1.0 }),
    );
    hollow.position.set(0, 3.2, 1.4);
    hollow.scale.set(1, 0.7, 0.5);
    tree.add(hollow);

    // ============================
    // ROOTS - spreading across ground
    // ============================
    const rootData = [
      { angle: 0.0, length: 4.5, thick: 0.28, yOff: 0.3 },
      { angle: 0.8, length: 3.8, thick: 0.22, yOff: 0.2 },
      { angle: 1.5, length: 5.0, thick: 0.32, yOff: 0.35 },
      { angle: 2.2, length: 3.5, thick: 0.20, yOff: 0.25 },
      { angle: 3.1, length: 4.8, thick: 0.30, yOff: 0.3 },
      { angle: 3.9, length: 3.3, thick: 0.19, yOff: 0.2 },
      { angle: 4.7, length: 4.2, thick: 0.26, yOff: 0.28 },
      { angle: 5.5, length: 3.6, thick: 0.21, yOff: 0.22 },
    ];

    for (let i = 0; i < rootData.length; i++) {
      const r = rootData[i];
      const rootGeo = new THREE.CylinderGeometry(r.thick * 0.3, r.thick, r.length, 6, 4);
      const rp = rootGeo.attributes.position;
      for (let v = 0; v < rp.count; v++) {
        const vx = rp.getX(v), vy = rp.getY(v), vz = rp.getZ(v);
        rp.setX(v, vx * (1 + Math.sin(vy * 4) * 0.15));
        rp.setZ(v, vz * (1 + Math.cos(vy * 3.5) * 0.12));
      }
      rp.needsUpdate = true;
      rootGeo.computeVertexNormals();

      const root = new THREE.Mesh(rootGeo, barkDark);
      root.position.set(
        Math.cos(r.angle) * (r.length * 0.4),
        r.yOff,
        Math.sin(r.angle) * (r.length * 0.4),
      );
      root.rotation.z = -Math.cos(r.angle) * 1.3;
      root.rotation.x = Math.sin(r.angle) * 1.3;
      root.castShadow = true;
      tree.add(root);

      // Glowing root tips (every other root)
      if (i % 2 === 0) {
        const tipGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 6, 6), runeMat.clone(),
        );
        const tipDist = r.length * 0.75;
        tipGlow.position.set(
          Math.cos(r.angle) * tipDist, 0.08, Math.sin(r.angle) * tipDist,
        );
        tipGlow.name = `tree-root-glow-${i}`;
        tree.add(tipGlow);
      }
    }

    // ============================
    // BRANCHES - spreading from upper trunk
    // ============================
    const branchData = [
      { angle: 0.3, tilt: 0.7, length: 4.0, thick: 0.3 },
      { angle: 1.5, tilt: 0.6, length: 3.5, thick: 0.25 },
      { angle: 2.8, tilt: 0.75, length: 4.5, thick: 0.35 },
      { angle: 4.2, tilt: 0.55, length: 3.8, thick: 0.28 },
      { angle: 5.5, tilt: 0.65, length: 3.2, thick: 0.22 },
    ];

    for (const b of branchData) {
      const branchGeo = new THREE.CylinderGeometry(b.thick * 0.35, b.thick, b.length, 6, 4);
      const bp = branchGeo.attributes.position;
      for (let v = 0; v < bp.count; v++) {
        const vx = bp.getX(v), vy = bp.getY(v);
        bp.setX(v, vx * (1 + Math.sin(vy * 3) * 0.2));
      }
      bp.needsUpdate = true;
      branchGeo.computeVertexNormals();

      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.position.set(Math.cos(b.angle) * 0.8, 7.0, Math.sin(b.angle) * 0.8);
      branch.rotation.z = Math.cos(b.angle) * b.tilt;
      branch.rotation.x = -Math.sin(b.angle) * b.tilt;
      branch.castShadow = true;
      tree.add(branch);
    }

    // ============================
    // CANOPY - leaf clusters
    // ============================
    const leafPositions = [
      { x: 0, y: 10.5, z: 0, size: 2.8 },
      { x: 2.0, y: 10, z: 1.2, size: 2.2 },
      { x: -2.2, y: 9.8, z: 0.8, size: 2.4 },
      { x: 0.8, y: 9.5, z: -2.0, size: 2.0 },
      { x: -1.2, y: 10.2, z: -1.2, size: 1.8 },
      { x: 3.5, y: 8.8, z: 1.8, size: 1.8 },
      { x: -3.0, y: 8.5, z: 2.2, size: 1.6 },
      { x: 2.5, y: 8.6, z: -2.5, size: 1.7 },
      { x: -3.2, y: 8.0, z: -1.5, size: 1.5 },
      { x: 0, y: 11.0, z: 0.5, size: 1.8 },
      { x: 3.0, y: 7.8, z: 0, size: 1.3 },
      { x: -2.5, y: 7.5, z: -2.5, size: 1.4 },
    ];
    const leafMats = [leafMat, leafLight, leafGlow];
    for (let i = 0; i < leafPositions.length; i++) {
      const lp = leafPositions[i];
      const leafCluster = new THREE.Mesh(
        new THREE.SphereGeometry(lp.size, 8, 6), leafMats[i % 3],
      );
      leafCluster.position.set(lp.x, lp.y, lp.z);
      leafCluster.scale.set(1, 0.55, 1);
      leafCluster.name = `tree-leaf-${i}`;
      leafCluster.castShadow = true;
      tree.add(leafCluster);
    }

    // ============================
    // WATER - magical flow from trunk hollow
    // ============================
    const streamGeo = new THREE.CylinderGeometry(0.06, 0.18, 2.8, 8);
    const stream = new THREE.Mesh(streamGeo, waterMat);
    stream.position.set(0, 1.8, 1.8);
    stream.rotation.x = 0.25;
    stream.name = 'tree-waterfall';
    tree.add(stream);

    // Smaller trickle streams from roots
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      const miniStream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.06, 1.2, 6), waterMat,
      );
      miniStream.position.set(
        Math.cos(angle) * 1.6, 0.6, Math.sin(angle) * 1.6,
      );
      miniStream.rotation.z = Math.cos(angle) * 0.5;
      miniStream.rotation.x = -Math.sin(angle) * 0.5;
      miniStream.name = `tree-stream-${i}`;
      tree.add(miniStream);
    }

    // Water pool at base
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.5, 0.12, 32), waterMat,
    );
    pool.position.y = 0.18;
    pool.name = 'tree-water-pool';
    tree.add(pool);

    // Pool stone edge
    const poolEdge = new THREE.Mesh(
      new THREE.TorusGeometry(3.35, 0.2, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.85 }),
    );
    poolEdge.rotation.x = -Math.PI / 2;
    poolEdge.position.y = 0.25;
    tree.add(poolEdge);

    // Splash ripples at waterfall landing
    for (let i = 0; i < 3; i++) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.35, 12),
        new THREE.MeshBasicMaterial({
          color: 0x44ccdd, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(0, 0.2, 2.2);
      ripple.name = `tree-ripple-${i}`;
      tree.add(ripple);
    }

    // ============================
    // RUNES - carved into bark
    // ============================
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ry = 2.0 + i * 0.7;
      const dist = 1.1 + Math.sin(ry * 0.5) * 0.2;
      const rune = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.25, 0.02), runeMat.clone(),
      );
      rune.position.set(Math.cos(angle) * dist, ry, Math.sin(angle) * dist);
      rune.lookAt(new THREE.Vector3(Math.cos(angle) * 5, ry, Math.sin(angle) * 5));
      rune.name = `tree-rune-${i}`;
      tree.add(rune);
    }

    // ============================
    // MOSS patches
    // ============================
    const mossPositions = [
      { x: 1.0, y: 2.0, z: 0.6 }, { x: -1.1, y: 3.2, z: 0.4 },
      { x: 0.4, y: 5.0, z: -1.0 }, { x: -0.6, y: 1.5, z: 1.1 },
      { x: 0.8, y: 6.0, z: -0.5 }, { x: -0.9, y: 4.2, z: -0.7 },
    ];
    for (const mp of mossPositions) {
      const moss = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 5, 4), mossMat,
      );
      moss.position.set(mp.x, mp.y, mp.z);
      moss.scale.y = 0.3;
      tree.add(moss);
    }

    // ============================
    // BIOLUMINESCENT MUSHROOMS
    // ============================
    const mushroomPos: number[][] = [
      [2.2, 0.15, 1.8], [-1.8, 0.12, 2.5], [2.8, 0.1, -1.2],
      [-2.3, 0.14, -2.0], [0.6, 0.18, 3.0], [-0.5, 2.0, 1.3],
      [0.8, 3.5, -0.7],
    ];
    for (const [mx, my, mz] of mushroomPos) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mushroomMat,
      );
      cap.position.set(mx, my + 0.18, mz);
      tree.add(cap);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 0.18, 4),
        new THREE.MeshStandardMaterial({ color: 0xccccbb }),
      );
      stem.position.set(mx, my + 0.09, mz);
      tree.add(stem);
    }

    // ============================
    // FIREFLIES - floating magical particles
    // ============================
    const fireflyBaseMat = new THREE.MeshBasicMaterial({
      color: 0xaaffaa, transparent: true, opacity: 0.7,
    });
    for (let i = 0; i < 20; i++) {
      const firefly = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4), fireflyBaseMat.clone(),
      );
      const bx = (Math.random() - 0.5) * 10;
      const by = 1.5 + Math.random() * 9;
      const bz = (Math.random() - 0.5) * 10;
      firefly.position.set(bx, by, bz);
      firefly.userData.baseX = bx;
      firefly.userData.baseY = by;
      firefly.userData.baseZ = bz;
      firefly.name = `tree-firefly-${i}`;
      tree.add(firefly);
    }

    // ============================
    // LIGHTING
    // ============================
    const canopyLight = new THREE.PointLight(0x44cc88, 2.0, 20);
    canopyLight.position.set(0, 10, 0);
    tree.add(canopyLight);

    const waterLight = new THREE.PointLight(0x22aacc, 1.5, 10);
    waterLight.position.set(0, 0.5, 0.5);
    tree.add(waterLight);

    const runeLight = new THREE.PointLight(0x44ddaa, 1.0, 8);
    runeLight.position.set(0, 3.5, 0);
    tree.add(runeLight);

    const upLight = new THREE.PointLight(0x88cc44, 0.6, 12);
    upLight.position.set(0, 6, 0);
    tree.add(upLight);

    this.group.add(tree);
  }

  private buildShop() {
    const pos = this.shopPosition;
    const stall = new THREE.Group();
    stall.name = 'market-stall';

    // --- Materials ---
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 });
    const woodWeathered = new THREE.MeshStandardMaterial({ color: 0x6e4e2e, roughness: 0.92 });
    const clothRed = new THREE.MeshStandardMaterial({ color: 0xaa3322, roughness: 0.95, side: THREE.DoubleSide });
    const clothGold = new THREE.MeshStandardMaterial({ color: 0xccaa33, roughness: 0.9, side: THREE.DoubleSide });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });

    // ============================
    // FRAME - four corner posts
    // ============================
    const postPos: number[][] = [[-3.2, -2], [3.2, -2], [-3.2, 2], [3.2, 2]];
    const postHeights = [4.5, 4.5, 3.8, 3.8];
    for (let i = 0; i < postPos.length; i++) {
      const [px, pz] = postPos[i];
      const h = postHeights[i];
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, h, 6), woodDark,
      );
      post.position.set(px, h / 2, pz);
      post.castShadow = true;
      stall.add(post);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.25, 0.2, 6), woodWeathered,
      );
      base.position.set(px, 0.1, pz);
      stall.add(base);
    }

    // Crossbeams
    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 0.1), woodDark);
    frontBeam.position.set(0, 3.8, 2);
    stall.add(frontBeam);
    const backBeam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 0.1), woodDark);
    backBeam.position.set(0, 4.5, -2);
    stall.add(backBeam);

    // ============================
    // AWNING - angled cloth roof
    // ============================
    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 4.8), clothRed,
    );
    awning.position.set(0, 4.15, 0);
    awning.rotation.x = -Math.PI / 2 + 0.1;
    stall.add(awning);

    // Gold stripes
    for (let i = -1; i <= 1; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 4.8), clothGold,
      );
      stripe.position.set(i * 2.2, 4.17, 0);
      stripe.rotation.x = -Math.PI / 2 + 0.1;
      stall.add(stripe);
    }

    // Scalloped awning edge
    for (let i = -3; i <= 3; i++) {
      const scallop = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 6, 0, Math.PI), clothRed,
      );
      scallop.position.set(i * 1.0, 3.65, 2.35);
      scallop.rotation.x = 0.1;
      stall.add(scallop);
    }

    // ============================
    // COUNTER - wooden front counter
    // ============================
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.15, 1.2), woodLight);
    counter.position.set(0, 1.15, 2.2);
    counter.castShadow = true;
    counter.receiveShadow = true;
    stall.add(counter);

    const counterFront = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.0, 0.1), woodWeathered);
    counterFront.position.set(0, 0.72, 2.8);
    stall.add(counterFront);

    for (const lx of [-2.5, 0, 2.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), woodDark);
      leg.position.set(lx, 0.57, 2.2);
      stall.add(leg);
    }

    // ============================
    // BACK SHELVES
    // ============================
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.5, 0.12), woodWeathered);
    backWall.position.set(0, 2.0, -2.0);
    backWall.castShadow = true;
    stall.add(backWall);

    for (const sy of [2.0, 3.0]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.8), woodLight);
      shelf.position.set(0, sy, -1.5);
      stall.add(shelf);
    }

    // ============================
    // MERCHANDISE - potions on counter
    // ============================
    const potionColors = [0xff3333, 0x3366ff, 0x33dd33, 0xffaa00, 0xdd33dd];
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6),
        new THREE.MeshStandardMaterial({
          color: potionColors[i], transparent: true, opacity: 0.7, roughness: 0.1,
        }),
      );
      bottle.position.set(-2 + i * 1.0, 1.35, 2.2);
      stall.add(bottle);

      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.06, 4),
        new THREE.MeshStandardMaterial({ color: 0xaa8855 }),
      );
      cork.position.set(-2 + i * 1.0, 1.5, 2.2);
      stall.add(cork);
    }

    // Jars on lower shelf
    const jarMat = new THREE.MeshStandardMaterial({ color: 0x997744, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 6), jarMat);
      jar.position.set(-1.5 + i * 1.2, 2.23, -1.5);
      stall.add(jar);
    }

    // Scrolls on upper shelf
    const scrollMat = new THREE.MeshStandardMaterial({ color: 0xddcc99, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const scroll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), scrollMat,
      );
      scroll.position.set(-1 + i * 1.0, 3.12, -1.5);
      scroll.rotation.z = Math.PI / 2;
      scroll.rotation.y = 0.3 * i;
      stall.add(scroll);
    }

    // ============================
    // HANGING ITEMS
    // ============================
    for (const lx of [-2, 2]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), metalMat,
      );
      chain.position.set(lx, 3.5, 2.3);
      stall.add(chain);

      const cage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.25, 6), metalMat,
      );
      cage.position.set(lx, 3.05, 2.3);
      stall.add(cage);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshStandardMaterial({
          color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.0,
        }),
      );
      glow.position.set(lx, 3.05, 2.3);
      stall.add(glow);

      const lLight = new THREE.PointLight(0xffaa44, 0.6, 5);
      lLight.position.set(lx, 3.05, 2.3);
      stall.add(lLight);
    }

    // Hanging herbs
    const herbColors = [0x557733, 0x886633, 0x445522];
    for (let i = 0; i < 3; i++) {
      const herbs = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.45, 5),
        new THREE.MeshStandardMaterial({ color: herbColors[i] }),
      );
      herbs.position.set(-1 + i * 1.0, 3.5, 0);
      herbs.rotation.x = Math.PI;
      herbs.name = `stall-herbs-${i}`;
      stall.add(herbs);
    }

    // ============================
    // BARRELS & CRATES
    // ============================
    const barrelPositions: number[][] = [[-3.8, 0], [3.8, 0.3], [-3.8, -1.2]];
    for (const [bx, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.38, 0.9, 8), woodLight,
      );
      barrel.position.set(bx, 0.45, bz);
      barrel.castShadow = true;
      stall.add(barrel);

      for (const ry of [0.15, 0.45, 0.75]) {
        const hoop = new THREE.Mesh(
          new THREE.TorusGeometry(0.41, 0.015, 6, 12), metalMat,
        );
        hoop.position.set(bx, ry, bz);
        hoop.rotation.x = Math.PI / 2;
        stall.add(hoop);
      }
    }

    const crateData: number[][] = [[3.8, 0.3, -1.2, 0.6], [4.1, 0.85, -1.0, 0.45]];
    for (const [cx, cy, cz, s] of crateData) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), woodDark);
      crate.position.set(cx, cy, cz);
      crate.rotation.y = Math.random() * 0.4;
      crate.castShadow = true;
      stall.add(crate);
    }

    // ============================
    // SIGN - "SHOP"
    // ============================
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.8, 0.08), woodDark,
    );
    signBoard.position.set(0, 4.3, 2.5);
    stall.add(signBoard);

    const signText = this.createTextSign('SHOP', 0xFFD700);
    signText.position.set(0, 4.3, 2.65);
    stall.add(signText);

    for (const sx of [-0.8, 0.8]) {
      const sChain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), metalMat,
      );
      sChain.position.set(sx, 4.55, 2.5);
      stall.add(sChain);
    }

    // ============================
    // FLOOR - rug under the stall
    // ============================
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 3),
      new THREE.MeshStandardMaterial({ color: 0x884433, roughness: 0.95 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, 0);
    stall.add(rug);

    // ============================
    // LIGHTING
    // ============================
    const warmLight = new THREE.PointLight(0xffaa44, 1.8, 12);
    warmLight.position.set(0, 3.5, 0);
    stall.add(warmLight);

    const counterLight = new THREE.PointLight(0xffcc66, 0.6, 5);
    counterLight.position.set(0, 2.0, 2.0);
    stall.add(counterLight);

    stall.position.copy(pos);
    this.group.add(stall);
  }

  private buildPvPArena() {
    const pos = this.pvpArenaPosition;

    // Arena walls (colosseum-style arc)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.75 });

    // Back curved wall
    for (let i = -3; i <= 3; i++) {
      const angle = (i / 3) * 0.8;
      const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 6, 8);
      const pillar = new THREE.Mesh(pillarGeo, wallMat);
      pillar.position.set(
        pos.x + Math.sin(angle) * 6,
        3,
        pos.z - Math.cos(angle) * 6,
      );
      pillar.castShadow = true;
      this.group.add(pillar);
    }

    // Arena floor
    const floorGeo = new THREE.CircleGeometry(5, 24);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xAA8844, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(pos.x, 0.04, pos.z);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Gate entrance
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
    const gateLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateLeft.position.set(pos.x - 1.5, 2, pos.z + 5);
    gateLeft.castShadow = true;
    this.group.add(gateLeft);

    const gateRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateRight.position.set(pos.x + 1.5, 2, pos.z + 5);
    gateRight.castShadow = true;
    this.group.add(gateRight);

    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 0.6), gateMat);
    gateTop.position.set(pos.x, 4.3, pos.z + 5);
    this.group.add(gateTop);

    // Sign
    const sign = this.createTextSign('PVP ARENA', 0xFF4444);
    sign.position.set(pos.x, 5.5, pos.z + 5);
    this.group.add(sign);

    // Red glow
    const pvpLight = new THREE.PointLight(0xff4444, 1.5, 12);
    pvpLight.position.set(pos.x, 4, pos.z);
    this.group.add(pvpLight);
  }

  private buildDungeonPortals() {
    // Forest Dungeon Fissure — orange/dark-red Solo Leveling style
    this.createFissureGate(
      this.forestPortalPosition,
      'DARK FOREST',
      0xff6600,
      0x8b0000,
    );

    // Future portals (locked/greyed out placeholders)
    const futurePortals = [
      { pos: new THREE.Vector3(-10, 0, -25), name: 'ICE CAVES' },
      { pos: new THREE.Vector3(10, 0, -25), name: 'VOLCANO' },
    ];
    for (const fp of futurePortals) {
      this.createFissureGate(fp.pos, fp.name + ' [LOCKED]', 0x555555, 0x333333);
    }
  }

  private createFissureGate(pos: THREE.Vector3, label: string, color: number, emissive: number) {
    const c1 = new THREE.Color(color);
    const c2 = new THREE.Color(emissive);

    // ── a) Fissure mesh — ground-level glowing crack ──────────────────
    const fissureGeo = new THREE.PlaneGeometry(2, 8, 20, 80);
    const fPos = fissureGeo.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const x = fPos.getX(i), y = fPos.getY(i);
      const edge = Math.abs(x) / 1.0;
      const disp = (Math.sin(y * 5.0) * 0.08 + Math.sin(y * 11.0) * 0.04) * edge;
      fPos.setX(i, x + disp);
      fPos.setZ(i, (Math.random() - 0.5) * 0.02);
    }
    fPos.needsUpdate = true;
    fissureGeo.computeVertexNormals();

    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProximity: { value: 0 },
        uColor1: { value: new THREE.Vector3(c1.r, c1.g, c1.b) },
        uColor2: { value: new THREE.Vector3(c2.r, c2.g, c2.b) },
      },
      vertexShader: FISSURE_VERT,
      fragmentShader: FISSURE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const fissureMesh = new THREE.Mesh(fissureGeo, shaderMat);
    fissureMesh.rotation.x = -Math.PI / 2;
    fissureMesh.position.set(pos.x, 0.05, pos.z);
    this.group.add(fissureMesh);

    // ── b) Edge stones — jagged rocks along the crack ─────────────────
    const edgeStones: THREE.Mesh[] = [];
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.95,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.0,
    });

    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const along = (i / 24) * 8 - 4;
      const height = 0.3 + Math.random() * 0.5;
      const stoneGeo = new THREE.ConeGeometry(
        0.12 + Math.random() * 0.15,
        height,
        4 + Math.floor(Math.random() * 3),
      );
      const sp = stoneGeo.attributes.position;
      for (let v = 0; v < sp.count; v++) {
        sp.setX(v, sp.getX(v) * (1 + (Math.random() - 0.5) * 0.3));
        sp.setZ(v, sp.getZ(v) * (1 + (Math.random() - 0.5) * 0.3));
        sp.setY(v, sp.getY(v) * (1 + (Math.random() - 0.5) * 0.1));
      }
      sp.needsUpdate = true;
      stoneGeo.computeVertexNormals();

      const stone = new THREE.Mesh(stoneGeo, stoneMat.clone());
      const offsetX = side * (0.4 + Math.random() * 0.5);
      stone.position.set(
        pos.x + offsetX,
        height / 2,
        pos.z + along + (Math.random() - 0.5) * 0.4,
      );
      stone.rotation.z = side * (0.2 + Math.random() * 0.4);
      stone.rotation.x = (Math.random() - 0.5) * 0.3;
      stone.castShadow = true;
      this.group.add(stone);
      edgeStones.push(stone);
    }

    // ── c) Rising embers — cyclic particles from fissure ──────────────
    const embers: THREE.Mesh[] = [];
    for (let i = 0; i < 30; i++) {
      const emberMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffcc44 : (i % 3 === 1 ? color : 0xff4400),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const size = 0.03 + Math.random() * 0.05;
      const geo = i % 2 === 0
        ? new THREE.SphereGeometry(size, 4, 4)
        : new THREE.OctahedronGeometry(size, 0);
      const ember = new THREE.Mesh(geo, emberMat);
      ember.userData = {
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.0,
        xOffset: (Math.random() - 0.5) * 1.2,
        zAlong: (Math.random() - 0.5) * 6,
        maxHeight: 2.0 + Math.random() * 3.0,
        bonusEmber: i >= 20,
      };
      ember.position.set(pos.x, 0, pos.z);
      this.group.add(ember);
      embers.push(ember);
    }

    // ── d) Ground corruption — dark disc with animated veins ──────────
    const corruptShaderMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProximity: { value: 0 },
        uColor1: { value: new THREE.Vector3(c1.r * 0.5, c1.g * 0.5, c1.b * 0.5) },
      },
      vertexShader: FISSURE_VERT,
      fragmentShader: CORRUPT_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const corruptMesh = new THREE.Mesh(new THREE.CircleGeometry(5, 32), corruptShaderMat);
    corruptMesh.rotation.x = -Math.PI / 2;
    corruptMesh.position.set(pos.x, 0.03, pos.z);
    this.group.add(corruptMesh);

    // Static tendrils
    const tendrilMat = new THREE.MeshStandardMaterial({
      color: 0x0a050a,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: 0.1,
      roughness: 0.95,
      transparent: true,
      opacity: 0.5,
    });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const len = 1.0 + Math.sin(i * 3.1) * 0.5;
      const tendril = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, len), tendrilMat);
      tendril.position.set(
        pos.x + Math.cos(angle) * (4.5 + len / 2),
        0.02,
        pos.z + Math.sin(angle) * (4.5 + len / 2),
      );
      tendril.rotation.y = -angle;
      this.group.add(tendril);
    }

    // ── e) Lighting ───────────────────────────────────────────────────
    const mainLight = new THREE.PointLight(color, 3, 15);
    mainLight.position.set(pos.x, -0.5, pos.z);
    this.group.add(mainLight);

    const groundLight = new THREE.PointLight(emissive, 1.5, 8);
    groundLight.position.set(pos.x, 0.3, pos.z);
    this.group.add(groundLight);

    // ── f) Sign ───────────────────────────────────────────────────────
    const sign = this.createTextSign(label, color);
    sign.position.set(pos.x, 2.5, pos.z);
    this.group.add(sign);

    // ── Store fissure data for update() ───────────────────────────────
    this.fissureData.push({
      pos: pos.clone(),
      shaderMat,
      corruptShaderMat,
      embers,
      edgeStones,
      mainLight,
      groundLight,
    });
  }


  private buildNPCs() {
    const npcs = [
      {
        name: 'Elder Mika',
        position: new THREE.Vector3(5, 0, 3),
        color: 0x6644aa,
        dialog: [
          'Welcome, adventurer! This is the Hub Town.',
          'The Dark Forest portal leads to dangerous creatures...',
          'I heard that enough wood scraps can be fashioned into something useful...',
        ],
      },
      {
        name: 'Gernal',
        position: new THREE.Vector3(-12, 0, -5),
        color: 0xaa4422,
        isShopkeeper: true,
        dialog: [
          'Welcome to me shop, traveller! Finest goods in all the land!',
          'Bring me materials and I can craft something special!',
          'Wolf pelts make excellent armor, if you gather enough...',
          'The ancient forest wood combined with sturdy pelts makes a fine bow...',
        ],
      },
      {
        name: 'Scout Aino',
        position: new THREE.Vector3(3, 0, -18),
        color: 0x22aa66,
        dialog: [
          'The Dark Forest is just the beginning...',
          'They say an Ancient Treant guards the deepest grove.',
          'Be careful of the Giant Spiders - they are fast!',
        ],
      },
    ];

    for (const npc of npcs) {
      if ((npc as any).isShopkeeper) {
        this.createGernalMesh(npc.position);
      } else {
        this.createNPCMesh(npc.name, npc.position, npc.color);
      }
      this.npcPositions.push({
        name: npc.name,
        position: npc.position,
        dialog: npc.dialog,
      });
    }
  }

  private createGernalMesh(pos: THREE.Vector3) {
    const g = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.75 });
    const skinDark = new THREE.MeshStandardMaterial({ color: 0xc49464, roughness: 0.8 });
    const beardMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.92 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 });
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x5a3322, roughness: 0.85 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x44332a, roughness: 0.85 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.3 });
    const eyeIrisMat = new THREE.MeshStandardMaterial({ color: 0x4a6a44, roughness: 0.3 });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // ============================
    // LEGS & BOOTS
    // ============================
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.2, 0.7, 8), pantsMat,
      );
      thigh.position.set(side * 0.2, 0.75, 0);
      thigh.castShadow = true;
      g.add(thigh);

      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.15, 0.6, 8), pantsMat,
      );
      shin.position.set(side * 0.2, 0.3, 0);
      shin.castShadow = true;
      g.add(shin);

      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.35), bootMat,
      );
      boot.position.set(side * 0.2, 0.09, 0.05);
      boot.castShadow = true;
      g.add(boot);

      // Boot buckle
      const buckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x999933, metalness: 0.7, roughness: 0.3 }),
      );
      buckle.position.set(side * 0.2, 0.12, 0.23);
      g.add(buckle);
    }

    // ============================
    // BODY — BIG BELLY
    // ============================
    const lowerTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.35, 0.5, 10), shirtMat,
    );
    lowerTorso.position.y = 1.25;
    lowerTorso.castShadow = true;
    g.add(lowerTorso);

    // The glorious big belly
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 14, 12), shirtMat,
    );
    belly.position.set(0, 1.5, 0.18);
    belly.scale.set(1, 0.85, 1.15);
    belly.castShadow = true;
    g.add(belly);

    // Upper chest
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.45, 10), shirtMat,
    );
    chest.position.y = 1.88;
    chest.castShadow = true;
    g.add(chest);

    // Shirt collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.04, 6, 12), shirtMat,
    );
    collar.position.y = 2.08;
    collar.rotation.x = Math.PI / 2;
    g.add(collar);

    // Leather apron over belly
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.95, 0.04), apronMat,
    );
    apron.position.set(0, 1.35, 0.5);
    g.add(apron);

    // Apron pocket
    const pocket = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x4a2818, roughness: 0.88 }),
    );
    pocket.position.set(0.12, 1.2, 0.52);
    g.add(pocket);

    // Apron strings around waist
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), apronMat,
      );
      strap.position.set(side * 0.36, 1.7, 0.3);
      strap.rotation.z = side * 0.3;
      strap.rotation.x = -0.25;
      g.add(strap);
    }

    // Belt
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 6, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x3a2211, roughness: 0.8 }),
    );
    belt.position.set(0, 1.15, 0.1);
    belt.rotation.x = Math.PI / 2;
    g.add(belt);

    // Belt buckle
    const beltBuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xbbaa44, metalness: 0.7, roughness: 0.3 }),
    );
    beltBuckle.position.set(0, 1.15, 0.47);
    g.add(beltBuckle);

    // ============================
    // ARMS — muscular, rolled sleeves
    // ============================
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 8, 6), shirtMat,
      );
      shoulder.position.set(side * 0.52, 1.95, 0);
      g.add(shoulder);

      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.15, 0.5, 6), shirtMat,
      );
      upperArm.position.set(side * 0.58, 1.65, 0.1);
      upperArm.rotation.z = side * 0.25;
      upperArm.rotation.x = -0.2;
      g.add(upperArm);

      // Rolled-up sleeve edge
      const sleeveRoll = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.025, 6, 8), shirtMat,
      );
      sleeveRoll.position.set(side * 0.6, 1.45, 0.15);
      sleeveRoll.rotation.x = Math.PI / 2;
      g.add(sleeveRoll);

      // Forearm (bare skin, hairy)
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, 0.45, 6), skinMat,
      );
      forearm.position.set(side * 0.62, 1.3, 0.28);
      forearm.rotation.x = -0.5;
      g.add(forearm);

      // Hand
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6), skinMat,
      );
      hand.position.set(side * 0.62, 1.1, 0.42);
      hand.scale.set(1, 0.7, 1.2);
      g.add(hand);

      // Thick sausage fingers
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.028, 0.1, 5), skinMat,
        );
        finger.position.set(
          side * 0.62 + (f - 1.5) * 0.03,
          1.03, 0.44 + f * 0.015,
        );
        finger.rotation.x = -0.3;
        g.add(finger);
      }
      // Thumb
      const thumb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.08, 4), skinMat,
      );
      thumb.position.set(side * (0.62 + side * 0.06), 1.08, 0.38);
      thumb.rotation.z = side * 0.6;
      g.add(thumb);
    }

    // ============================
    // NECK — thick, stocky
    // ============================
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.18, 8), skinMat,
    );
    neck.position.y = 2.15;
    g.add(neck);

    // ============================
    // HEAD — round, weathered face
    // ============================
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 14, 12), skinMat,
    );
    head.position.y = 2.46;
    head.scale.set(1, 1.05, 0.95);
    head.castShadow = true;
    g.add(head);

    // Forehead wrinkles
    for (let w = 0; w < 3; w++) {
      const wrinkle = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 - w * 0.04, 0.008, 0.01),
        new THREE.MeshStandardMaterial({ color: 0xb89060, roughness: 0.9 }),
      );
      wrinkle.position.set(0, 2.58 + w * 0.035, 0.28);
      g.add(wrinkle);
    }

    // Rosy cheeks
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xd49080, roughness: 0.8 }),
      );
      cheek.position.set(side * 0.2, 2.38, 0.22);
      cheek.scale.set(1, 0.65, 0.7);
      g.add(cheek);
    }

    // Big bulbous nose
    const noseBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 0.12, 6), skinDark,
    );
    noseBridge.position.set(0, 2.48, 0.3);
    noseBridge.rotation.x = -0.2;
    g.add(noseBridge);

    const noseBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 6), skinDark,
    );
    noseBulb.position.set(0, 2.42, 0.32);
    g.add(noseBulb);

    // Nostrils
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 4, 4),
        new THREE.MeshStandardMaterial({ color: 0x8a6a5a }),
      );
      nostril.position.set(side * 0.035, 2.39, 0.36);
      g.add(nostril);
    }

    // ============================
    // EYES — small, friendly
    // ============================
    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6), skinDark,
      );
      socket.position.set(side * 0.12, 2.49, 0.26);
      g.add(socket);

      const eyeball = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8), eyeWhiteMat,
      );
      eyeball.position.set(side * 0.12, 2.49, 0.28);
      g.add(eyeball);

      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 8, 8), eyeIrisMat,
      );
      iris.position.set(side * 0.12, 2.49, 0.318);
      g.add(iris);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 4, 4), eyePupilMat,
      );
      pupil.position.set(side * 0.12, 2.49, 0.335);
      g.add(pupil);

      // Crow's feet (wrinkles by eyes)
      for (let c = 0; c < 3; c++) {
        const crow = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.006, 0.005),
          new THREE.MeshStandardMaterial({ color: 0xb89060 }),
        );
        crow.position.set(side * 0.22, 2.49 + (c - 1) * 0.025, 0.24);
        crow.rotation.z = side * (0.15 + c * 0.12);
        g.add(crow);
      }

      // Big bushy eyebrow
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.045, 0.06), hairMat,
      );
      brow.position.set(side * 0.12, 2.56, 0.27);
      brow.rotation.z = side * -0.12;
      g.add(brow);

      // Bushy tufts sticking out
      for (let t = 0; t < 2; t++) {
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.02, 0.06, 4), hairMat,
        );
        tuft.position.set(side * (0.16 + t * 0.05), 2.575, 0.27);
        tuft.rotation.z = side * (-0.4 - t * 0.3);
        g.add(tuft);
      }
    }

    // Mouth
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.012, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x994444 }),
    );
    mouth.position.set(0, 2.34, 0.31);
    g.add(mouth);

    // Ears — large, sticking out
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6), skinMat,
      );
      ear.position.set(side * 0.33, 2.45, 0.02);
      ear.scale.set(0.45, 1.1, 0.8);
      g.add(ear);

      // Ear lobe
      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4), skinDark,
      );
      lobe.position.set(side * 0.34, 2.38, 0.04);
      g.add(lobe);
    }

    // ============================
    // LONG MAGNIFICENT BEARD
    // ============================
    // Jaw beard base
    const beardJaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8), beardMat,
    );
    beardJaw.position.set(0, 2.28, 0.18);
    beardJaw.scale.set(1.2, 0.55, 1);
    g.add(beardJaw);

    // Cheek beard sides
    for (const side of [-1, 1]) {
      const cheekBeard = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6), beardMat,
      );
      cheekBeard.position.set(side * 0.22, 2.32, 0.15);
      cheekBeard.scale.set(0.8, 0.9, 0.7);
      g.add(cheekBeard);
    }

    // Mid beard — flowing down chest
    const beardMid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.24, 0.55, 8), beardMat,
    );
    beardMid.position.set(0, 2.0, 0.25);
    beardMid.castShadow = true;
    g.add(beardMid);

    // Lower beard — long section
    const beardLower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 0.55, 8), beardMat,
    );
    beardLower.position.set(0, 1.55, 0.3);
    beardLower.castShadow = true;
    g.add(beardLower);

    // Beard tip — reaching belly!
    const beardTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.45, 6), beardMat,
    );
    beardTip.position.set(0, 1.1, 0.35);
    beardTip.name = 'gernal-beard-tip';
    g.add(beardTip);

    // Beard wave details (layered strips for texture)
    for (let w = 0; w < 4; w++) {
      const wave = new THREE.Mesh(
        new THREE.TorusGeometry(0.14 + w * 0.02, 0.02, 4, 12, Math.PI),
        beardMat,
      );
      wave.position.set(0, 1.9 - w * 0.2, 0.32 + w * 0.015);
      wave.rotation.y = Math.PI;
      g.add(wave);
    }

    // Side wisps
    for (const side of [-1, 1]) {
      const wisp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.07, 0.45, 5), beardMat,
      );
      wisp.position.set(side * 0.2, 2.05, 0.18);
      wisp.rotation.z = side * 0.2;
      g.add(wisp);
    }

    // Magnificent handlebar mustache
    for (const side of [-1, 1]) {
      const stache = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.045, 0.22, 5), beardMat,
      );
      stache.position.set(side * 0.1, 2.36, 0.33);
      stache.rotation.z = side * 1.1;
      g.add(stache);

      // Curl at end
      const curl = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 6), beardMat,
      );
      curl.position.set(side * 0.22, 2.34, 0.3);
      g.add(curl);
    }

    // ============================
    // HAIR — balding on top, thick on sides
    // ============================
    for (const side of [-1, 1]) {
      const sideHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6), hairMat,
      );
      sideHair.position.set(side * 0.29, 2.5, -0.06);
      sideHair.scale.set(0.55, 1, 0.8);
      g.add(sideHair);
    }

    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6), hairMat,
    );
    backHair.position.set(0, 2.42, -0.22);
    backHair.scale.set(1.2, 1, 0.6);
    g.add(backHair);

    // Shiny bald top
    const baldTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xdaad7a, roughness: 0.5, metalness: 0.05 }),
    );
    baldTop.position.set(0, 2.62, 0.03);
    baldTop.scale.set(1, 0.4, 1);
    g.add(baldTop);

    // ============================
    // NAME LABEL
    // ============================
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('!', 128, 35);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText('Gernal', 128, 75);
    ctx.fillText('Gernal', 128, 75);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.3;
    sprite.scale.set(2.5, 0.9, 1);
    g.add(sprite);

    g.position.copy(pos);
    g.name = 'npc-Gernal';
    this.group.add(g);
  }

  private createNPCMesh(name: string, pos: THREE.Vector3, color: number) {
    const npcGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.45, 1.1, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    npcGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.15;
    head.castShadow = true;
    npcGroup.add(head);

    // Floating name + "!" indicator
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // "!" quest marker
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('!', 128, 35);

    // Name
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(name, 128, 75);
    ctx.fillText(name, 128, 75);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.2;
    sprite.scale.set(2.5, 0.9, 1);
    npcGroup.add(sprite);

    npcGroup.position.copy(pos);
    npcGroup.name = `npc-${name}`;
    this.group.add(npcGroup);
  }

  private buildSpawnAltar() {
    const altarGroup = new THREE.Group();
    const cx = 0, cz = 0; // local coords inside group

    // --- Raised stone platform (3 tiers) ---
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.75, metalness: 0.1 });
    const stoneLight = new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.7, metalness: 0.15 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x50505c, roughness: 0.8 });

    // Bottom tier - wide octagonal base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.5, 8), stoneDark);
    base.position.set(cx, 0.25, cz);
    base.receiveShadow = true;
    base.castShadow = true;
    altarGroup.add(base);

    // Middle tier
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 0.5, 8), stoneMat);
    mid.position.set(cx, 0.75, cz);
    mid.receiveShadow = true;
    mid.castShadow = true;
    altarGroup.add(mid);

    // Top tier - the altar surface
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 0.4, 8), stoneLight);
    top.position.set(cx, 1.2, cz);
    top.receiveShadow = true;
    top.castShadow = true;
    altarGroup.add(top);

    // --- Carved rune grooves on top surface ---
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x33aaff,
      emissive: 0x1166aa,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    // Inner rune circle
    const runeRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.04, 8, 32), runeMat);
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.set(cx, 1.42, cz);
    altarGroup.add(runeRing);

    // Rune lines radiating from center (8 directions)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.0), runeMat);
      line.position.set(
        cx + Math.cos(angle) * 0.7,
        1.42,
        cz + Math.sin(angle) * 0.7,
      );
      line.rotation.y = -angle + Math.PI / 2;
      altarGroup.add(line);
    }

    // Small rune symbols at each line end
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const symbol = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), runeMat);
      symbol.position.set(
        cx + Math.cos(angle) * 1.4,
        1.44,
        cz + Math.sin(angle) * 1.4,
      );
      altarGroup.add(symbol);
    }

    // --- Four corner pillars with ancient carvings ---
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5c5c68, roughness: 0.7, metalness: 0.2 });
    const pillarPositions = [
      [cx - 3.5, cz - 3.5],
      [cx + 3.5, cz - 3.5],
      [cx - 3.5, cz + 3.5],
      [cx + 3.5, cz + 3.5],
    ];

    for (const [px, pz] of pillarPositions) {
      // Pillar base
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), stoneDark);
      pBase.position.set(px, 0.15, pz);
      pBase.castShadow = true;
      altarGroup.add(pBase);

      // Pillar shaft (tapered)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 3.0, 6), pillarMat);
      shaft.position.set(px, 1.8, pz);
      shaft.castShadow = true;
      altarGroup.add(shaft);

      // Carved rings on pillar
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 12), stoneMat);
        ring.position.set(px, 0.8 + r * 0.9, pz);
        ring.rotation.x = Math.PI / 2;
        altarGroup.add(ring);
      }

      // Pillar cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.3, 6), stoneMat);
      cap.position.set(px, 3.45, pz);
      altarGroup.add(cap);

      // Glowing crystal on top
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x44ccff,
        emissive: 0x2288cc,
        emissiveIntensity: 1.0,
        roughness: 0.1,
        metalness: 0.4,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat);
      crystal.position.set(px, 3.85, pz);
      crystal.rotation.y = Math.PI / 4;
      crystal.name = 'altar-crystal';
      altarGroup.add(crystal);

      // Crystal glow light
      const cLight = new THREE.PointLight(0x44ccff, 0.8, 6);
      cLight.position.set(px, 3.85, pz);
      altarGroup.add(cLight);
    }

    // --- Central altar stone (the main altar piece) ---
    const altarMat = new THREE.MeshStandardMaterial({
      color: 0x7a7a88,
      roughness: 0.5,
      metalness: 0.25,
    });
    const altarBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.6), altarMat);
    altarBlock.position.set(cx, 1.75, cz);
    altarBlock.castShadow = true;
    altarGroup.add(altarBlock);

    // Altar top slab (polished)
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x9090a0,
      roughness: 0.3,
      metalness: 0.35,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), slabMat);
    slab.position.set(cx, 2.14, cz);
    altarGroup.add(slab);

    // Floating rune orb above altar (spawn indicator)
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      emissive: 0x3399cc,
      emissiveIntensity: 1.2,
      roughness: 0.05,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), orbMat);
    orb.position.set(cx, 3.0, cz);
    orb.name = 'spawn-orb';
    altarGroup.add(orb);

    // Orb inner glow
    const orbInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0.6 }),
    );
    orbInner.position.set(cx, 3.0, cz);
    orbInner.name = 'spawn-orb-inner';
    altarGroup.add(orbInner);

    // Central light
    const altarLight = new THREE.PointLight(0x55ccff, 2.5, 12);
    altarLight.position.set(cx, 3.2, cz);
    altarGroup.add(altarLight);

    // --- Steps on all 4 sides, attached to altar base edge ---
    const stepDist = [4.2, 5.2, 6.2, 7.2];
    const stepY    = [0.28, 0.14, 0.0, -0.1];
    const stepW    = [2.8, 2.4, 2.0, 1.6];

    // North (-Z) and South (+Z)
    for (const dir of [-1, 1]) {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(stepW[s], 0.2, 0.85),
          s % 2 === 0 ? stoneMat : stoneLight,
        );
        step.position.set(cx, stepY[s], cz + dir * stepDist[s]);
        step.receiveShadow = true;
        step.castShadow = true;
        altarGroup.add(step);
      }
    }
    // East (+X) and West (-X)
    for (const dir of [-1, 1]) {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.2, stepW[s]),
          s % 2 === 0 ? stoneMat : stoneLight,
        );
        step.position.set(cx + dir * stepDist[s], stepY[s], cz);
        step.receiveShadow = true;
        step.castShadow = true;
        altarGroup.add(step);
      }
    }

    // "SPAWN" label
    const label = this.createTextSign('ALTAR OF REBIRTH', 0x55ccff);
    label.position.set(cx, 4.8, cz);
    altarGroup.add(label);

    // Place at end of south path
    altarGroup.scale.set(0.65, 0.65, 0.65);
    altarGroup.position.set(0, 0, 15);
    this.group.add(altarGroup);
  }

  private buildDecorations() {
    // Lanterns — strategically placed around the hub
    const lanternPositions = [
      // Fountain plaza corners (4 symmetrical)
      [5.5, 5.5], [-5.5, 5.5], [5.5, -5.5], [-5.5, -5.5],
      // Path to forest portal
      [1.5, -14], [-1.5, -14], [1.5, -21], [-1.5, -21],
      // Near shop entrance
      [-10, -2], [-14, -2],
      // Near PvP arena entrance
      [12, -6], [12, -10],
      // Near NPCs — Elder Mika, Scout Aino
      [7, 3], [5, -16],
    ];
    for (const [x, z] of lanternPositions) {
      this.createLantern(x, z);
    }

    // Banners on poles near plaza
    this.createBanner(-5, -5, 0xff3333);
    this.createBanner(5, -5, 0x3333ff);
    this.createBanner(-5, 5, 0x33ff33);
    this.createBanner(5, 5, 0xffcc00);
  }

  private createFlowerBush(x: number, z: number, color: number) {
    const bushGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 6, 5);
    const bushMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const bush = new THREE.Mesh(bushGeo, bushMat);
    bush.position.set(x, 0.2, z);
    bush.scale.y = 0.6;
    this.group.add(bush);
  }

  private createLantern(x: number, z: number) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    );
    pole.position.set(x, 1.5, z);
    this.group.add(pole);

    const lampGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 3.1, z);
    this.group.add(lamp);

    const light = new THREE.PointLight(0xffaa44, 0.5, 6);
    light.position.set(x, 3.1, z);
    this.group.add(light);
  }

  private createBanner(x: number, z: number, color: number) {
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0x666666 }),
    );
    pole.position.set(x, 2.5, z);
    this.group.add(pole);

    // Banner cloth
    const bannerGeo = new THREE.PlaneGeometry(0.8, 1.5);
    const bannerMat = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(x + 0.5, 4, z);
    this.group.add(banner);
  }

  private buildLighting() {
    // Soft ambient base
    const ambient = new THREE.AmbientLight(0x3a4a5a, 0.3);
    this.group.add(ambient);

    // Main sun - warm golden hour light
    const sun = new THREE.DirectionalLight(0xffecd2, 1.5);
    sun.position.set(25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2; // softer shadow edges with PCFSoft
    this.group.add(sun);
    this.group.add(sun.target); // ensure target is in scene

    // Fill light - cool blue from opposite side (simulates sky bounce)
    const fill = new THREE.DirectionalLight(0x8ab4f8, 0.35);
    fill.position.set(-20, 25, -15);
    this.group.add(fill);

    // Hemisphere for natural sky/ground color bleed
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.5);
    this.group.add(hemi);
  }

  private createTextSign(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.strokeText(text, 256, 80);
    ctx.fillStyle = hex;
    ctx.fillText(text, 256, 80);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  // Called each frame for animations
  update(time: number, playerPos?: THREE.Vector3) {
    // ── Fissure gate animations ─────────────────────────────────────
    for (const fd of this.fissureData) {
      // Proximity calculation
      let proximity = 0;
      if (playerPos) {
        const dist = playerPos.distanceTo(fd.pos);
        if (dist < 8) {
          const t = 1 - dist / 8;
          proximity = t * t; // quadratic easing
        }
      }

      // Shader uniforms
      fd.shaderMat.uniforms.uTime.value = time;
      fd.shaderMat.uniforms.uProximity.value = proximity;
      fd.corruptShaderMat.uniforms.uTime.value = time;
      fd.corruptShaderMat.uniforms.uProximity.value = proximity;

      // Ember animation — cyclic rise, fade in/out, flicker
      for (const ember of fd.embers) {
        const d = ember.userData;
        // Skip bonus embers if not close enough
        if (d.bonusEmber && proximity < 0.3) {
          (ember.material as THREE.MeshBasicMaterial).opacity = 0;
          continue;
        }
        const cycle = ((time * d.speed + d.phase) % 4.0) / 4.0;
        const y = cycle * d.maxHeight;
        const fadeIn = smoothstepJS(0, 0.15, cycle);
        const fadeOut = smoothstepJS(1.0, 0.7, cycle);
        const flicker = 0.7 + 0.3 * Math.sin(time * 15 + d.phase * 10);

        ember.position.x = fd.pos.x + d.xOffset + Math.sin(time * 2 + d.phase) * 0.15;
        ember.position.y = y;
        ember.position.z = fd.pos.z + d.zAlong + Math.cos(time * 1.5 + d.phase) * 0.1;

        const mat = ember.material as THREE.MeshBasicMaterial;
        mat.opacity = fadeIn * fadeOut * flicker * (0.6 + proximity * 0.4);
      }

      // Edge stone emissive pulse
      const basePulse = 0.05 + Math.sin(time * 2.5) * 0.04 + Math.sin(time * 4.1) * 0.02;
      const pulse = basePulse + proximity * 0.3;
      for (const stone of fd.edgeStones) {
        (stone.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      }

      // Light intensity scales with proximity
      fd.mainLight.intensity = 3.0 + proximity * 5.0;
      fd.groundLight.intensity = 1.5 + proximity * 3.0;
    }

    // ── Tree of Life animations ──────────────────────────────────────
    // Fireflies - gentle floating movement
    for (let i = 0; i < 20; i++) {
      const firefly = this.group.getObjectByName(`tree-firefly-${i}`);
      if (firefly) {
        const phase = i * 1.37;
        firefly.position.x = firefly.userData.baseX + Math.sin(time * 0.7 + phase) * 1.5;
        firefly.position.y = firefly.userData.baseY + Math.cos(time * 0.5 + phase) * 0.8;
        firefly.position.z = firefly.userData.baseZ + Math.sin(time * 0.6 + phase * 0.7) * 1.5;
        const mat = (firefly as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.3 + Math.sin(time * 2.5 + phase) * 0.4;
      }
    }

    // Water pool surface
    const treePool = this.group.getObjectByName('tree-water-pool');
    if (treePool) {
      treePool.position.y = 0.18 + Math.sin(time * 1.5) * 0.015;
      treePool.rotation.y = time * 0.05;
    }

    // Waterfall wobble
    const waterfall = this.group.getObjectByName('tree-waterfall');
    if (waterfall) {
      waterfall.scale.x = 1 + Math.sin(time * 4) * 0.15;
      waterfall.scale.z = 1 + Math.cos(time * 3.5) * 0.1;
    }

    // Mini streams
    for (let i = 0; i < 3; i++) {
      const treeStream = this.group.getObjectByName(`tree-stream-${i}`);
      if (treeStream) {
        treeStream.scale.x = 1 + Math.sin(time * 3 + i * 2) * 0.2;
      }
    }

    // Ripples at waterfall base - expand and fade
    for (let i = 0; i < 3; i++) {
      const ripple = this.group.getObjectByName(`tree-ripple-${i}`);
      if (ripple) {
        const cycle = (time * 1.0 + i * 0.7) % 2.0;
        const s = 1 + cycle * 2.0;
        ripple.scale.set(s, s, s);
        const mat = (ripple as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.3 * Math.max(0, 1 - cycle / 2.0);
      }
    }

    // Rune glow pulse
    for (let i = 0; i < 8; i++) {
      const rune = this.group.getObjectByName(`tree-rune-${i}`);
      if (rune) {
        const mat = (rune as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.4 + Math.sin(time * 2 + i * 0.8) * 0.4;
      }
    }

    // Root tip glow pulse
    for (let i = 0; i < 8; i += 2) {
      const tip = this.group.getObjectByName(`tree-root-glow-${i}`);
      if (tip) {
        const mat = (tip as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + Math.sin(time * 1.8 + i * 0.8) * 0.3;
        const s = 1 + Math.sin(time * 2 + i) * 0.2;
        tip.scale.set(s, s, s);
      }
    }

    // Leaf clusters gentle sway
    for (let i = 0; i < 12; i++) {
      const leaf = this.group.getObjectByName(`tree-leaf-${i}`);
      if (leaf) {
        leaf.rotation.z = Math.sin(time * 0.4 + i * 0.5) * 0.03;
        leaf.rotation.x = Math.cos(time * 0.35 + i * 0.7) * 0.02;
      }
    }

    // Gernal's beard sway
    const beardTip = this.group.getObjectByName('gernal-beard-tip');
    if (beardTip) {
      beardTip.rotation.z = Math.sin(time * 1.2) * 0.08;
      beardTip.rotation.x = Math.cos(time * 0.9) * 0.05;
    }

    // Altar crystals
    this.group.traverse(child => {
      if (child.name === 'altar-crystal') {
        child.rotation.y += 0.02;
        child.rotation.x = Math.sin(time * 1.5) * 0.2;
        const s = 1 + Math.sin(time * 3) * 0.15;
        child.scale.set(s, s, s);
      }
    });

    // Spawn orb
    const spawnOrb = this.group.getObjectByName('spawn-orb');
    const spawnOrbInner = this.group.getObjectByName('spawn-orb-inner');
    if (spawnOrb) {
      spawnOrb.position.y = 3.0 + Math.sin(time * 1.2) * 0.3;
      spawnOrb.rotation.y = time * 0.8;
      spawnOrb.rotation.x = Math.sin(time * 0.5) * 0.3;
    }
    if (spawnOrbInner) {
      spawnOrbInner.position.y = 3.0 + Math.sin(time * 1.2) * 0.3;
      spawnOrbInner.rotation.y = -time * 1.2;
      const pulse = 0.8 + Math.sin(time * 4) * 0.2;
      spawnOrbInner.scale.set(pulse, pulse, pulse);
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
  }
}
