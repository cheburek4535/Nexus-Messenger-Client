import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, Alert, ScrollView, TextInput, Modal, Pressable } from 'react-native';
import { useTheme } from '../../src/theme/ThemeContext';
import { globalStyles } from '../../src/theme/styles';
import { getLocalIdentity, deleteLocalIdentity } from '../../src/services/identity';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearAllData } from '../../src/database/connection';
import TechBackground from '@/src/components/TechBackground';
import { Image } from 'expo-image';
import { t, setLanguage, getCurrentLanguage } from '../../src/services/i18n';
import {
  getSettings,
  updateSettings,
  ColorPresetKey,
  FontSize,
  BubbleStyle,
  BackgroundStyle,
  UserSettings,
} from '../../src/services/settingsService';
import { colorPresets } from '../../src/theme/colorPresets';

const PRESET_NAMES: { key: ColorPresetKey; label: string; icon: string }[] = [
  { key: 'default', label: 'Default', icon: 'color-palette-outline' },
  { key: 'ocean', label: 'Ocean', icon: 'water-outline' },
  { key: 'forest', label: 'Forest', icon: 'leaf-outline' },
  { key: 'sunset', label: 'Sunset', icon: 'sunny-outline' },
  { key: 'cyberpunk', label: 'Cyberpunk', icon: 'flash-outline' },
  { key: 'monochrome', label: 'Monochrome', icon: 'contrast-outline' },
];

const FONT_SIZES: { key: FontSize; label: string }[] = [
  { key: 'small', label: t('settings.fontSmall') },
  { key: 'medium', label: t('settings.fontMedium') },
  { key: 'large', label: t('settings.fontLarge') },
];

const BUBBLE_STYLES: { key: BubbleStyle; label: string; icon: string }[] = [
  { key: 'default', label: t('settings.bubbleDefault'), icon: 'chatbubbles-outline' },
  { key: 'rounded', label: t('settings.bubbleRounded'), icon: 'chatbubble-ellipses-outline' },
  { key: 'compact', label: t('settings.bubbleCompact'), icon: 'chatbox-outline' },
];

const BACKGROUND_STYLES: { key: BackgroundStyle; label: string; icon: string }[] = [
  { key: 'tech', label: t('settings.bgTech'), icon: 'grid-outline' },
  { key: 'minimal', label: t('settings.bgMinimal'), icon: 'remove-outline' },
  { key: 'gradient', label: t('settings.bgGradient'), icon: 'color-wand-outline' },
  { key: 'solid', label: t('settings.bgSolid'), icon: 'square-outline' },
];

