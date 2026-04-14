import * as objectEnlive from '../util/misc/objectEnlive';
import { Pattern } from './Pattern';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Pattern', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enlives from serialized object', async () => {
    const pattern = await Pattern.fromObject({
      type: 'pattern',
      source: '',
      repeat: 'repeat-x',
      offsetX: 12,
    });

    expect(pattern).toBeInstanceOf(Pattern);
    expect(pattern.repeat).toBe('repeat-x');
    expect(pattern.offsetX).toBe(12);
    expect(pattern.sourceToString()).toBe('');
  });

  it('falls back to an empty source when the pattern image fails to load', async () => {
    const loadImageSpy = vi.spyOn(objectEnlive, 'loadImage');
    const emptyImage = new Image();
    loadImageSpy.mockResolvedValueOnce(emptyImage);

    const pattern = await Pattern.fromObject({
      type: 'pattern',
      source: 'bad-url',
      repeat: 'repeat',
    });

    expect(pattern).toBeInstanceOf(Pattern);
    expect(pattern.source).toBe(emptyImage);
    expect(loadImageSpy).toHaveBeenCalledWith('bad-url', {
      crossOrigin: undefined,
      fallbackToEmptyImage: true,
    });
  });

  it('preserves abort errors', async () => {
    const controller = new AbortController();
    const loadImageSpy = vi.spyOn(objectEnlive, 'loadImage');
    const abortError = new Error('aborted');

    controller.abort();
    loadImageSpy.mockRejectedValueOnce(abortError);

    await expect(
      Pattern.fromObject(
        {
          type: 'pattern',
          source: 'bad-url',
          repeat: 'repeat',
        },
        { signal: controller.signal },
      ),
    ).rejects.toBe(abortError);
  });
});
