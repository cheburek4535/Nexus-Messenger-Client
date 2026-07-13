import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { getDatabase } from '../../src/database/connection';
import { getLocalIdentity } from '../../src/services/identity';
import { getUserProfile } from '../../src/services/api';
import { upsertContact, syncChatsWithContacts } from '@/src/services/contactService';
import { t } from '../../src/services/i18n';

interface PublicProfile {
  username: string;
  publicKey: string;
  displayName: string;
  lastSeen: number | null;
  avatarUri: string | null;
  isBlocked: boolean;
}

const PublicProfileScreen = () => {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [myUsername, setMyUsername] = useState<string>('');

  useEffect(() => {
    loadProfile();
  }, [username]);

  const loadProfile = async () => {
    const identity = await getLocalIdentity();
    if (identity) setMyUsername(identity.username);

    // Try fetching from server first
    const serverProfile = await getUserProfile(username || '', identity?.username);
    if (serverProfile && !serverProfile.error && serverProfile.public_key) {
      setProfile({
        username: serverProfile.username,
        publicKey: serverProfile.public_key,
        displayName: serverProfile.display_name || '',
        lastSeen: serverProfile.last_seen || null,
        avatarUri: serverProfile.avatar_uri || null,
        isBlocked: serverProfile.is_blocked || false,
      });
      // Cache in contacts
      await upsertContact(serverProfile.username, {
        publicKey: serverProfile.public_key,
        displayName: serverProfile.display_name,
        avatarUri: serverProfile.avatar_uri,
        lastSeen: serverProfile.last_seen,
      });
      await syncChatsWithContacts();
      return;
    }

    // Fallback to local DB
    const db = await getDatabase();
    const contact = await db.getFirstAsync<any>(
      `SELECT * FROM contacts WHERE username = ?`,
      [username]
    );
    const chat = await db.getFirstAsync<any>(
      `SELECT * FROM chats WHERE username = ? AND is_ghost = 0`,
      [username]
    );
    const blockedRow = await db.getFirstAsync<any>(
      `SELECT * FROM blocked_users WHERE username = ?`,
      [username]
    );

    setProfile({
      username: username || '',
      publicKey: contact?.public_key || t('profile.notShared'),
      displayName: contact?.display_name || '',
      lastSeen: contact?.last_seen || null,
      avatarUri: contact?.avatar_uri || chat?.avatar_uri || null,
      isBlocked: !!blockedRow,
    });
  };

  const handleCopy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
  }, []);

  const handleSendMessage = () => {
    router.push(`/chat/${profile?.username}`);
  };

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('profile.loading')}</Text>
      </View>
    );
  }

  const displayName = profile.displayName || `@${profile.username}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top }}>
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('profile.title')}</Text>
          <View style={styles.backButton} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarSection}>
          {profile.avatarUri ? (
            <Image source={{ uri: profile.avatarUri }} style={[styles.avatar, { borderColor: colors.accent + '40' }]} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {(profile.displayName || profile.username).substring(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.displayName, { color: colors.primary }]}>{displayName}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>@{profile.username}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.primary }]}>{t('profile.contactInfo')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.accent, opacity: 0.5 }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.publicKey')}</Text>
            <TouchableOpacity onPress={() => handleCopy(profile.publicKey)} style={styles.copyRow}>
              <Text style={[styles.value, { color: colors.primary }]} numberOfLines={2}>
                {profile.publicKey}
              </Text>
              <Ionicons name="copy-outline" size={16} color={colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.username')}</Text>
            <TouchableOpacity onPress={() => handleCopy(`@${profile.username}`)} style={styles.copyRow}>
              <Text style={[styles.value, { color: colors.primary }]}>@{profile.username}</Text>
              <Ionicons name="copy-outline" size={16} color={colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.encryption')}</Text>
            <View style={styles.encryptionBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.accent} />
              <Text style={[styles.value, { color: colors.accent, marginLeft: 4 }]}>{t('profile.e2eEnabled')}</Text>
            </View>
          </View>
        </View>

        {profile.isBlocked && (
          <View style={[styles.blockedNotice, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}>
            <Ionicons name="ban-outline" size={16} color={colors.danger} />
            <Text style={[styles.blockedText, { color: colors.danger }]}>
              {t('error.blockedByUser')}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.chatButton, {
            backgroundColor: profile.isBlocked ? colors.border : colors.accent,
            opacity: profile.isBlocked ? 0.5 : 1,
          }]}
          onPress={handleSendMessage}
          disabled={profile.isBlocked}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFF" />
          <Text style={styles.chatButtonText}>
            {profile.isBlocked ? t('common.blocked') : t('profile.sendMessage')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 0.5,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontSize: 16, fontWeight: '400', letterSpacing: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  loadingText: { textAlign: 'center', marginTop: 40 },
  avatarSection: { alignItems: 'center', marginTop: 32, marginBottom: 28 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, marginBottom: 14 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '300', letterSpacing: 2 },
  displayName: { fontSize: 22, fontWeight: '300', letterSpacing: 1, marginBottom: 4 },
  username: { fontSize: 14, fontWeight: '300', letterSpacing: 0.5, marginBottom: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20 },
  cardTitle: { fontSize: 12, fontWeight: '500', letterSpacing: 4, marginBottom: 12 },
  divider: { height: 1, width: 40, marginBottom: 20 },
  infoRow: { marginBottom: 20 },
  label: { fontSize: 10, fontWeight: '500', letterSpacing: 3, marginBottom: 6 },
  value: { fontSize: 13, fontWeight: '300', letterSpacing: 0.5, flex: 1 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  encryptionBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  chatButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 24,
  },
  chatButtonText: { color: '#FFF', fontSize: 14, fontWeight: '500', letterSpacing: 1 },
  blockedNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 24,
    borderWidth: 0.5,
  },
  blockedText: { fontSize: 13, fontWeight: '300', flex: 1 },
});

export default PublicProfileScreen;