const SettingsScreen = () => {
  const { isDark, toggleTheme, colors, colorPresetKey, setColorPreset, accentOverride, setAccentOverride } = useTheme();
  const styles = globalStyles(colors);
  const [identity, setIdentity] = useState<{ username: string; avatarUri?: string | null; displayName?: string } | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [accentInput, setAccentInput] = useState(accentOverride || '');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const ident = await getLocalIdentity();
    setIdentity(ident);
    const s = await getSettings();
    setSettings(s);
    setAccentInput(s.accentColor || '');
  };

  const handleDeleteIdentity = () => {
    Alert.alert(
      t('settings.deleteIdentity'),
      t('settings.deleteIdentityConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteLocalIdentity();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const handleSettingChange = async (key: keyof UserSettings, value: any) => {
    await updateSettings({ [key]: value });
    const s = await getSettings();
    setSettings(s);
  };

  const displayName = identity?.displayName || `@${identity?.username || ''}`;

  const renderIconBox = (icon: string, colorOverride?: string) => (
    <View style={{
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: (colorOverride || colors.accent) + '15',
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Ionicons name={icon as any} size={16} color={colorOverride || colors.accent} />
    </View>
  );

  if (!settings) return null;

  return (
    <View style={styles.container}>
      <TechBackground density="low" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <TouchableOpacity
          style={[styles.glassPanelGlow, { margin: 16, marginTop: 24 }]}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {identity?.avatarUri ? (
              <Image
                source={{ uri: identity.avatarUri }}
                style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.accent + '40' }}
              />
            ) : (
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: colors.accent + '20',
                justifyContent: 'center', alignItems: 'center',
                borderWidth: 1, borderColor: colors.accent + '40',
              }}>
                <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '300' }}>
                  {displayName.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.bodyText, { fontSize: 16 }]}>{displayName}</Text>
              <Text style={[styles.captionText, { marginTop: 2 }]}>
                {t('settings.viewProfile')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Theme / Appearance */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.appearance')}</Text>
          <View style={styles.accentLine} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {renderIconBox(isDark ? 'moon' : 'sunny')}
              <View>
                <Text style={styles.bodyText}>{t('settings.darkTheme')}</Text>
                <Text style={styles.captionText}>{isDark ? t('common.on') : t('common.off')}</Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.accent + '60' }}
              thumbColor={isDark ? colors.accent : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Color Presets */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.colorPreset')}</Text>
          <View style={styles.accentLine} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {PRESET_NAMES.map((preset) => {
              const active = colorPresetKey === preset.key;
              const p = colorPresets.find(cp => cp.key === preset.key);
              const previewColor = isDark ? p?.dark.accent : p?.light.accent;
              return (
                <TouchableOpacity
                  key={preset.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: active ? (previewColor || colors.accent) + '20' : colors.glass,
                    borderWidth: 1,
                    borderColor: active ? (previewColor || colors.accent) : colors.border,
                  }}
                  onPress={() => setColorPreset(preset.key)}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: previewColor || colors.accent }} />
                  <Text style={[styles.bodyText, { fontSize: 13, color: active ? (previewColor || colors.accent) : colors.primary }]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Custom accent color */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.accentColor')}</Text>
          <View style={styles.accentLine} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <TextInput
              style={[{
                flex: 1, borderRadius: 10, padding: 10, fontSize: 14,
                color: colors.text, backgroundColor: colors.glass,
                borderWidth: 0.5, borderColor: colors.border,
              }]}
              placeholder="#HEX or empty"
              placeholderTextColor={colors.textSecondary}
              value={accentInput}
              onChangeText={setAccentInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                backgroundColor: colors.accent + '20',
              }}
              onPress={() => {
                const val = accentInput.trim();
                if (!val) {
                  setAccentOverride(null);
                  setAccentInput('');
                } else if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                  setAccentOverride(val);
                } else {
                  Alert.alert(t('common.error'), t('settings.accentColorInvalid'));
                }
              }}
            >
              <Text style={[styles.bodyText, { fontSize: 13, color: colors.accent }]}>{t('common.apply')}</Text>
            </TouchableOpacity>
            {accentOverride && (
              <TouchableOpacity
                onPress={() => { setAccentOverride(null); setAccentInput(''); }}
              >
                <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {accentOverride && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: accentOverride }} />
              <Text style={[styles.captionText, { fontSize: 11 }]}>{accentOverride}</Text>
            </View>
          )}
        </View>

        {/* Chat appearance */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.chatAppearance')}</Text>
          <View style={styles.accentLine} />

          {/* Bubble style */}
          <Text style={[styles.captionText, { marginTop: 12, marginBottom: 8 }]}>{t('settings.bubbleStyle')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {BUBBLE_STYLES.map((bs) => {
              const active = settings.bubbleStyle === bs.key;
              return (
                <TouchableOpacity
                  key={bs.key}
                  style={{
                    flex: 1, alignItems: 'center', gap: 4,
                    paddingVertical: 10, borderRadius: 12,
                    backgroundColor: active ? colors.accent + '20' : colors.glass,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                  }}
                  onPress={() => handleSettingChange('bubbleStyle', bs.key)}
                  activeOpacity={0.7}
                >
                  {renderIconBox(bs.icon)}
                  <Text style={[styles.captionText, { fontSize: 10, textAlign: 'center', color: active ? colors.accent : colors.primary }]}>{bs.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Font size */}
          <Text style={[styles.captionText, { marginTop: 16, marginBottom: 8 }]}>{t('settings.fontSize')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {FONT_SIZES.map((fs) => {
              const active = settings.fontSize === fs.key;
              const sizeMap = { small: 12, medium: 15, large: 18 };
              return (
                <TouchableOpacity
                  key={fs.key}
                  style={{
                    flex: 1, alignItems: 'center', gap: 4,
                    paddingVertical: 12, borderRadius: 12,
                    backgroundColor: active ? colors.accent + '20' : colors.glass,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                  }}
                  onPress={() => handleSettingChange('fontSize', fs.key)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: sizeMap[fs.key], color: active ? colors.accent : colors.primary }}>A</Text>
                  <Text style={[styles.captionText, { fontSize: 10, color: active ? colors.accent : colors.primary }]}>{fs.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Show message time */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {renderIconBox('time-outline')}
              <View>
                <Text style={styles.bodyText}>{t('settings.showMessageTime')}</Text>
                <Text style={styles.captionText}>{t('settings.showMessageTimeDesc')}</Text>
              </View>
            </View>
            <Switch
              value={settings.showMessageTime}
              onValueChange={(v) => handleSettingChange('showMessageTime', v)}
              trackColor={{ false: colors.border, true: colors.accent + '60' }}
              thumbColor={settings.showMessageTime ? colors.accent : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Background style */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.backgroundStyle')}</Text>
          <View style={styles.accentLine} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {BACKGROUND_STYLES.map((bg) => {
              const active = settings.backgroundStyle === bg.key;
              return (
                <TouchableOpacity
                  key={bg.key}
                  style={{
                    flex: 1, alignItems: 'center', gap: 4,
                    paddingVertical: 10, borderRadius: 12,
                    backgroundColor: active ? colors.accent + '20' : colors.glass,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                  }}
                  onPress={() => handleSettingChange('backgroundStyle', bg.key)}
                  activeOpacity={0.7}
                >
                  {renderIconBox(bg.icon)}
                  <Text style={[styles.captionText, { fontSize: 10, textAlign: 'center', color: active ? colors.accent : colors.primary }]}>{bg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notifications */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.notifications')}</Text>
          <View style={styles.accentLine} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {renderIconBox('notifications-outline')}
              <View>
                <Text style={styles.bodyText}>{t('settings.notificationsEnabled')}</Text>
                <Text style={styles.captionText}>{t('settings.notificationsEnabledDesc')}</Text>
              </View>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => handleSettingChange('notificationsEnabled', v)}
              trackColor={{ false: colors.border, true: colors.accent + '60' }}
              thumbColor={settings.notificationsEnabled ? colors.accent : '#f4f3f4'}
            />
          </View>

          {settings.notificationsEnabled && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {renderIconBox('musical-notes-outline')}
                  <Text style={styles.bodyText}>{t('settings.notifSound')}</Text>
                </View>
                <Switch
                  value={settings.notificationSound}
                  onValueChange={(v) => handleSettingChange('notificationSound', v)}
                  trackColor={{ false: colors.border, true: colors.accent + '60' }}
                  thumbColor={settings.notificationSound ? colors.accent : '#f4f3f4'}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {renderIconBox('phone-portrait-outline')}
                  <Text style={styles.bodyText}>{t('settings.notifVibration')}</Text>
                </View>
                <Switch
                  value={settings.notificationVibration}
                  onValueChange={(v) => handleSettingChange('notificationVibration', v)}
                  trackColor={{ false: colors.border, true: colors.accent + '60' }}
                  thumbColor={settings.notificationVibration ? colors.accent : '#f4f3f4'}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {renderIconBox('eye-outline')}
                  <View>
                    <Text style={styles.bodyText}>{t('settings.notifPreview')}</Text>
                    <Text style={styles.captionText}>{t('settings.notifPreviewDesc')}</Text>
                  </View>
                </View>
                <Switch
                  value={settings.notificationPreview}
                  onValueChange={(v) => handleSettingChange('notificationPreview', v)}
                  trackColor={{ false: colors.border, true: colors.accent + '60' }}
                  thumbColor={settings.notificationPreview ? colors.accent : '#f4f3f4'}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {renderIconBox('chatbubbles-outline')}
                  <Text style={styles.bodyText}>{t('settings.notifGroup')}</Text>
                </View>
                <Switch
                  value={settings.notificationGroup}
                  onValueChange={(v) => handleSettingChange('notificationGroup', v)}
                  trackColor={{ false: colors.border, true: colors.accent + '60' }}
                  thumbColor={settings.notificationGroup ? colors.accent : '#f4f3f4'}
                />
              </View>
            </>
          )}
        </View>

        {/* Language */}
        <View style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}>
          <Text style={styles.title}>{t('settings.language')}</Text>
          <View style={styles.accentLine} />
          <TouchableOpacity
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}
            onPress={() => setShowLanguagePicker(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {renderIconBox('language-outline')}
              <View>
                <Text style={styles.bodyText}>{t('settings.language')}</Text>
                <Text style={styles.captionText}>{t('settings.languageDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Modal visible={showLanguagePicker} transparent animationType="fade" onRequestClose={() => setShowLanguagePicker(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setShowLanguagePicker(false)}>
            <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingBottom: 40, paddingHorizontal: 16 }} onPress={() => {}}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textSecondary + '40', marginBottom: 12 }} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary }}>{t('settings.chooseLanguage')}</Text>
              </View>
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12,
                  borderRadius: 12, marginBottom: 8, borderWidth: 1,
                  borderColor: getCurrentLanguage() === 'en' ? colors.accent : colors.border,
                  backgroundColor: getCurrentLanguage() === 'en' ? colors.accent + '10' : 'transparent',
                }}
                onPress={() => { setLanguage('en'); setShowLanguagePicker(false); }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 16, color: colors.accent, fontWeight: '600' }}>EN</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: colors.primary }}>{t('settings.languageEnglish')}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>English</Text>
                </View>
                {getCurrentLanguage() === 'en' && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12,
                  borderRadius: 12, marginBottom: 8, borderWidth: 1,
                  borderColor: getCurrentLanguage() === 'ru' ? colors.accent : colors.border,
                  backgroundColor: getCurrentLanguage() === 'ru' ? colors.accent + '10' : 'transparent',
                }}
                onPress={() => { setLanguage('ru'); setShowLanguagePicker(false); }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 16, color: colors.accent, fontWeight: '600' }}>RU</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: colors.primary }}>{t('settings.languageRussian')}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Русский</Text>
                </View>
                {getCurrentLanguage() === 'ru' && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 12, paddingHorizontal: 32 }}
                onPress={() => setShowLanguagePicker(false)}
              >
                <Text style={{ fontSize: 15, color: colors.textSecondary }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Security */}
        <TouchableOpacity
          style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}
          onPress={() => router.push('../security')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {renderIconBox('shield-checkmark')}
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyText}>{t('settings.security')}</Text>
              <Text style={styles.captionText}>{t('security.encryptionKeys')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* About */}
        <TouchableOpacity
          style={[styles.glassPanel, { margin: 16, marginTop: 0 }]}
          onPress={() => router.push('../about')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {renderIconBox('information-circle-outline')}
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyText}>{t('settings.about')}</Text>
              <Text style={styles.captionText}>{t('settings.aboutCaption')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Danger Zone */}
        <View style={{ marginTop: 24, paddingHorizontal: 16, gap: 8 }}>
          <TouchableOpacity
            style={[styles.glassPanel, { margin: 0 }]}
            onPress={handleDeleteIdentity}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.bodyText, { color: colors.danger }]}>{t('settings.deleteIdentity')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.glassPanel, { margin: 0 }]}
            onPress={() => {
              Alert.alert(t('settings.clearData'), t('settings.clearDataConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.clearData'),
                  style: 'destructive',
                  onPress: async () => {
                    await clearAllData();
                    Alert.alert(t('common.done'), t('settings.clearDataDone'));
                  }
                },
              ]);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.bodyText, { color: colors.danger }]}>{t('settings.clearData')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 40 }}>
          <Text style={[styles.captionText, { fontSize: 11 }]}>
            {t('settings.version')}
          </Text>
          <Text style={[styles.captionText, { fontSize: 10, opacity: 0.6, marginTop: 4 }]}>
            {t('app.tagline')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default SettingsScreen;
