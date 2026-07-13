import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ghostChatManager, GhostInvitation } from '../src/services/ghostChatManager';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../src/services/i18n';

const INVITE_TTL_MS = 3 * 60 * 60 * 1000;

function formatTimeLeft(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

export default function GhostInviteSentScreen() {
  const { toUser, snapshotsAllowed } = useLocalSearchParams<{ toUser: string; snapshotsAllowed: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<'waiting' | 'accepted' | 'declined'>('waiting');
  const [showGuide, setShowGuide] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const createdAt = ghostChatManager.getInvitationCreatedAt(toUser || '') || Date.now();

  useEffect(() => {
    ghostChatManager.init();
    ghostChatManager.sendInvitation(toUser, snapshotsAllowed === 'true');

    const update = () => {
      const remaining = INVITE_TTL_MS - (Date.now() - createdAt);
      setTimeLeft(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 10000);
    const unsub = ghostChatManager.on('response', (inv: GhostInvitation) => {
      if (inv.fromUser === toUser) {
        setStatus(inv.status as any);
        if (inv.status === 'accepted') {
          ghostChatManager.startGhostChat(toUser, snapshotsAllowed === 'true');
          setTimeout(() => {
            router.replace(`/chat/ghost_${toUser}`);
          }, 1500);
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const isExpired = timeLeft !== null && timeLeft <= 0;

  const handleClose = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('ghost.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {status === 'waiting' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: colors.accent + '15' }]}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.primary }]}>{t('ghost.waitingTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('ghost.invitationSent', toUser || '')}
            </Text>
            <Text style={[styles.waitText, { color: colors.textSecondary + '80' }]}>
              {t('ghost.waitHint')}
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
                  <Text style={[styles.guideTitle, { color: colors.accent }]}>{t('ghost.howItWorks')}</Text>
                  <TouchableOpacity onPress={() => setShowGuide(false)}>
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.guideText, { color: colors.textSecondary }]}>
                  {t('ghost.sentGuideBody')}
                </Text>
              </View>
            )}

            {!isExpired && (
              <TouchableOpacity onPress={handleClose} style={[styles.cancelButton, { borderColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('ghost.cancel')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {status === 'accepted' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: '#2E7D3220' }]}>
              <Ionicons name="checkmark-circle" size={48} color="#2E7D32" />
            </View>
            <Text style={[styles.title, { color: '#2E7D32' }]}>{t('ghost.acceptedTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('ghost.acceptedSubtitle', toUser || '')}
            </Text>
            <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 20 }} />
            <Text style={[styles.waitText, { color: colors.textSecondary + '80', marginTop: 8 }]}>
              {t('ghost.entering')}
            </Text>
          </>
        )}

        {status === 'declined' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: '#D32F2F20' }]}>
              <Ionicons name="close-circle" size={48} color="#D32F2F" />
            </View>
            <Text style={[styles.title, { color: '#D32F2F' }]}>{t('ghost.declinedTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('ghost.declinedSubtitle', toUser || '')}
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={[styles.okButton, { backgroundColor: colors.accent }]}>
              <Text style={styles.okButtonText}>{t('ghost.close')}</Text>
            </TouchableOpacity>
          </>
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
  scrollContent: { paddingHorizontal: 20, alignItems: 'center', paddingTop: 40, paddingBottom: 40 },
  expireText: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '300', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  waitText: { fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 18, paddingHorizontal: 20 },
  guideCard: {
    width: '100%', borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 24,
  },
  guideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  guideTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  guideText: { fontSize: 13, lineHeight: 20 },
  cancelButton: {
    marginTop: 32, paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 12, borderWidth: 0.5,
  },
  cancelText: { fontSize: 15, fontWeight: '400' },
  okButton: {
    marginTop: 24, paddingVertical: 12, paddingHorizontal: 40,
    borderRadius: 12,
  },
  okButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});
