import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, StatusBar, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { ghostChatManager } from '../src/services/ghostChatManager';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../src/services/i18n';

const INVITE_TTL_MS = 3 * 60 * 60 * 1000;

function formatTimeLeft(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

export default function GhostInviteReceivedScreen() {
  const { id, from, snapshots, createdAt: createdAtParam } = useLocalSearchParams<{ id: string; from: string; snapshots: string; createdAt?: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [snapshotsAllowed, setSnapshotsAllowed] = useState(snapshots !== 'false');
  const [showGuide, setShowGuide] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const createdAt = createdAtParam ? parseInt(createdAtParam, 10) : Date.now();

  useEffect(() => {
    const update = () => {
      const remaining = INVITE_TTL_MS - (Date.now() - createdAt);
      setTimeLeft(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const handleAccept = () => {
    ghostChatManager.respondToInvitation(id!, true, snapshotsAllowed);
    ghostChatManager.startGhostChat(from!, snapshotsAllowed);
    router.replace(`/chat/ghost_${from}`);
  };

  const handleDecline = () => {
    ghostChatManager.respondToInvitation(id!, false, false);
    router.back();
  };

  const isExpired = timeLeft !== null && timeLeft <= 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('ghost.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.iconContainer, { backgroundColor: colors.accent + '15' }]}>
          <Ionicons name="flash" size={48} color={colors.accent} />
        </View>

        <Text style={[styles.title, { color: colors.primary }]}>{t('ghost.invitationTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('ghost.invitationSubtitle', from || '')}
        </Text>

        {timeLeft !== null && (
          <Text style={[styles.expireText, { color: isExpired ? '#D32F2F' : colors.textSecondary + '99' }]}>
            <Ionicons name="time-outline" size={14} color={isExpired ? '#D32F2F' : colors.textSecondary + '99'} /> {isExpired ? t('ghost.expired') : t('ghost.expiresIn', formatTimeLeft(timeLeft))}
          </Text>
        )}

        {showGuide && (
          <View style={[styles.guideCard, { backgroundColor: colors.surface, borderColor: colors.accent + '30' }]}>
            <View style={styles.guideHeader}>
              <Ionicons name="information-circle" size={18} color={colors.accent} />
              <Text style={[styles.guideTitle, { color: colors.accent }]}>{t('ghost.whatIs')}</Text>
              <TouchableOpacity onPress={() => setShowGuide(false)}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.guideText, { color: colors.textSecondary }]}>
              {t('ghost.receivedGuideBody')}
            </Text>
          </View>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('ghost.confidential')}
          </Text>
        </View>

        <View style={[styles.switchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchLabel}>
            <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.label, { color: colors.primary }]}>{t('ghost.allowSnapshots')}</Text>
          </View>
          <Switch
            value={snapshotsAllowed}
            onValueChange={setSnapshotsAllowed}
            trackColor={{ false: colors.border, true: colors.accent + '60' }}
            thumbColor={snapshotsAllowed ? colors.accent : '#f4f3f4'}
          />
        </View>
        {!snapshotsAllowed && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('ghost.blockSnapshots')}
          </Text>
        )}

        {!isExpired && (
          <View style={styles.buttons}>
            <TouchableOpacity onPress={handleAccept} style={[styles.button, styles.acceptButton, { backgroundColor: colors.accent }]}>
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.buttonText}>{t('ghost.accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDecline} style={[styles.button, styles.declineButton, { backgroundColor: '#D32F2F' }]}>
              <Ionicons name="close" size={22} color="#fff" />
              <Text style={styles.buttonText}>{t('ghost.decline')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 8,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '300', letterSpacing: 2 },
  scrollContent: { paddingHorizontal: 20, alignItems: 'center', paddingTop: 20, paddingBottom: 40 },
  expireText: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '300', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  guideCard: {
    width: '100%', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16,
  },
  guideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  guideTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  guideText: { fontSize: 13, lineHeight: 20 },
  infoCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 0.5, padding: 14, gap: 10, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  switchRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 4,
  },
  switchLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 15 },
  hint: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
  buttons: { flexDirection: 'row', marginTop: 20, gap: 16 },
  button: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, gap: 8,
  },
  acceptButton: { flex: 1, justifyContent: 'center' },
  declineButton: { flex: 1, justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});
