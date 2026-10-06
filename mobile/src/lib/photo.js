// Turn what the phone's image picker returns into the object the shared upload call expects
// (`{ uri, name, type }` is the shape React Native's FormData understands; `size` is for the
// instant checks in @isabella/core, and may be unknown).
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

export const photoFromAsset = (asset) => {
  const lastSegment = String(asset.uri).split('?')[0].split('/').pop() ?? '';
  const ext = /\.([A-Za-z0-9]+)$/.exec(lastSegment)?.[1]?.toLowerCase();
  const type = asset.mimeType ?? TYPES[ext] ?? 'image/jpeg';
  const name = asset.fileName ?? (ext ? lastSegment : `photo.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`);
  return { uri: asset.uri, name, type, size: asset.fileSize ?? undefined };
};
