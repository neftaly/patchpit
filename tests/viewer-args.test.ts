import { describe, expect, it } from 'vitest';
import { parseViewerHash } from '../apps/patchpit-3d-viewer/src/args';

describe('3D viewer hash args', () => {
  it('parses the raw JSON hash written by the shell URL protocol', () => {
    expect(parseViewerHash('#{"path":"/i&s/source.json","title":"I&S % capture"}')).toEqual({
      path: '/i&s/source.json',
      title: 'I&S % capture'
    });
  });

  it('does not decode percent escapes before parsing JSON', () => {
    expect(parseViewerHash('#{"path":"/assets/%7Braw%7D.glb"}')).toEqual({
      path: '/assets/%7Braw%7D.glb'
    });
  });
});
