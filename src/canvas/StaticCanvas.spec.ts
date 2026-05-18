import { StaticCanvas } from './StaticCanvas';
import { Group } from '../shapes/Group';
import { Path } from '../shapes/Path';
import { FabricText } from '../shapes/Text/Text';

import { it, expect, describe } from 'vitest';

describe('StaticCanvas', () => {
  it('toBlob', async () => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 300 });
    const blob = await canvas.toBlob({
      multiplier: 3,
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
  });
  it('attempts webp format but may fallback to png in node environment', () => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 300 });
    const dataURL = canvas.toDataURL({
      format: 'webp',
      multiplier: 1,
    });
    /**
     * In browser environments this would be 'data:image/webp'
     * In Node.js environment (node-canvas) it falls back to PNG.
     * @see https://github.com/Automattic/node-canvas/issues/1258 for possible workaround
     */
    expect(dataURL).toMatch(/^data:image\/(webp|png)/);
  });

  it('exports text on path inside group to svg defs', () => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 300 });
    const textPath = new FabricText('Text On Path', {
      id: 'group-text-path',
      path: new Path('M 0 0 L 120 0'),
      fontSize: 20,
    });
    const group = new Group([textPath], {
      left: 40,
      top: 60,
    });

    canvas.add(group);

    const svg = canvas.toSVG();

    expect(svg).toContain('<textPath href="#TEXTPATH_group-text-path" ');
    expect(svg).toContain('id="TEXTPATH_group-text-path"');
  });
});
