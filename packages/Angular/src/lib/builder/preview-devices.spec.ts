import { describe, it, expect } from 'vitest';

import { PREVIEW_DEVICES, stageHeight, stageWidth } from './preview-devices';

const byId = (id: string) => PREVIEW_DEVICES.find((d) => d.id === id)!;

describe('stageWidth', () => {
  it('lets desktop take the whole window', () => {
    expect(stageWidth(byId('desktop'), 1440)).toBe(1440);
  });

  it('holds a narrow device to its own width, however wide the window is', () => {
    expect(stageWidth(byId('mobile'), 1440)).toBe(byId('mobile').width);
  });

  it('never lets a device overflow a window smaller than it', () => {
    expect(stageWidth(byId('tablet'), 600)).toBe(600);
  });
});

describe('stageHeight', () => {
  it('gives a phone the height of a phone, not the height of its content', () => {
    expect(stageHeight(byId('mobile'), 2000)).toBe(byId('mobile').height);
  });

  it('lets desktop use the whole desk', () => {
    expect(stageHeight(byId('desktop'), 900)).toBe(900);
  });

  it('never lets a device grow past a short window', () => {
    expect(stageHeight(byId('tablet'), 700)).toBe(700);
  });
});
