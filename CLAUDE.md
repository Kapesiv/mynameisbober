# Vaultborn - Project Conventions

## Static Batching for Rendering Performance

When building world environments (HubWorld, DungeonWorld, etc.), use `StaticBatcher` to reduce draw calls:

### Rules

- **Static objects with the same material** - use `batcher.addMergeable(mesh)` instead of `this.group.add(mesh)`. Groups by material UUID, bakes world transforms, merges geometry into a single draw call.
- **Identical repeated objects** (same geometry + material, different positions) - use `batcher.addInstanceable(key, mesh)`. Creates an `InstancedMesh` for one draw call.
- **Animated objects** (flames, portals, wisps, particles, eyes) - use `this.group.add(mesh)` directly. These need individual references for per-frame updates.
- **Always share material references** - never create materials inside loops. Hoist shared materials to class fields or to the top of the build method.
- **Call `batcher.flush(this.group)` once** at the end of the constructor, after all build methods.

### Pattern

```typescript
constructor(scene: THREE.Scene) {
  this.group = new THREE.Group();
  const batcher = new StaticBatcher();

  this.buildStaticStuff(batcher);   // uses batcher.addMergeable / addInstanceable
  this.buildAnimatedStuff();         // uses this.group.add directly

  batcher.flush(this.group);         // merges/instances everything at once
  scene.add(this.group);
}
```
