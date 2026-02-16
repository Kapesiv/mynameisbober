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
  public cavePosition = new THREE.Vector3(0, 0, -25);
  public npcPositions: { name: string; position: THREE.Vector3; dialog: string[] }[] = [];

  // Cave entrance data (animations handled by named objects)

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'hub-world';

    this.buildGround();
    this.buildFountainPlaza();
    this.buildShop();
    this.buildPvPArena();
    this.buildCaveEntrance();
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

    // ── Cobblestone paths — continuous vertex-displaced surface ────────
    // Hash function for deterministic per-stone variation
    const hashStone = (a: number, b: number) => {
      const n = a * 137 + b * 251;
      return ((n * 9301 + 49297) % 233280) / 233280.0;
    };

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
      const pathAngle = Math.atan2(dx, dz);

      // High-subdivision plane — each vertex can be colored & displaced
      const segsW = Math.max(12, Math.floor(p.width * 8));
      const segsL = Math.max(30, Math.floor(len * 4));
      const pathGeo = new THREE.PlaneGeometry(p.width, len, segsW, segsL);

      const pos = pathGeo.attributes.position;
      const vtxCount = pos.count;
      const colors = new Float32Array(vtxCount * 3);

      for (let i = 0; i < vtxCount; i++) {
        const lx = pos.getX(i); // local across path
        const ly = pos.getY(i); // local along path

        // ── Cobblestone grid ──
        const stoneScale = 3.2;
        const gx = lx * stoneScale;
        const gy = ly * stoneScale;
        const row = Math.floor(gy);
        const adjX = gx + (row % 2) * 0.5; // offset every other row
        const cellX = adjX - Math.floor(adjX) - 0.5;
        const cellY = gy - Math.floor(gy) - 0.5;
        const distToCenter = Math.sqrt(cellX * cellX + cellY * cellY);

        // Stone is raised, gap between stones is low
        const stoneShape = smoothstepJS(0.48, 0.32, distToCenter);
        const h = stoneShape * 0.06;

        // Per-stone random height offset
        const stoneID_x = Math.floor(adjX);
        const stoneID_y = Math.floor(gy);
        const stoneRand = hashStone(stoneID_x, stoneID_y);
        const heightVariation = stoneRand * 0.025;

        pos.setZ(i, h + heightVariation);

        // ── Color ──
        // Per-stone color from hash
        const colorVar = hashStone(stoneID_x + 50, stoneID_y + 80);
        const colorVar2 = hashStone(stoneID_x + 120, stoneID_y + 30);

        // Base stone RGB
        let r = 0.40 + colorVar * 0.18;
        let g2 = 0.33 + colorVar * 0.14;
        let b = 0.22 + colorVar2 * 0.10;

        // Darken grout lines
        const groutDarken = stoneShape * 0.4 + 0.6;
        r *= groutDarken;
        g2 *= groutDarken;
        b *= groutDarken;

        // Slight moss in some grout
        if (stoneShape < 0.3 && colorVar2 > 0.6) {
          g2 += 0.06;
          r -= 0.03;
        }

        // Edge fade — blend to grass at path borders
        const edgeDist = Math.abs(lx) / (p.width / 2);
        if (edgeDist > 0.75) {
          const fade = (edgeDist - 0.75) / 0.25;
          const f = fade * fade; // smooth
          r = r * (1 - f) + 0.22 * f;
          g2 = g2 * (1 - f) + 0.40 * f;
          b = b * (1 - f) + 0.12 * f;
          pos.setZ(i, h * (1 - f)); // flatten at edges
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g2;
        colors[i * 3 + 2] = b;
      }

      pos.needsUpdate = true;
      pathGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pathGeo.computeVertexNormals();

      const pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.02,
      }));
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.position.set(
        (p.from[0] + p.to[0]) / 2, 0.03,
        (p.from[1] + p.to[1]) / 2,
      );
      pathMesh.rotation.z = -pathAngle;
      pathMesh.receiveShadow = true;
      pathMesh.castShadow = true;
      this.group.add(pathMesh);
    }

    // ── Central plaza — circular cobblestone surface ────────────────────
    const plazaGeo = new THREE.CircleGeometry(8, 64, 0, Math.PI * 2);
    // Increase subdivisions by using a custom plane approach
    const plazaDetailGeo = new THREE.PlaneGeometry(17, 17, 60, 60);
    const pPos = plazaDetailGeo.attributes.position;
    const pCount = pPos.count;
    const pColors = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      const px = pPos.getX(i);
      const py = pPos.getY(i);
      const dist = Math.sqrt(px * px + py * py);

      // Circular mask — outside radius 8 flatten to nothing
      const circleMask = smoothstepJS(8.2, 7.5, dist);

      if (circleMask < 0.01) {
        // Outside plaza — transparent/invisible, push down
        pPos.setZ(i, -0.05);
        pColors[i * 3] = 0.22;
        pColors[i * 3 + 1] = 0.40;
        pColors[i * 3 + 2] = 0.12;
        continue;
      }

      // Concentric ring cobblestone pattern
      const ringScale = 2.8;
      const angle = Math.atan2(py, px);
      const ringCoord = dist * ringScale;
      const angularCoord = angle * dist * 0.8;

      const ringRow = Math.floor(ringCoord);
      const adjAng = angularCoord + (ringRow % 2) * 0.5;
      const cellR = ringCoord - ringRow - 0.5;
      const cellA = adjAng - Math.floor(adjAng) - 0.5;
      const cellDist = Math.sqrt(cellR * cellR + cellA * cellA);

      const stoneShape = smoothstepJS(0.48, 0.3, cellDist);
      const stoneID = Math.floor(adjAng) * 137 + ringRow * 251;
      const stoneRand = hashStone(Math.floor(adjAng), ringRow);

      const h = (stoneShape * 0.05 + stoneRand * 0.02) * circleMask;
      pPos.setZ(i, h);

      const cVar = hashStone(Math.floor(adjAng) + 50, ringRow + 80);
      const cVar2 = hashStone(Math.floor(adjAng) + 120, ringRow + 30);

      let r = 0.42 + cVar * 0.16;
      let g2 = 0.35 + cVar * 0.12;
      let b = 0.24 + cVar2 * 0.08;

      const grout = stoneShape * 0.35 + 0.65;
      r *= grout;
      g2 *= grout;
      b *= grout;

      // Center area slightly lighter (worn)
      if (dist < 4) {
        const centerBoost = (1 - dist / 4) * 0.08;
        r += centerBoost;
        g2 += centerBoost;
        b += centerBoost;
      }

      // Edge blend to grass
      const edgeFade = smoothstepJS(7.5, 8.0, dist);
      r = r * (1 - edgeFade) + 0.22 * edgeFade;
      g2 = g2 * (1 - edgeFade) + 0.40 * edgeFade;
      b = b * (1 - edgeFade) + 0.12 * edgeFade;

      pColors[i * 3] = r * circleMask + 0.22 * (1 - circleMask);
      pColors[i * 3 + 1] = g2 * circleMask + 0.40 * (1 - circleMask);
      pColors[i * 3 + 2] = b * circleMask + 0.12 * (1 - circleMask);
    }

    pPos.needsUpdate = true;
    plazaDetailGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    plazaDetailGeo.computeVertexNormals();

    const plazaMesh = new THREE.Mesh(plazaDetailGeo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    }));
    plazaMesh.rotation.x = -Math.PI / 2;
    plazaMesh.position.y = 0.035;
    plazaMesh.receiveShadow = true;
    this.group.add(plazaMesh);

    // Stone border ring around plaza
    const borderRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.8, 0.18, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.85 }),
    );
    borderRing.rotation.x = -Math.PI / 2;
    borderRing.position.y = 0.06;
    this.group.add(borderRing);

    // Inner ring around the tree
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.12, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.8 }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.07;
    this.group.add(innerRing);
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
    const shop = new THREE.Group();
    shop.name = 'shop-building';

    // --- Materials ---
    // Realistic wood: dark oak logs, lighter planks, weathered trim
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3e2410, roughness: 0.95, metalness: 0 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9, metalness: 0 });
    const plankLightMat = new THREE.MeshStandardMaterial({ color: 0x8b6842, roughness: 0.88, metalness: 0 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.92, metalness: 0.05 });
    const stoneBaseMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.92, side: THREE.DoubleSide });
    const roofEdgeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aacc, roughness: 0.05, metalness: 0.0,
      transmission: 0.85, thickness: 0.1, transparent: true, opacity: 0.6,
    });
    const leadMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.4 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });

    const W = 7, D = 5, wallH = 3.5;

    // ============================
    // STONE FOUNDATION
    // ============================
    const foundH = 0.5;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.3, foundH, D + 0.3), stoneBaseMat,
    );
    foundation.position.set(0, foundH / 2, 0);
    foundation.receiveShadow = true;
    foundation.castShadow = true;
    shop.add(foundation);

    // Foundation stone detail
    for (let i = 0; i < 12; i++) {
      const stoneW = 0.4 + Math.random() * 0.6;
      const stoneH = 0.15 + Math.random() * 0.15;
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(stoneW, stoneH, 0.15), stoneMat,
      );
      const angle = (i / 12) * Math.PI * 2;
      const onFront = i < 4;
      const onBack = i >= 4 && i < 8;
      if (onFront) {
        stone.position.set(-2.5 + i * 1.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.2, D / 2 + 0.08);
      } else if (onBack) {
        stone.position.set(-2.5 + (i - 4) * 1.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.2, -D / 2 - 0.08);
      } else {
        stone.position.set(
          (i < 10 ? -1 : 1) * (W / 2 + 0.08),
          0.2 + Math.random() * 0.2,
          -1.5 + (i % 2) * 2 + Math.random() * 0.5,
        );
        stone.rotation.y = Math.PI / 2;
      }
      shop.add(stone);
    }

    // ============================
    // LOG WALLS — horizontal stacked logs
    // ============================
    const logRows = 9;
    const logRadius = 0.18;

    // Back wall logs
    for (let row = 0; row < logRows; row++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(logRadius, logRadius * 1.05, W - 0.2, 8),
        logMat,
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(0, foundH + logRadius + row * logRadius * 1.85, -D / 2 + 0.1);
      log.castShadow = true;
      shop.add(log);
    }

    // Side walls (with window gap on left side)
    for (const side of [-1, 1]) {
      for (let row = 0; row < logRows; row++) {
        const y = foundH + logRadius + row * logRadius * 1.85;
        // Window gap on right side (player-facing) rows 3-6
        if (side === 1 && row >= 3 && row <= 6) {
          // Short log sections on either side of window
          for (const wSide of [-1, 1]) {
            const shortLog = new THREE.Mesh(
              new THREE.CylinderGeometry(logRadius, logRadius * 1.05, D * 0.25, 8),
              logMat,
            );
            shortLog.rotation.x = Math.PI / 2;
            shortLog.position.set(side * (W / 2 - 0.1), y, wSide * (D / 2 - D * 0.12));
            shortLog.castShadow = true;
            shop.add(shortLog);
          }
        } else {
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(logRadius, logRadius * 1.05, D - 0.2, 8),
            logMat,
          );
          log.rotation.x = Math.PI / 2;
          log.position.set(side * (W / 2 - 0.1), y, 0);
          log.castShadow = true;
          shop.add(log);
        }
      }
    }

    // Front wall — two sections with door gap in the middle
    const doorW = 1.8;
    for (let row = 0; row < logRows; row++) {
      const y = foundH + logRadius + row * logRadius * 1.85;
      // Door gap for rows 0-7
      if (row < 8) {
        for (const side of [-1, 1]) {
          const sectionW = (W - doorW) / 2 - 0.2;
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(logRadius, logRadius * 1.05, sectionW, 8),
            logMat,
          );
          log.rotation.z = Math.PI / 2;
          log.position.set(side * (doorW / 2 + sectionW / 2 + 0.1), y, D / 2 - 0.1);
          log.castShadow = true;
          shop.add(log);
        }
      } else {
        // Top row spans full width (above door lintel)
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(logRadius, logRadius * 1.05, W - 0.2, 8),
          logMat,
        );
        log.rotation.z = Math.PI / 2;
        log.position.set(0, y, D / 2 - 0.1);
        log.castShadow = true;
        shop.add(log);
      }
    }

    // ============================
    // DOOR — heavy wooden plank door
    // ============================
    const doorH = 2.8;
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 0.2, doorH + 0.1, 0.15), plankMat,
    );
    doorFrame.position.set(0, foundH + doorH / 2, D / 2 - 0.05);
    shop.add(doorFrame);

    // Door planks (vertical boards)
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(doorW / 5 - 0.02, doorH - 0.15, 0.08), plankLightMat,
      );
      plank.position.set(-doorW / 2 + doorW / 10 + i * doorW / 5, foundH + doorH / 2, D / 2 + 0.02);
      plank.castShadow = true;
      shop.add(plank);
    }

    // Door cross braces (Z-pattern)
    const braceMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.92 });
    for (const bY of [foundH + 0.8, foundH + doorH - 0.5]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(doorW - 0.2, 0.12, 0.04), braceMat,
      );
      brace.position.set(0, bY, D / 2 + 0.07);
      shop.add(brace);
    }
    // Diagonal
    const diagBrace = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, doorH * 0.7, 0.04), braceMat,
    );
    diagBrace.position.set(0, foundH + doorH / 2, D / 2 + 0.07);
    diagBrace.rotation.z = 0.45;
    shop.add(diagBrace);

    // Door handle (iron ring)
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.015, 6, 10),
      metalMat,
    );
    handle.position.set(0.4, foundH + doorH / 2, D / 2 + 0.1);
    shop.add(handle);

    // Iron hinges
    for (const hY of [foundH + 0.6, foundH + doorH - 0.3]) {
      const hinge = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.06, 0.02), metalMat,
      );
      hinge.position.set(-doorW / 2 + 0.2, hY, D / 2 + 0.08);
      shop.add(hinge);
    }

    // ============================
    // WINDOWS — leaded glass panes
    // ============================
    // Front windows (flanking the door)
    for (const side of [-1, 1]) {
      const winX = side * 2.4;
      const winY = foundH + 2.0;
      const winW = 1.2, winH = 1.0;

      // Wooden frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(winW + 0.15, winH + 0.15, 0.12), plankMat,
      );
      frame.position.set(winX, winY, D / 2);
      shop.add(frame);

      // Glass pane
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(winW - 0.05, winH - 0.05), glassMat,
      );
      glass.position.set(winX, winY, D / 2 + 0.04);
      shop.add(glass);

      // Lead dividers (cross pattern)
      const vDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, winH - 0.05, 0.02), leadMat,
      );
      vDiv.position.set(winX, winY, D / 2 + 0.06);
      shop.add(vDiv);
      const hDiv = new THREE.Mesh(
        new THREE.BoxGeometry(winW - 0.05, 0.03, 0.02), leadMat,
      );
      hDiv.position.set(winX, winY, D / 2 + 0.06);
      shop.add(hDiv);

      // Windowsill
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(winW + 0.3, 0.06, 0.2), plankLightMat,
      );
      sill.position.set(winX, winY - winH / 2 - 0.05, D / 2 + 0.1);
      shop.add(sill);
    }

    // Side window (right wall)
    {
      const winY = foundH + 2.0;
      const winW = 1.4, winH = 1.1;

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, winH + 0.15, winW + 0.15), plankMat,
      );
      frame.position.set(W / 2, winY, 0);
      shop.add(frame);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(winH - 0.05, winW - 0.05), glassMat,
      );
      glass.position.set(W / 2 + 0.04, winY, 0);
      glass.rotation.y = Math.PI / 2;
      shop.add(glass);

      // Lead cross
      const vDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, winH - 0.05, 0.03), leadMat,
      );
      vDiv.position.set(W / 2 + 0.06, winY, 0);
      shop.add(vDiv);
      const hDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.03, winW - 0.05), leadMat,
      );
      hDiv.position.set(W / 2 + 0.06, winY, 0);
      shop.add(hDiv);

      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.06, winW + 0.3), plankLightMat,
      );
      sill.position.set(W / 2 + 0.1, winY - winH / 2 - 0.05, 0);
      shop.add(sill);
    }

    // ============================
    // ROOF — steep gabled plank roof
    // ============================
    const roofOverhang = 0.8;
    const roofPeakH = 2.5;
    const roofBaseY = foundH + wallH;

    // Roof planes (two sides of the gable)
    for (const side of [-1, 1]) {
      const roofW = Math.sqrt((W / 2 + roofOverhang) ** 2 + roofPeakH ** 2);
      const roofAngle = Math.atan2(roofPeakH, W / 2 + roofOverhang);
      const roofGeo = new THREE.PlaneGeometry(D + roofOverhang * 2, roofW, 1, 1);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(
        side * (W / 4 + roofOverhang / 2) * Math.cos(roofAngle),
        roofBaseY + roofPeakH / 2 + side * 0.01,
        0,
      );
      roof.rotation.z = side * (Math.PI / 2 - roofAngle);
      roof.rotation.y = Math.PI / 2;
      roof.castShadow = true;
      roof.receiveShadow = true;
      shop.add(roof);
    }

    // Ridge beam along the top
    const ridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, D + roofOverhang * 2, 6), roofEdgeMat,
    );
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, roofBaseY + roofPeakH, 0);
    shop.add(ridge);

    // Gable triangles (front and back)
    for (const fz of [D / 2, -D / 2]) {
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-W / 2 - 0.1, 0);
      gableShape.lineTo(0, roofPeakH);
      gableShape.lineTo(W / 2 + 0.1, 0);
      gableShape.lineTo(-W / 2 - 0.1, 0);
      const gableGeo = new THREE.ShapeGeometry(gableShape);
      const gable = new THREE.Mesh(gableGeo, plankMat);
      gable.position.set(0, roofBaseY, fz + (fz > 0 ? 0.02 : -0.02));
      if (fz < 0) gable.rotation.y = Math.PI;
      gable.castShadow = true;
      shop.add(gable);
    }

    // Fascia boards along roof edges
    for (const side of [-1, 1]) {
      const fasciaLen = Math.sqrt((W / 2 + roofOverhang) ** 2 + roofPeakH ** 2);
      const fasciaAngle = Math.atan2(roofPeakH, W / 2 + roofOverhang);
      for (const fz of [D / 2 + roofOverhang, -(D / 2 + roofOverhang)]) {
        const fascia = new THREE.Mesh(
          new THREE.BoxGeometry(fasciaLen, 0.12, 0.06), roofEdgeMat,
        );
        fascia.position.set(
          side * (W / 4 + roofOverhang / 4),
          roofBaseY + roofPeakH / 2,
          fz,
        );
        fascia.rotation.z = side * (Math.PI / 2 - fasciaAngle);
        shop.add(fascia);
      }
    }

    // ============================
    // INTERIOR FLOOR — plank floor visible through door
    // ============================
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.4, D - 0.4), plankLightMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, foundH + 0.02, 0);
    floor.receiveShadow = true;
    shop.add(floor);

    // ============================
    // FRONT COUNTER (outside, in front of door)
    // ============================
    const counterW = 4;
    const counterH = 1.1;
    const counterD = 0.8;
    const counterZ = D / 2 + 1.2;

    // Counter top
    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(counterW, 0.1, counterD), plankLightMat,
    );
    counterTop.position.set(0, counterH, counterZ);
    counterTop.castShadow = true;
    shop.add(counterTop);

    // Counter front board
    const counterFront = new THREE.Mesh(
      new THREE.BoxGeometry(counterW, counterH - 0.1, 0.08), plankMat,
    );
    counterFront.position.set(0, (counterH - 0.1) / 2 + 0.05, counterZ + counterD / 2);
    shop.add(counterFront);

    // Counter legs
    for (const lx of [-counterW / 2 + 0.15, counterW / 2 - 0.15]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, counterH - 0.1, 0.1), plankMat,
      );
      leg.position.set(lx, (counterH - 0.1) / 2 + 0.05, counterZ);
      shop.add(leg);
    }

    // ============================
    // MERCHANDISE on counter
    // ============================
    const potionColors = [0xff3333, 0x3366ff, 0x33dd33, 0xffaa00, 0xdd33dd];
    for (let i = 0; i < 5; i++) {
      // Bottle body
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8),
        new THREE.MeshPhysicalMaterial({
          color: potionColors[i], transmission: 0.6, roughness: 0.05,
          thickness: 0.5, transparent: true, opacity: 0.75,
        }),
      );
      bottle.position.set(-1.6 + i * 0.8, counterH + 0.15, counterZ);
      shop.add(bottle);

      // Bottle neck
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 0.06, 6),
        new THREE.MeshPhysicalMaterial({
          color: potionColors[i], transmission: 0.5, roughness: 0.05,
          transparent: true, opacity: 0.7,
        }),
      );
      neck.position.set(-1.6 + i * 0.8, counterH + 0.28, counterZ);
      shop.add(neck);

      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.03, 0.04, 4),
        new THREE.MeshStandardMaterial({ color: 0xaa8855, roughness: 0.85 }),
      );
      cork.position.set(-1.6 + i * 0.8, counterH + 0.33, counterZ);
      shop.add(cork);
    }

    // ============================
    // BARRELS & CRATES outside
    // ============================
    const barrelPositions: number[][] = [[-3.0, D / 2 + 0.5], [3.0, D / 2 + 0.8], [-3.2, D / 2 + 1.8]];
    for (const [bx, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.38, 0.9, 10), plankMat,
      );
      barrel.position.set(bx, 0.45, bz);
      barrel.castShadow = true;
      shop.add(barrel);

      for (const ry of [0.15, 0.45, 0.75]) {
        const hoop = new THREE.Mesh(
          new THREE.TorusGeometry(0.41, 0.015, 6, 12), metalMat,
        );
        hoop.position.set(bx, ry, bz);
        hoop.rotation.x = Math.PI / 2;
        shop.add(hoop);
      }
    }

    const crateData: number[][] = [[3.2, 0.3, D / 2 + 1.6, 0.6], [3.5, 0.85, D / 2 + 1.4, 0.45]];
    for (const [cx, cy, cz, s] of crateData) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), plankMat);
      crate.position.set(cx, cy, cz);
      crate.rotation.y = Math.random() * 0.4;
      crate.castShadow = true;
      shop.add(crate);
    }

    // ============================
    // HANGING SIGN — "GERNAL'S SHOP"
    // ============================
    // Wooden bracket arm
    const signArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), metalMat,
    );
    signArm.rotation.z = Math.PI / 2;
    signArm.position.set(0.75, roofBaseY - 0.3, D / 2 + 0.15);
    shop.add(signArm);

    // Sign board
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.7, 0.06), plankMat,
    );
    signBoard.position.set(0.75, roofBaseY - 0.8, D / 2 + 0.15);
    shop.add(signBoard);

    const signText = this.createTextSign("GERNAL'S SHOP", 0xFFD700);
    signText.position.set(0.75, roofBaseY - 0.8, D / 2 + 0.22);
    shop.add(signText);

    // Sign chains
    for (const sx of [-0.3, 0.3]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), metalMat,
      );
      chain.position.set(0.75 + sx, roofBaseY - 0.55, D / 2 + 0.15);
      shop.add(chain);
    }

    // ============================
    // CHIMNEY
    // ============================
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.5, 0.7), stoneMat,
    );
    chimney.position.set(-W / 2 + 0.8, roofBaseY + roofPeakH - 0.2, -D / 2 + 0.8);
    chimney.castShadow = true;
    shop.add(chimney);

    // Chimney cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.1, 0.9), stoneMat,
    );
    cap.position.set(-W / 2 + 0.8, roofBaseY + roofPeakH + 0.55, -D / 2 + 0.8);
    shop.add(cap);

    // ============================
    // WARM INTERIOR GLOW (visible through windows/door)
    // ============================
    const interiorLight = new THREE.PointLight(0xffaa55, 1.0, 8);
    interiorLight.position.set(0, foundH + 2.5, 0);
    shop.add(interiorLight);

    shop.position.copy(pos);
    this.group.add(shop);
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

  private buildCaveEntrance() {
    const cp = this.cavePosition.clone();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.75, metalness: 0.05 });
    const boneMatDark = new THREE.MeshStandardMaterial({ color: 0xb0a480, roughness: 0.8, metalness: 0.05 });

    // ── a) Dragon skull — the entrance itself ─────────────────────────
    // Upper jaw / cranium — big elongated dome facing the player
    const craniGeo = new THREE.SphereGeometry(3.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const cranium = new THREE.Mesh(craniGeo, boneMat);
    cranium.position.set(cp.x, 5.5, cp.z - 1.5);
    cranium.scale.set(1, 0.7, 1.8); // elongated snout shape
    cranium.castShadow = true;
    this.group.add(cranium);

    // Snout ridge (brow)
    const browGeo = new THREE.BoxGeometry(4, 0.5, 4, 4, 2, 4);
    const browAtt = browGeo.attributes.position;
    for (let i = 0; i < browAtt.count; i++) {
      browAtt.setX(i, browAtt.getX(i) + (Math.random() - 0.5) * 0.15);
      browAtt.setY(i, browAtt.getY(i) + (Math.random() - 0.5) * 0.1);
    }
    browAtt.needsUpdate = true;
    browGeo.computeVertexNormals();
    const brow = new THREE.Mesh(browGeo, boneMatDark);
    brow.position.set(cp.x, 5.8, cp.z - 0.5);
    brow.castShadow = true;
    this.group.add(brow);

    // Lower jaw — forms the ground-level threshold
    const jawGeo = new THREE.BoxGeometry(4.5, 0.6, 4, 5, 2, 4);
    const jawAtt = jawGeo.attributes.position;
    for (let i = 0; i < jawAtt.count; i++) {
      jawAtt.setX(i, jawAtt.getX(i) + (Math.random() - 0.5) * 0.1);
      jawAtt.setZ(i, jawAtt.getZ(i) + (Math.random() - 0.5) * 0.1);
    }
    jawAtt.needsUpdate = true;
    jawGeo.computeVertexNormals();
    const jaw = new THREE.Mesh(jawGeo, boneMatDark);
    jaw.position.set(cp.x, 0.3, cp.z - 0.5);
    jaw.castShadow = true;
    this.group.add(jaw);

    // Teeth — upper fangs hanging down
    for (let i = 0; i < 8; i++) {
      const side = (i % 2 === 0 ? -1 : 1);
      const toothX = cp.x + side * (1.6 + (i % 4) * 0.15);
      const toothH = 0.4 + Math.random() * 0.6;
      const isFang = i < 2; // first two are big fangs
      const fangH = isFang ? 1.2 : toothH;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(isFang ? 0.15 : 0.08, fangH, 5),
        boneMat,
      );
      tooth.position.set(toothX, 4.2 - fangH / 2 + (i % 4) * 0.12, cp.z + 0.8 - (i % 4) * 0.4);
      tooth.rotation.z = Math.PI; // point downward
      tooth.castShadow = true;
      this.group.add(tooth);
    }

    // Teeth — lower fangs pointing up
    for (let i = 0; i < 6; i++) {
      const side = (i % 2 === 0 ? -1 : 1);
      const toothX = cp.x + side * (1.5 + (i % 3) * 0.2);
      const toothH = 0.3 + Math.random() * 0.4;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, toothH, 5),
        boneMat,
      );
      tooth.position.set(toothX, 0.6 + toothH / 2, cp.z + 0.6 - (i % 3) * 0.5);
      tooth.castShadow = true;
      this.group.add(tooth);
    }

    // Eye sockets — dark hollow spheres
    for (const side of [-1, 1]) {
      // Socket cavity
      const socketGeo = new THREE.SphereGeometry(0.55, 8, 8);
      const socket = new THREE.Mesh(socketGeo, new THREE.MeshBasicMaterial({ color: 0x050505 }));
      socket.position.set(cp.x + side * 1.2, 5.6, cp.z + 1);
      socket.scale.set(1, 0.8, 0.6);
      this.group.add(socket);

      // Ghostly eye glow
      const eyeGlow = new THREE.PointLight(0x22ff44, 1.0, 5);
      eyeGlow.position.set(cp.x + side * 1.2, 5.6, cp.z + 1.2);
      eyeGlow.name = `dragon-eye-${side === -1 ? 'L' : 'R'}`;
      this.group.add(eyeGlow);

      // Tiny glowing orb inside socket
      const eyeOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.7 }),
      );
      eyeOrb.position.set(cp.x + side * 1.2, 5.6, cp.z + 1.05);
      eyeOrb.name = `dragon-eye-orb-${side === -1 ? 'L' : 'R'}`;
      this.group.add(eyeOrb);
    }

    // Horns — two large curved horns sweeping back
    for (const side of [-1, 1]) {
      const hornSegs = 6;
      for (let s = 0; s < hornSegs; s++) {
        const t = s / hornSegs;
        const segLen = 1.0 - t * 0.3;
        const segRadius = 0.25 - t * 0.18;
        const segGeo = new THREE.CylinderGeometry(segRadius * 0.7, segRadius, segLen, 6);
        const seg = new THREE.Mesh(segGeo, boneMatDark);
        // Curve outward and backward
        const hx = cp.x + side * (1.8 + t * 2.5);
        const hy = 6.5 + t * 2.0 - t * t * 1.5;
        const hz = cp.z + 0.5 - t * 2.5;
        seg.position.set(hx, hy, hz);
        seg.rotation.z = side * (0.3 + t * 0.5);
        seg.rotation.x = -0.3 - t * 0.2;
        seg.castShadow = true;
        this.group.add(seg);
      }
    }

    // Dark interior (the maw)
    const interiorGeo = new THREE.PlaneGeometry(3.5, 4);
    const interior = new THREE.Mesh(interiorGeo, new THREE.MeshBasicMaterial({ color: 0x020304 }));
    interior.position.set(cp.x, 2.3, cp.z - 1);
    this.group.add(interior);

    // ── b) Spine — vertebrae trailing behind the skull ────────────────
    const spineCount = 14;
    for (let i = 0; i < spineCount; i++) {
      const t = i / spineCount;
      const vSize = 0.5 - t * 0.2;
      const vertGeo = new THREE.DodecahedronGeometry(vSize, 0);
      const vert = new THREE.Mesh(vertGeo, boneMat);
      vert.position.set(
        cp.x + Math.sin(i * 0.3) * 0.3,
        4.5 - t * 3.5 + Math.sin(i * 0.5) * 0.3,
        cp.z - 2.5 - i * 1.2,
      );
      vert.rotation.set(Math.random() * 0.3, 0, Math.random() * 0.2);
      vert.castShadow = true;
      this.group.add(vert);

      // Spinal spikes (dorsal spines)
      if (i % 2 === 0) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.6 - t * 0.3, 4),
          boneMatDark,
        );
        spike.position.set(
          vert.position.x,
          vert.position.y + vSize + 0.2,
          vert.position.z,
        );
        spike.castShadow = true;
        this.group.add(spike);
      }
    }

    // ── c) Ribcage — arching ribs on each side ──────────────────────
    const ribCount = 6;
    for (let i = 0; i < ribCount; i++) {
      const ribZ = cp.z - 4 - i * 1.8;
      const ribY = 3.5 - i * 0.3;
      const ribScale = 1 - i * 0.08;

      for (const side of [-1, 1]) {
        // Each rib is a TorusGeometry segment (curved bone)
        const ribGeo = new THREE.TorusGeometry(2.5 * ribScale, 0.12, 6, 10, Math.PI * 0.7);
        const rib = new THREE.Mesh(ribGeo, boneMat);
        rib.position.set(cp.x, ribY, ribZ);
        rib.rotation.y = side * Math.PI / 2;
        rib.rotation.x = -0.3;
        rib.rotation.z = side * 0.2;
        rib.castShadow = true;
        this.group.add(rib);
      }
    }

    // ── d) Wings — skeletal wing frames splayed out ──────────────────
    for (const side of [-1, 1]) {
      const wingBase = new THREE.Vector3(cp.x + side * 2, 3.5, cp.z - 6);

      // Humerus (upper arm bone)
      const humerus = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 4, 6),
        boneMat,
      );
      humerus.position.set(wingBase.x + side * 2, wingBase.y + 0.5, wingBase.z);
      humerus.rotation.z = side * 1.0;
      humerus.castShadow = true;
      this.group.add(humerus);

      // Forearm
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 5, 6),
        boneMatDark,
      );
      forearm.position.set(wingBase.x + side * 5.5, wingBase.y + 1.5, wingBase.z);
      forearm.rotation.z = side * 0.6;
      forearm.castShadow = true;
      this.group.add(forearm);

      // Wing fingers (3 long bone fingers splayed out)
      for (let f = 0; f < 3; f++) {
        const fingerAngle = side * (0.3 + f * 0.35);
        const fingerLen = 4 - f * 0.8;
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.08, fingerLen, 5),
          boneMat,
        );
        const fBase = new THREE.Vector3(
          wingBase.x + side * 8,
          wingBase.y + 2.5 - f * 0.3,
          wingBase.z + 0.5 - f * 0.8,
        );
        finger.position.set(
          fBase.x + Math.cos(fingerAngle) * fingerLen * 0.4,
          fBase.y + Math.sin(fingerAngle) * fingerLen * 0.3,
          fBase.z,
        );
        finger.rotation.z = fingerAngle;
        finger.castShadow = true;
        this.group.add(finger);

        // Claw at finger tip
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.3, 4),
          boneMatDark,
        );
        claw.position.set(
          fBase.x + Math.cos(fingerAngle) * fingerLen * 0.85,
          fBase.y + Math.sin(fingerAngle) * fingerLen * 0.65,
          fBase.z,
        );
        claw.rotation.z = fingerAngle + side * 0.3;
        this.group.add(claw);
      }

      // Tattered membrane remnants between fingers (semi-transparent)
      const membraneMat = new THREE.MeshBasicMaterial({
        color: 0x2a1a10,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const memGeo = new THREE.PlaneGeometry(5, 3, 3, 2);
      const memAtt = memGeo.attributes.position;
      for (let v = 0; v < memAtt.count; v++) {
        memAtt.setX(v, memAtt.getX(v) + (Math.random() - 0.5) * 0.8);
        memAtt.setY(v, memAtt.getY(v) + (Math.random() - 0.5) * 0.5);
      }
      memAtt.needsUpdate = true;
      const membrane = new THREE.Mesh(memGeo, membraneMat);
      membrane.position.set(
        wingBase.x + side * 7,
        wingBase.y + 2,
        wingBase.z,
      );
      membrane.rotation.y = side * 0.3;
      this.group.add(membrane);
    }

    // ── e) Front legs (clawed, collapsed on ground) ──────────────────
    for (const side of [-1, 1]) {
      const legBase = new THREE.Vector3(cp.x + side * 3.5, 0, cp.z - 1);

      // Upper leg
      const upperLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.25, 2.5, 6),
        boneMat,
      );
      upperLeg.position.set(legBase.x, 1.2, legBase.z);
      upperLeg.rotation.z = side * 0.4;
      upperLeg.rotation.x = 0.2;
      upperLeg.castShadow = true;
      this.group.add(upperLeg);

      // Lower leg
      const lowerLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 2, 6),
        boneMatDark,
      );
      lowerLeg.position.set(legBase.x + side * 1.5, 0.5, legBase.z + 1.5);
      lowerLeg.rotation.z = side * 0.8;
      lowerLeg.rotation.x = -0.3;
      lowerLeg.castShadow = true;
      this.group.add(lowerLeg);

      // Claws (3 per foot)
      for (let c = 0; c < 3; c++) {
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.06, 0.5, 4),
          boneMatDark,
        );
        claw.position.set(
          legBase.x + side * 2.5 + (c - 1) * side * 0.3,
          0.15,
          legBase.z + 2.5 + (c - 1) * 0.2,
        );
        claw.rotation.x = -Math.PI / 2 + 0.3;
        claw.castShadow = true;
        this.group.add(claw);
      }
    }

    // ── f) Tail — trailing away from spine, ending with a spike ──────
    const tailSegs = 10;
    for (let i = 0; i < tailSegs; i++) {
      const t = i / tailSegs;
      const tailSize = 0.3 - t * 0.2;
      const tailGeo = new THREE.SphereGeometry(Math.max(0.05, tailSize), 6, 5);
      const tailVert = new THREE.Mesh(tailGeo, boneMat);
      const tailCurve = Math.sin(i * 0.4) * 1.5;
      tailVert.position.set(
        cp.x + tailCurve,
        0.8 - t * 0.5,
        cp.z - 19 - i * 1.0,
      );
      tailVert.castShadow = true;
      this.group.add(tailVert);
    }
    // Tail spike
    const tailSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.8, 5),
      boneMatDark,
    );
    tailSpike.position.set(cp.x + Math.sin(tailSegs * 0.4) * 1.5, 0.3, cp.z - 19 - tailSegs * 1.0);
    tailSpike.rotation.x = Math.PI / 2 + 0.2;
    this.group.add(tailSpike);

    // ── g) Atmospheric effects — green mist from the maw ────────────
    for (let i = 0; i < 5; i++) {
      const mistGeo = new THREE.PlaneGeometry(2 + Math.random() * 2, 1 + Math.random());
      const mist = new THREE.Mesh(mistGeo, new THREE.MeshBasicMaterial({
        color: 0x44aa66,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      mist.name = `dragon-mist-${i}`;
      mist.position.set(
        cp.x + (Math.random() - 0.5) * 3,
        1 + Math.random() * 2,
        cp.z + (Math.random() - 0.5) * 2,
      );
      mist.rotation.y = Math.random() * Math.PI;
      this.group.add(mist);
    }

    // ── h) Inner glow — eerie light from within the skull ───────────
    const innerGlow = new THREE.PointLight(0x22ff44, 2, 12);
    innerGlow.position.set(cp.x, 2.5, cp.z - 1.5);
    innerGlow.name = 'dragon-inner-glow';
    this.group.add(innerGlow);

    const dungeonGlow = new THREE.PointLight(0x33cc55, 1.5, 8);
    dungeonGlow.position.set(cp.x, 1.5, cp.z - 0.5);
    dungeonGlow.name = 'dragon-dungeon-glow';
    this.group.add(dungeonGlow);

    // ── i) Sign ─────────────────────────────────────────────────────
    const sign = this.createTextSign('THE DEPTHS', 0x88ffaa);
    sign.position.set(cp.x, 8.5, cp.z + 0.5);
    this.group.add(sign);

    // ── j) Scattered bones around the skeleton ──────────────────────
    const scatterBoneMat = new THREE.MeshStandardMaterial({ color: 0xc0b490, roughness: 0.82 });
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * 5;
      const bx = cp.x + Math.cos(angle) * dist;
      const bz = cp.z + Math.sin(angle) * dist * 0.5 + 2;
      const boneLen = 0.3 + Math.random() * 0.5;
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.03, boneLen, 4),
        scatterBoneMat,
      );
      bone.position.set(bx, 0.05, bz);
      bone.rotation.z = Math.PI / 2;
      bone.rotation.y = Math.random() * Math.PI;
      this.group.add(bone);
    }
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
        // ── Dragon skeleton entrance animations ─────────────────────────
    // Eye glow pulse
    for (const side of ['L', 'R']) {
      const eyeLight = this.group.getObjectByName(`dragon-eye-${side}`);
      if (eyeLight) {
        (eyeLight as THREE.PointLight).intensity = 0.8 + Math.sin(time * 1.5 + (side === 'L' ? 0 : 1)) * 0.4;
      }
      const eyeOrb = this.group.getObjectByName(`dragon-eye-orb-${side}`);
      if (eyeOrb) {
        const eMat = (eyeOrb as THREE.Mesh).material as THREE.MeshBasicMaterial;
        eMat.opacity = 0.5 + Math.sin(time * 1.5 + (side === 'L' ? 0 : 1)) * 0.3;
      }
    }

    // Mist drifting from the maw
    for (let i = 0; i < 5; i++) {
      const mist = this.group.getObjectByName(`dragon-mist-${i}`);
      if (mist) {
        mist.position.x += Math.sin(time * 0.3 + i * 1.5) * 0.002;
        mist.position.y += Math.cos(time * 0.2 + i * 0.8) * 0.001;
        const mMat = (mist as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mMat.opacity = 0.06 + Math.sin(time * 0.5 + i * 1.2) * 0.04;
      }
    }

    // Inner skull glow pulse
    const innerGlow = this.group.getObjectByName('dragon-inner-glow');
    if (innerGlow) {
      (innerGlow as THREE.PointLight).intensity = 1.5 + Math.sin(time * 0.8) * 0.6;
    }
    const dungeonGlow = this.group.getObjectByName('dragon-dungeon-glow');
    if (dungeonGlow) {
      (dungeonGlow as THREE.PointLight).intensity = 1.2 + Math.sin(time * 1.5) * 0.4;
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
