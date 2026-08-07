import * as FileSystem from 'expo-file-system/legacy';

/**
 * Moves an image from its temporary URI to a permanent location
 * inside the app's document directory.
 */
export const saveImagePermanently = async (uri: string): Promise<string> => {
  try {
    const imagesDir = `${FileSystem.documentDirectory}images/`;
    await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

    const filename = uri.split('/').pop() ?? `${Date.now()}.jpg`;
    const newPath = `${imagesDir}${filename}`;

    await FileSystem.moveAsync({
      from: uri,
      to: newPath,
    });

    return newPath;
  } catch (err) {
    console.error("Error saving image permanently:", err);
    return uri; // fallback to original if move fails
  }
};
