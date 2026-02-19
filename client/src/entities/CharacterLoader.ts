import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { downscaleTextures } from '../utils/downscaleTextures';

interface CachedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

class CharacterLoaderSingleton {
  private gltfLoader: GLTFLoader;
  private cache = new Map<string, CachedModel>();
  private pending = new Map<string, Promise<CachedModel>>();

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Pre-load model files so they're cached before use. */
  preload(urls: string[]): void {
    for (const url of urls) {
      if (!this.cache.has(url) && !this.pending.has(url)) {
        this.loadModel(url);
      }
    }
  }

  /** Get a cloned scene + animations from a cached (or freshly loaded) model. */
  async getClone(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    let cached = this.cache.get(url);
    if (!cached) {
      cached = await this.loadModel(url);
    }

    const clonedScene = SkeletonUtils.clone(cached.scene) as THREE.Group;
    const clonedAnims = cached.animations.map(clip => clip.clone());

    return { scene: clonedScene, animations: clonedAnims };
  }

  /** Load a single GLB and return just its animation clips. */
  async loadAnimationClips(url: string): Promise<THREE.AnimationClip[]> {
    let cached = this.cache.get(url);
    if (!cached) {
      cached = await this.loadModel(url);
    }
    return cached.animations.map(clip => clip.clone());
  }

  private loadModel(url: string): Promise<CachedModel> {
    let promise = this.pending.get(url);
    if (promise) return promise;

    promise = this.loadGLTF(url);
    this.pending.set(url, promise);
    return promise;
  }

  private loadGLTF(url: string): Promise<CachedModel> {
    return new Promise<CachedModel>((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          downscaleTextures(gltf.scene);

          const cached: CachedModel = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.cache.set(url, cached);
          this.pending.delete(url);
          console.log(`[CharacterLoader] Loaded GLB: ${url} (${gltf.animations.length} animations)`);
          resolve(cached);
        },
        undefined,
        (error) => {
          this.pending.delete(url);
          console.warn(`[CharacterLoader] Failed to load GLB: ${url}`, error);
          reject(error);
        },
      );
    });
  }
}

export const characterLoader = new CharacterLoaderSingleton();
