import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput } from 'react-native';
import { useTheme } from '../../src/theme/ThemeContext';
import { getLocalIdentity, updateLocalIdentity, updateAvatar, removeAvatar } from '../../src/services/identity';
import { getUserProfile, updateProfileOnServer } from '../../src/services/api';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import ActionSheet, { ActionSheetOption } from '../../src/components/ActionSheet';
import { t } from '../../src/services/i18n';

interface ProfileData {
  username: string;
  deviceId: string;
  avatarUri: string | null;
  displayName: string;
  status: string;
  createdAt: string;
}

const ProfileScreen = () => {
  const { colors } = useTheme();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    setProfile({
      username: identity.username,
      deviceId: identity.deviceId,
      avatarUri: identity.avatarUri,
      displayName: identity.displayName || '',
      status: identity.status || t('profile.available'),
      createdAt: identity.createdAt,
    });
    const parts = (identity.displayName || '').split(' ', 2);
    setFirstName(parts[0] || '');
    setLastName(parts[1] || '');
  };

  const syncProfileToServer = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    const ok = await updateProfileOnServer({
      username: identity.username,
      avatar_uri: identity.avatarUri || '',
      display_name: identity.displayName || '',
    });
    if (!ok) {
      Alert.alert(t('settings.syncFailed'), t('settings.syncFailedDesc'));
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleSaveDisplayName = async () => {
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    await updateLocalIdentity({ displayName: fullName });
    await syncProfileToServer();
    setEditing(false);
    loadProfile();
  };

  const handleEditAvatar = useCallback(async () => {
    const options: ActionSheetOption[] = [
      {
        label: t('profile.changePhoto'),
        icon: 'image-outline',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(t('profile.permissionNeeded'), t('profile.cameraAccess'));
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.6,
            exif: false,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const manipulated = await manipulateAsync(
            result.assets[0].uri,
            [{ resize: { width: 400 } }],
            { compress: 0.6, format: SaveFormat.JPEG }
          );
          await updateAvatar(manipulated.uri);
          await syncProfileToServer();
          await loadProfile();
        },
      },
      ...(profile?.avatarUri ? [{
        label: t('profile.removePhoto'),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: async () => {
          await removeAvatar();
          await syncProfileToServer();
          await loadProfile();
        },
      }] : []),
    ];

    setActionSheetOptions(options);
    setActionSheetVisible(true);
  }, [profile]);

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>{t('profile.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={handleEditAvatar} activeOpacity={0.7}>
          {profile.avatarUri ? (
            <Image
              source={{ uri: profile.avatarUri }}
              style={[styles.avatar, { borderColor: colors.accent }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {(profile.displayName || profile.username).substring(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.editBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="camera" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>

        {editing ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={[styles.nameInput, { color: colors.primary, borderColor: colors.accent }]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('profile.firstName')}
              placeholderTextColor={colors.textSecondary + '60'}
            />
            <TextInput
              style={[styles.nameInput, { color: colors.primary, borderColor: colors.accent }]}
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('profile.lastName')}
              placeholderTextColor={colors.textSecondary + '60'}
            />
            <View style={styles.nameActions}>
              <TouchableOpacity onPress={handleSaveDisplayName} style={[styles.nameActionBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="checkmark" size={18} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={[styles.nameActionBtn, { backgroundColor: colors.border }]}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={[styles.displayName, { color: colors.primary }]}>
              {profile.displayName || t('profile.setDisplayName')}
            </Text>
            <View style={styles.editNameRow}>
              <Ionicons name="pencil-outline" size={12} color={colors.accent} />
              <Text style={[styles.editNameHint, { color: colors.accent }]}>{t('common.edit')}</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={[styles.username, { color: colors.textSecondary }]}>@{profile.username}</Text>
        <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
        <Text style={[styles.status, { color: colors.textSecondary }]}>{profile.status}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.primary }]}>{t('profile.identity')}</Text>
        <View style={[styles.divider, { backgroundColor: colors.accent, opacity: 0.5 }]} />

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.deviceId')}</Text>
            <Text style={[styles.value, { color: colors.primary }]} numberOfLines={1}>
              {profile.deviceId}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.created')}</Text>
            <Text style={[styles.value, { color: colors.primary }]}>
              {formatDate(profile.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.encryption')}</Text>
            <View style={styles.encryptionBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.accent} />
              <Text style={[styles.value, { color: colors.accent, marginLeft: 4 }]}>{t('profile.e2eActive')}</Text>
            </View>
          </View>
        </View>
      </View>

      <ActionSheet
        visible={actionSheetVisible}
        options={actionSheetOptions}
        onCancel={() => setActionSheetVisible(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: 2,
  },
  editBadge: {
    position: 'absolute',
    bottom: 8,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: 2,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  editNameHint: { fontSize: 11, fontWeight: '300' },
  nameEditRow: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
    paddingHorizontal: 20,
  },
  nameInput: {
    width: '100%',
    borderBottomWidth: 1,
    paddingVertical: 4,
    fontSize: 16,
    fontWeight: '300',
    textAlign: 'center',
  },
  nameActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  nameActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 14,
    fontWeight: '300',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  status: {
    fontSize: 13,
    fontWeight: '300',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 4,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    width: 40,
    marginBottom: 20,
  },
  infoRow: {
    marginBottom: 20,
  },
  infoItem: {
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 3,
  },
  value: {
    fontSize: 14,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});

export default ProfileScreen;
