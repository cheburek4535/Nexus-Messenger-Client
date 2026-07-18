import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const getExtensionFromMime = (mimeType?: string): string => {
  if (!mimeType) return 'bin';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'text/plain': 'txt',
    'application/json': 'json',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'bin';
};

const mimeToExtension: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'application/json': '.json',
};

export const downloadFile = async (
  uri: string,
  mimeType?: string,
  customFilename?: string,
): Promise<boolean> => {
  try {
    const ext = mimeToExtension[mimeType || ''] || `.${getExtensionFromMime(mimeType)}`;

    const filename = customFilename
      ? `${customFilename}${ext}`
      : `nexus_${Date.now()}${ext}`;

    const destination = `${FileSystem.cacheDirectory}${filename}`;

    if (uri.startsWith('data:')) {
      const matches = uri.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new Error('Invalid data URI');
      await FileSystem.writeAsStringAsync(destination, matches[2], {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (uri.startsWith('file://') || uri.startsWith('/')) {
      await FileSystem.copyAsync({ from: uri, to: destination });
    } else {
      const { uri: downloaded } = await FileSystem.downloadAsync(uri, destination);
      if (!downloaded) throw new Error('Download failed');
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(destination, {
        mimeType: mimeType || 'application/octet-stream',
        dialogTitle: 'Save file',
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};
