import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { globalStyles } from '../src/theme/styles';
import { Ionicons } from '@expo/vector-icons';
import { getLocalIdentity, updatePrivacy, PrivacySettings } from '../src/services/identity';
import { updatePrivacyOnServer } from '../src/services/api';
import { unblockUser, getBlockedUsers, syncBlockedUsersFromServer } from '../src/services/chatService';
import { t } from '../src/services/i18n';

const SecurityScreen = () => {
  const { colors } = useTheme();
  const styles = globalStyles(colors);
  const [identity, setIdentity] = useState<any>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    showAvatar: true,
    showStatus: true,
    showReadReceipts: true,
  });
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const ident = await getLocalIdentity();
    setIdentity(ident);
    if (ident?.privacy) {
      setPrivacy(ident.privacy);
    }
    const blocked = await getBlockedUsers();
    setBlockedUsers(blocked);
    if (ident) {
      syncBlockedUsersFromServer(ident.username).then(() => {
        getBlockedUsers().then(setBlockedUsers);
      }).catch(() => {});
    }
  };

  const updatePrivacySetting = useCallback(async (key: keyof PrivacySettings, value: boolean) => {
    const newPrivacy = { ...privacy, [key]: value };
    setPrivacy(newPrivacy);
    await updatePrivacy(newPrivacy);
    const ident = await getLocalIdentity();
    if (ident) {
      await updatePrivacyOnServer({
        username: ident.username,
        show_avatar: newPrivacy.showAvatar,
        show_status: newPrivacy.showStatus,
        show_read_receipts: newPrivacy.showReadReceipts,
      });
    }
  }, [privacy]);

  const handleUnblock = useCallback(async (username: string) => {
    const ident = await getLocalIdentity();
    if (!ident) return;
    Alert.alert(t('security.unblock'), t('security.unblockConfirm', username), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('security.unblock'),
        style: 'destructive',
        onPress: async () => {
          await unblockUser(username, ident.username);
          setBlockedUsers(await getBlockedUsers());
        },
      },
    ]);
  }, []);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={localStyles.header}>
        <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
        <Text style={[localStyles.title, { color: colors.primary }]}>{t('security.title')}</Text>
      </View>

      <View style={[styles.glassPanel, { margin: 16 }]}>
        <Text style={[localStyles.sectionTitle, { color: colors.primary }]}>
          {t('security.deviceIdentity')}
        </Text>
        <View style={styles.accentLine} />

        <View style={localStyles.infoRow}>
          <Text style={[localStyles.label, { color: colors.textSecondary }]}>{t('security.username')}</Text>
          <Text style={[localStyles.value, { color: colors.text }]}>
            @{identity?.username}
          </Text>
        </View>

        <View style={localStyles.infoRow}>
          <Text style={[localStyles.label, { color: colors.textSecondary }]}>{t('security.deviceId')}</Text>
          <Text style={[localStyles.value, { color: colors.text }]} numberOfLines={1}>
            {identity?.deviceId}
          </Text>
        </View>

        <View style={localStyles.infoRow}>
          <Text style={[localStyles.label, { color: colors.textSecondary }]}>{t('security.encryption')}</Text>
          <View style={localStyles.badgeRow}>
            <Ionicons name="lock-closed" size={12} color={colors.accent} />
            <Text style={[localStyles.badgeText, { color: colors.accent }]}>{t('security.e2eActive')}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
        <Text style={[localStyles.sectionTitle, { color: colors.primary }]}>
          {t('security.privacy')}
        </Text>
        <View style={styles.accentLine} />

        <View style={localStyles.settingRow}>
          <View style={localStyles.settingInfo}>
            <View style={localStyles.settingLabel}>
              <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
              <Text style={[localStyles.settingText, { color: colors.primary }]}>{t('security.showAvatar')}</Text>
            </View>
            <Text style={[localStyles.settingDesc, { color: colors.textSecondary }]}>
              {t('security.showAvatarDesc')}
            </Text>
          </View>
          <Switch
            value={privacy.showAvatar}
            onValueChange={(v) => updatePrivacySetting('showAvatar', v)}
            trackColor={{ false: colors.border, true: colors.accent + '60' }}
            thumbColor={privacy.showAvatar ? colors.accent : '#f4f3f4'}
          />
        </View>

        <View style={localStyles.settingRow}>
          <View style={localStyles.settingInfo}>
            <View style={localStyles.settingLabel}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={[localStyles.settingText, { color: colors.primary }]}>{t('security.showStatus')}</Text>
            </View>
            <Text style={[localStyles.settingDesc, { color: colors.textSecondary }]}>
              {t('security.showStatusDesc')}
            </Text>
          </View>
          <Switch
            value={privacy.showStatus}
            onValueChange={(v) => updatePrivacySetting('showStatus', v)}
            trackColor={{ false: colors.border, true: colors.accent + '60' }}
            thumbColor={privacy.showStatus ? colors.accent : '#f4f3f4'}
          />
        </View>

        <View style={localStyles.settingRow}>
          <View style={localStyles.settingInfo}>
            <View style={localStyles.settingLabel}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.textSecondary} />
              <Text style={[localStyles.settingText, { color: colors.primary }]}>{t('security.showReadReceipts')}</Text>
            </View>
            <Text style={[localStyles.settingDesc, { color: colors.textSecondary }]}>
              {t('security.showReadReceiptsDesc')}
            </Text>
          </View>
          <Switch
            value={privacy.showReadReceipts}
            onValueChange={(v) => updatePrivacySetting('showReadReceipts', v)}
            trackColor={{ false: colors.border, true: colors.accent + '60' }}
            thumbColor={privacy.showReadReceipts ? colors.accent : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
        <Text style={[localStyles.sectionTitle, { color: colors.primary }]}>
          {t('security.blockedUsersTitle')}
        </Text>
        <View style={styles.accentLine} />

        {blockedUsers.length === 0 ? (
          <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>
            {t('security.noBlockedUsers')}
          </Text>
        ) : (
          blockedUsers.map((user) => (
            <View key={user} style={[localStyles.blockedRow, { borderBottomColor: colors.border + '30' }]}>
              <View style={localStyles.blockedInfo}>
                <View style={[localStyles.blockedAvatar, { backgroundColor: colors.danger + '20' }]}>
                  <Ionicons name="ban-outline" size={16} color={colors.danger} />
                </View>
                <Text style={[localStyles.blockedUsername, { color: colors.primary }]}>@{user}</Text>
              </View>
              <TouchableOpacity onPress={() => handleUnblock(user)} style={[localStyles.unblockBtn, { borderColor: colors.accent }]}>
                <Text style={[localStyles.unblockText, { color: colors.accent }]}>{t('security.unblock')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
        <Text style={[localStyles.sectionTitle, { color: colors.primary }]}>
          {t('security.session')}
        </Text>
        <View style={styles.accentLine} />

        <View style={localStyles.sessionInfo}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={[localStyles.sessionText, { color: colors.textSecondary }]}>
            {t('security.created')}{identity?.createdAt ? new Date(identity.createdAt).toLocaleDateString() : t('security.unknown')}
          </Text>
        </View>
      </View>

      <View style={[styles.glassPanel, { margin: 16, marginTop: 0, borderColor: '#D32F2F20', marginBottom: 40 }]}>
        <Text style={[localStyles.sectionTitle, { color: '#D32F2F' }]}>
          {t('security.dangerZone')}
        </Text>
        <View style={[styles.accentLine, { backgroundColor: '#D32F2F' }]} />

        <TouchableOpacity
          style={localStyles.dangerButton}
          onPress={() => {
            Alert.alert(
              t('security.deleteAllData'),
              t('security.deleteAllConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('security.deleteEverything'), style: 'destructive', onPress: () => {} },
              ]
            );
          }}
        >
          <Ionicons name="trash" size={18} color={colors.danger} />
          <Text style={[localStyles.dangerText, { color: colors.danger }]}>{t('security.deleteAllData')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const localStyles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: 32 },
  title: { fontSize: 22, fontWeight: '300', letterSpacing: 2, marginTop: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '500', letterSpacing: 3, marginBottom: 8 },
  infoRow: { marginBottom: 16, gap: 4 },
  label: { fontSize: 10, fontWeight: '500', letterSpacing: 2 },
  value: { fontSize: 16, fontWeight: '300' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  badgeText: { fontSize: 13, fontWeight: '500', letterSpacing: 1 },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingInfo: { flex: 1, marginRight: 16 },
  settingLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  settingText: { fontSize: 14 },
  settingDesc: { fontSize: 11, marginLeft: 26 },
  sessionInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionText: { fontSize: 13 },
  dangerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  dangerText: { fontSize: 14 },
  emptyText: { fontSize: 13, fontWeight: '300', paddingVertical: 12 },
  blockedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 0.5,
  },
  blockedInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockedAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  blockedUsername: { fontSize: 14, fontWeight: '300' },
  unblockBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5 },
  unblockText: { fontSize: 12, fontWeight: '400' },
});

export default SecurityScreen;
