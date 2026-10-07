// Product photos straight from a modern phone are 3-8 MB: slow to upload over mobile data and
// often over the server's 5 MB limit. We shrink them on the phone first (longer side at most
// 1600 px, JPEG at 80% quality: typically a few hundred KB and plenty sharp for a shop). This also
// turns HEIC photos (iPhone) into JPEG, which the server accepts.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { photoFromAsset } from './photo';

export const MAX_SIDE = 1600;
const QUALITY = 0.8;

/** Pure: the resize option for a photo of this size, or null when it is already small enough. */
export const resizeTarget = ({ width, height }, max = MAX_SIDE) => {
  if (!width || !height || Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
};

/**
 * Picker asset -> `{ uri, name, type, size }` ready to upload. If shrinking fails for any reason
 * the original photo is used (the server still validates it), so a hiccup never blocks the owner.
 */
export const shrinkPhoto = async (asset) => {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const target = resizeTarget(asset);
    if (target) context.resize(target);
    const rendered = await context.renderAsync();
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
    return { uri: out.uri, name: 'photo.jpg', type: 'image/jpeg', size: undefined };
  } catch {
    return photoFromAsset(asset);
  }
};
