import type { DirectionalLightNode } from './directional-light';
import type { GltfNode } from './gltf';
import type { MeshNode } from './mesh';

export type RenderNode = MeshNode | GltfNode | DirectionalLightNode;
