jest.mock('expo-image-manipulator', () => {
  const calls = {};
  const context = {
    resize: jest.fn((size) => { calls.resize = size; return context; }),
    renderAsync: jest.fn(async () => ({ saveAsync: jest.fn(async (opts) => { calls.save = opts; return { uri: 'file:///out.jpg', width: 1600, height: 1200 }; }) })),
  };
  return {
    ImageManipulator: { manipulate: jest.fn((uri) => { calls.uri = uri; return context; }) },
    SaveFormat: { JPEG: 'jpeg' },
    __calls: calls,
  };
});

import * as manipulator from 'expo-image-manipulator';
import { resizeTarget, shrinkPhoto } from '../src/lib/shrink';

describe('resizeTarget', () => {
  it('shrinks the longer side to the maximum', () => {
    expect(resizeTarget({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600 });
    expect(resizeTarget({ width: 3000, height: 4000 }, 1600)).toEqual({ height: 1600 });
  });
  it('never enlarges a small photo', () => {
    expect(resizeTarget({ width: 800, height: 600 }, 1600)).toBeNull();
  });
  it('copes with unknown dimensions by leaving size alone', () => {
    expect(resizeTarget({}, 1600)).toBeNull();
  });
});

describe('shrinkPhoto', () => {
  it('resizes and re-encodes as JPEG, giving back an upload-ready file', async () => {
    const file = await shrinkPhoto({ uri: 'file:///in.heic', width: 4000, height: 3000 });
    expect(manipulator.__calls.resize).toEqual({ width: 1600 });
    expect(manipulator.__calls.save).toMatchObject({ format: 'jpeg', compress: 0.8 });
    expect(file).toEqual({ uri: 'file:///out.jpg', name: 'photo.jpg', type: 'image/jpeg', size: undefined });
  });

  it('falls back to the original photo if shrinking fails, instead of blocking the upload', async () => {
    manipulator.ImageManipulator.manipulate.mockImplementationOnce(() => { throw new Error('boom'); });
    const file = await shrinkPhoto({ uri: 'file:///in.jpg', fileName: 'in.jpg', mimeType: 'image/jpeg', fileSize: 10 });
    expect(file).toEqual({ uri: 'file:///in.jpg', name: 'in.jpg', type: 'image/jpeg', size: 10 });
  });
});
