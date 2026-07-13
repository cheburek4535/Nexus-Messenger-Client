import { getLocalIdentity } from '../services/identity';

export const checkProfileExists = async (): Promise<boolean> => {
  try {
    const identity = await getLocalIdentity();
    if (!identity) return false;
    return !!(identity.username && identity.publicKey && identity.deviceId);
  } catch {
    return false;
  }
};