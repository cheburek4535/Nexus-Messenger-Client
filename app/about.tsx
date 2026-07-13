import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { t } from '../src/services/i18n';

const AboutScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const appVersion = 'v0.1.0';
  const githubUrl = 'https://github.com/cheburek4535/Nexus-messenger';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top }}>
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('about.title')}</Text>
          <View style={styles.backButton} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logoSection}>
          <View style={[styles.logoCircle, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
            <Ionicons name="chatbubble-ellipses" size={48} color={colors.accent} />
          </View>
          <Text style={[styles.appName, { color: colors.primary }]}>{t('app.name')}</Text>
          <Text style={[styles.version, { color: colors.textSecondary }]}>{appVersion}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.primary }]}>{t('about.descriptionTitle')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.accent }]} />
          <Text style={[styles.description, { color: colors.text }]}>
            {t('about.description')}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.primary }]}>{t('about.links')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.accent }]} />

          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(githubUrl)}>
            <Ionicons name="logo-github" size={20} color={colors.accent} />
            <Text style={[styles.linkText, { color: colors.accent }]}>{t('about.viewOnGitHub')}</Text>
            <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.primary }]}>{t('about.techStack')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.accent }]} />
          {[
            [t('about.techReactNative'), t('about.techExpoRouter')],
            [t('about.techE2E'), t('about.techClientKeys')],
            [t('about.techAtRest'), t('about.techAESGCM')],
            [t('about.techVoice'), t('about.techBase64')],
            [t('about.techGhost'), t('about.techInMemory')],
            [t('about.techBackground'), t('about.techDBH')],
          ].map(([label, value]) => (
            <View key={label} style={styles.techRow}>
              <Text style={[styles.techLabel, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[styles.techValue, { color: colors.primary }]}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          {t('about.footer')}
        </Text>
      </ScrollView>
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
  content: { padding: 20, paddingBottom: 40 },
  logoSection: { alignItems: 'center', marginTop: 24, marginBottom: 28 },
  logoCircle: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, marginBottom: 16,
  },
  appName: { fontSize: 24, fontWeight: '300', letterSpacing: 2, marginBottom: 4 },
  version: { fontSize: 13, fontWeight: '300', letterSpacing: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 12, fontWeight: '500', letterSpacing: 4, marginBottom: 12 },
  divider: { height: 1, width: 40, marginBottom: 16 },
  description: { fontSize: 13, lineHeight: 20, fontWeight: '300' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { fontSize: 14, fontWeight: '400', flex: 1 },
  techRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  techLabel: { fontSize: 12, fontWeight: '300', letterSpacing: 0.5 },
  techValue: { fontSize: 12, fontWeight: '400' },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 8, fontWeight: '300' },
});

export default AboutScreen;
