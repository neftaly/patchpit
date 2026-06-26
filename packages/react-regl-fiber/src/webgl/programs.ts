import gltfFragmentSource from "./shaders/gltf.frag";
import gltfVertexSource from "./shaders/gltf.vert";
import meshFragmentSource from "./shaders/mesh.frag";
import meshVertexSource from "./shaders/mesh.vert";
import { attributeLocation, createProgram, uniformLocation } from "./gl";

export interface MeshProgram {
  readonly attributes: {
    readonly normal: number;
    readonly position: number;
  };
  readonly program: WebGLProgram;
  readonly uniforms: {
    readonly color: WebGLUniformLocation;
    readonly lightColor: WebGLUniformLocation;
    readonly lightDirection: WebGLUniformLocation;
    readonly model: WebGLUniformLocation;
    readonly viewProjection: WebGLUniformLocation;
  };
}

export interface GltfProgram {
  readonly attributes: {
    readonly normal: number;
    readonly position: number;
    readonly texCoord: number;
  };
  readonly program: WebGLProgram;
  readonly uniforms: {
    readonly baseColor: WebGLUniformLocation;
    readonly lightColor: WebGLUniformLocation;
    readonly lightDirection: WebGLUniformLocation;
    readonly model: WebGLUniformLocation;
    readonly viewProjection: WebGLUniformLocation;
  };
}

export const createMeshProgram = (gl: WebGLRenderingContext): MeshProgram => {
  const program = createProgram(gl, meshVertexSource, meshFragmentSource);

  return {
    program,
    attributes: {
      normal: attributeLocation(gl, program, "a_normal"),
      position: attributeLocation(gl, program, "a_position"),
    },
    uniforms: {
      color: uniformLocation(gl, program, "u_color"),
      lightColor: uniformLocation(gl, program, "u_lightColor"),
      lightDirection: uniformLocation(gl, program, "u_lightDirection"),
      model: uniformLocation(gl, program, "u_model"),
      viewProjection: uniformLocation(gl, program, "u_viewProjection"),
    },
  };
};

export const createGltfProgram = (gl: WebGLRenderingContext): GltfProgram => {
  const program = createProgram(gl, gltfVertexSource, gltfFragmentSource);

  return {
    program,
    attributes: {
      normal: attributeLocation(gl, program, "a_normal"),
      position: attributeLocation(gl, program, "a_position"),
      texCoord: attributeLocation(gl, program, "a_texCoord"),
    },
    uniforms: {
      baseColor: uniformLocation(gl, program, "u_baseColor"),
      lightColor: uniformLocation(gl, program, "u_lightColor"),
      lightDirection: uniformLocation(gl, program, "u_lightDirection"),
      model: uniformLocation(gl, program, "u_model"),
      viewProjection: uniformLocation(gl, program, "u_viewProjection"),
    },
  };
};
