import { describe, expect, it } from 'vitest';
import { parseViewerHash } from '../apps/patchpit-3d-viewer/src/args';

describe('3D viewer hash args', () => {
  it('parses the raw JSON hash written by the shell URL protocol', () => {
    expect(parseViewerHash('#{"src":"/3d-viewer/DamagedHelmet/DamagedHelmet.gltf","title":"I&S % capture"}')).toEqual({
      src: '/3d-viewer/DamagedHelmet/DamagedHelmet.gltf',
      title: 'I&S % capture'
    });
  });

  it('does not decode percent escapes before parsing JSON', () => {
    expect(parseViewerHash('#{"src":"/assets/%7Braw%7D.gltf"}')).toEqual({
      src: '/assets/%7Braw%7D.gltf'
    });
  });

  it('accepts browser-encoded JSON quotes without decoding the src value', () => {
    expect(parseViewerHash('#{%22src%22:%22/assets/%7Braw%7D.gltf%22}')).toEqual({
      src: '/assets/%7Braw%7D.gltf'
    });
  });

  it('reports invalid hash JSON without guessing a source', () => {
    expect(parseViewerHash('#{"src":')).toEqual({ error: 'Invalid args' });
  });
});
