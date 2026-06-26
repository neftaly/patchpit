import {
  CameraKind,
  GeometryKind,
  MaterialKind,
  RenderNodeKind,
  type BoxGeometry,
  type DirectionalLightNode,
  type MeshNode,
  type PerspectiveCamera,
  type RenderPass,
  type StandardMaterial,
} from "@royal/renderer-core";

export const asPerspectiveCamera = (pass: RenderPass): PerspectiveCamera => {
  if (pass.camera.kind !== CameraKind.Perspective) {
    throw new Error(`Unsupported camera kind: ${String(pass.camera.kind)}`);
  }

  return pass.camera;
};

export const findDirectionalLight = (
  pass: RenderPass,
): DirectionalLightNode | undefined =>
  pass.children.find((node) => node.kind === RenderNodeKind.DirectionalLight);

export const asBoxGeometry = (mesh: MeshNode): BoxGeometry => {
  if (mesh.geometry.kind !== GeometryKind.Box) {
    throw new Error(
      `Unsupported mesh geometry kind: ${String(mesh.geometry.kind)}`,
    );
  }

  return mesh.geometry as BoxGeometry;
};

export const asStandardMaterial = (mesh: MeshNode): StandardMaterial => {
  if (mesh.material.kind !== MaterialKind.Standard) {
    throw new Error(
      `Unsupported mesh material kind: ${String(mesh.material.kind)}`,
    );
  }

  return mesh.material;
};
