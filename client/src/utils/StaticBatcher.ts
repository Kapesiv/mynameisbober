import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Batches static meshes to reduce draw calls.
 *
 * - addMergeable(mesh): groups by material UUID, bakes world transforms,
 *   merges via mergeGeometries(). Use for static objects that share a material
 *   but have different geometry (rocks, gate pieces, tree trunks).
 *
 * - addInstanceable(key, mesh): collects identical meshes (same geometry +
 *   material) and creates an InstancedMesh. Use for repeated identical objects
 *   at different positions (pillars, posts).
 *
 * - flush(target): call once after all adds. Replaces individual meshes with
 *   merged/instanced versions added to target.
 *
 * Single-entry groups fall through to regular target.add() - no overhead.
 */
export class StaticBatcher {
  private mergeGroups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  private instanceGroups = new Map<string, { geo: THREE.BufferGeometry; material: THREE.Material; meshes: THREE.Mesh[] }>();

  addMergeable(mesh: THREE.Mesh): void {
    const mat = mesh.material as THREE.Material;
    const key = mat.uuid;
    let group = this.mergeGroups.get(key);
    if (!group) {
      group = { material: mat, meshes: [] };
      this.mergeGroups.set(key, group);
    }
    group.meshes.push(mesh);
  }

  addInstanceable(key: string, mesh: THREE.Mesh): void {
    let group = this.instanceGroups.get(key);
    if (!group) {
      group = {
        geo: mesh.geometry,
        material: mesh.material as THREE.Material,
        meshes: [],
      };
      this.instanceGroups.set(key, group);
    }
    group.meshes.push(mesh);
  }

  flush(target: THREE.Object3D): void {
    // -- Merge groups --
    for (const [, group] of this.mergeGroups) {
      if (group.meshes.length === 1) {
        target.add(group.meshes[0]);
        continue;
      }

      const geometries: THREE.BufferGeometry[] = [];
      for (const mesh of group.meshes) {
        mesh.updateMatrixWorld(true);
        const cloned = mesh.geometry.clone();
        cloned.applyMatrix4(mesh.matrixWorld);
        geometries.push(cloned);
      }

      const merged = mergeGeometries(geometries, false);
      if (!merged) {
        // Fallback: add individually if merge fails
        for (const mesh of group.meshes) target.add(mesh);
        continue;
      }

      const batchMesh = new THREE.Mesh(merged, group.material);
      batchMesh.castShadow = group.meshes[0].castShadow;
      batchMesh.receiveShadow = group.meshes[0].receiveShadow;
      batchMesh.name = `merged-${group.meshes.length}`;
      target.add(batchMesh);

      // Dispose individual geometries that were cloned
      for (const g of geometries) g.dispose();
    }

    // -- Instance groups --
    for (const [key, group] of this.instanceGroups) {
      if (group.meshes.length === 1) {
        target.add(group.meshes[0]);
        continue;
      }

      const instanced = new THREE.InstancedMesh(
        group.geo,
        group.material,
        group.meshes.length,
      );
      instanced.castShadow = group.meshes[0].castShadow;
      instanced.receiveShadow = group.meshes[0].receiveShadow;
      instanced.name = `instanced-${key}-${group.meshes.length}`;

      const matrix = new THREE.Matrix4();
      for (let i = 0; i < group.meshes.length; i++) {
        const m = group.meshes[i];
        m.updateMatrixWorld(true);
        matrix.copy(m.matrixWorld);
        instanced.setMatrixAt(i, matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;

      target.add(instanced);
    }

    // Clear state
    this.mergeGroups.clear();
    this.instanceGroups.clear();
  }
}
