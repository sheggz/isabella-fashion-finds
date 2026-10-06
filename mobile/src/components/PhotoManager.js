import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { remainingSlots, sortedImages, validateImageFile } from '@isabella/core';
import { admin } from '../api/client';
import { photoFromAsset } from '../lib/photo';
import { useTheme } from '../theme';
import { Badge, Button, Photo } from './ui';
import { Section } from './forms';

/**
 * Photos of an existing piece: add from the camera or the library, make a photo the cover,
 * delete. Every action answers with the whole updated piece, which replaces the old copy.
 * `rules` = the server's photo limits from /catalogue/options (for instant feedback only).
 */
export function PhotoManager({ product, rules, onChange }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const images = sortedImages(product);
  const slots = remainingSlots(images.length, rules);

  const run = async (action, fallback) => {
    if (busy) return; // ignore taps while a change is being saved
    setBusy(true);
    setMessage('');
    try {
      onChange(await action());
    } catch (error) {
      setMessage(error?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (result) => {
    if (result.canceled || !result.assets?.length) return;
    const file = photoFromAsset(result.assets[0]);
    const problem = validateImageFile(file, rules);
    if (problem) { setMessage(problem); return; }
    await run(() => admin.uploadImage(product.id, file), 'Could not upload the photo.');
  };

  const fromLibrary = async () => upload(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));

  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setMessage('Allow camera access in your phone settings to take photos.'); return; }
    await upload(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }));
  };

  const makeCover = (image) =>
    run(() => admin.reorderImages(product.id, [image.id, ...images.filter((i) => i.id !== image.id).map((i) => i.id)]), 'Could not change the cover photo.');

  const remove = (image) =>
    Alert.alert('Remove this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => admin.deleteImage(product.id, image.id), 'Could not delete the photo.') },
    ]);

  return (
    <Section title="Photos">
      <Text style={{ color: colors.muted }}>The first photo is the cover shown in the shop.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {images.map((image, index) => (
          <View key={image.id} style={{ width: 100, gap: 4 }}>
            <Photo uri={image.url} />
            {index === 0 ? (
              <Badge text="Cover" />
            ) : (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => makeCover(image)}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Make cover</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => remove(image)}>
              <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Take photo" outline disabled={busy || slots === 0} onPress={fromCamera} style={{ flex: 1 }} />
        <Button label="Choose photo" outline disabled={busy || slots === 0} onPress={fromLibrary} style={{ flex: 1 }} />
      </View>
      {busy ? <Text style={{ color: colors.muted }}>Working…</Text> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {rules ? `${images.length} of ${rules.max_per_product} photos` : `${images.length} photos`}
        {slots === 0 ? '. Delete one to add another.' : ''}
      </Text>
    </Section>
  );
}
