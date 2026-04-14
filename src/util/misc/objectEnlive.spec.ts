import * as dom from './dom';
import { enlivenObjects, loadImage } from './objectEnlive';
import { Rect, type RectProps } from '../../shapes/Rect';
import { Shadow } from '../../Shadow';
import { classRegistry } from '../../ClassRegistry';
import { FabricError } from '../internals/console';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedRectWithCustomProperty = {
  type: 'rect',
  width: 100,
  // will become a shadow
  shadow: {
    type: 'shadow',
    blur: 5,
  },
  // will become a rect
  custom1: {
    type: 'rect',
    width: 50,
  },
  custom2: {
    type: 'nothing',
    value: 3,
  },
  // will become a set
  custom3: {
    type: 'registered',
  },
};

describe('enlivenObjects', () => {
  it('will enlive correctly', async () => {
    const [rect] = await enlivenObjects<Rect<RectProps>>([
      mockedRectWithCustomProperty,
    ]);
    expect(rect).toBeInstanceOf(Rect);
    expect(rect.shadow).toBeInstanceOf(Shadow);
    expect(rect.custom1).toBeInstanceOf(Rect);
    expect(rect.custom2).toEqual({
      type: 'nothing',
      value: 3,
    });
    expect(rect.custom3).toEqual({
      type: 'registered',
    });
  });
  it('will enlive correctly newly registered props', async () => {
    class Test {
      declare opts: any;
      constructor(opts: any) {
        this.opts = opts;
      }
      static async fromObject(opts: any) {
        return new this(opts);
      }
    }
    classRegistry.setClass(Test, 'registered');
    const [rect] = await enlivenObjects<Rect<RectProps>>([
      mockedRectWithCustomProperty,
    ]);
    expect(rect).toBeInstanceOf(Rect);
    expect(rect.shadow).toBeInstanceOf(Shadow);
    expect(rect.custom1).toBeInstanceOf(Rect);
    expect(rect.custom2).toEqual({
      type: 'nothing',
      value: 3,
    });
    expect(rect.custom3).toBeInstanceOf(Test);
  });
});

const createMockImage = () => {
  let currentSrc = '';
  return {
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    crossOrigin: null as string | null,
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    get src() {
      return currentSrc;
    },
    set src(value: string) {
      currentSrc = value;
      if (value === 'bad-url') {
        queueMicrotask(() => this.onerror?.());
      }
    },
  } as unknown as HTMLImageElement;
};

describe('loadImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects loading errors by default', async () => {
    vi.spyOn(dom, 'createImage').mockReturnValue(createMockImage());

    await expect(loadImage('bad-url')).rejects.toEqual(
      new FabricError('Error loading bad-url'),
    );
  });

  it('falls back to an empty image when requested', async () => {
    const mockImage = createMockImage();
    vi.spyOn(dom, 'createImage').mockReturnValue(mockImage);

    const image = await loadImage('bad-url', { fallbackToEmptyImage: true });

    expect(image).toBe(mockImage);
    expect(image.src).toBe('');
  });
});
