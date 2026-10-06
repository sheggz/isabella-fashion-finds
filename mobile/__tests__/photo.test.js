import { photoFromAsset } from '../src/lib/photo';

describe('photoFromAsset', () => {
  it('builds the upload object the multipart form understands', () => {
    expect(photoFromAsset({ uri: 'file:///tmp/IMG_1.jpg', fileName: 'IMG_1.jpg', mimeType: 'image/jpeg', fileSize: 1234 })).toEqual({
      uri: 'file:///tmp/IMG_1.jpg', name: 'IMG_1.jpg', type: 'image/jpeg', size: 1234,
    });
  });

  it('works out the type from the extension when the picker does not say', () => {
    expect(photoFromAsset({ uri: 'file:///a/b/photo.PNG' }).type).toBe('image/png');
    expect(photoFromAsset({ uri: 'file:///a/b/photo.webp' }).type).toBe('image/webp');
    expect(photoFromAsset({ uri: 'file:///a/b/photo.jpeg' }).type).toBe('image/jpeg');
  });

  it('names the file from the address when there is no file name, and defaults sensibly', () => {
    expect(photoFromAsset({ uri: 'file:///a/b/picked.jpg' }).name).toBe('picked.jpg');
    const odd = photoFromAsset({ uri: 'content://media/external/images/42' });
    expect(odd.name).toBe('photo.jpg');
    expect(odd.type).toBe('image/jpeg');
  });

  it('keeps an unknown size as undefined so size checks are left to the server', () => {
    expect(photoFromAsset({ uri: 'file:///a.jpg' }).size).toBeUndefined();
  });
});
