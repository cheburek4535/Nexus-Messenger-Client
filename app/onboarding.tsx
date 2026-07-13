import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { createLocalIdentity } from '../src/services/identity';
import { registerOnServer } from '../src/services/api';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../src/services/i18n';

const OnboardingScreen = () => {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'creating' | 'done'>('input');

  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const validateUsername = (name: string): string | null => {
    const trimmed = name.trim().toLowerCase();
    if (trimmed.length < 3) return t('onboarding.usernameMinLength');
    if (trimmed.length > 30) return t('onboarding.usernameMaxLength');
    if (!/^[a-z0-9._-]+$/.test(trimmed)) return t('onboarding.usernameInvalidChars');
    return null;
  };

  const handleCreateIdentity = async () => {
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsChecking(true);
    setStep('creating');

    // Анимация прогресса
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();

    try {
  console.log('Creating local identity...');
  const identity = await createLocalIdentity(username.trim().toLowerCase());
  console.log('Local identity created:', identity?.username);

  console.log('Starting server registration...');
  const result = await registerOnServer();
  console.log('Server registration result:', result);

  if (!result.success) {
    console.warn('Server registration warning:', result.error);
  }
} catch (e) {
  console.warn('Registration error (continuing offline):', e);
}

setStep('done');
setTimeout(() => {
  router.replace('/(tabs)');
}, 1500);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Заголовок */}
        <Text style={[styles.logoText, { color: colors.primary }]}>NEXUS</Text>
        <View style={[styles.divider, { backgroundColor: colors.accent }]} />

        {step === 'input' && (
          <>
            <Text style={[styles.title, { color: colors.primary }]}>
              {t('onboarding.chooseIdentity')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('onboarding.noEmailPhone')}
            </Text>

            <View style={[styles.inputContainer, { borderColor: error ? '#D32F2F' : colors.border }]}>
              <Text style={[styles.atSign, { color: colors.textSecondary }]}>@</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder={t('onboarding.usernamePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={username}
                onChangeText={(text) => {
                  setUsername(text.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                editable={!isChecking}
              />
            </View>

            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color="#D32F2F" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: username.length >= 3 ? colors.accent : colors.border },
              ]}
              onPress={handleCreateIdentity}
              disabled={username.length < 3 || isChecking}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>{t('onboarding.createIdentity')}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </>
        )}

        {step === 'creating' && (
          <>
            <Text style={[styles.creatingTitle, { color: colors.primary }]}>
              {t('onboarding.generatingKeys')}
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: progressWidth.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={[styles.creatingSubtext, { color: colors.textSecondary }]}>
              {t('onboarding.creatingIdentity')}
            </Text>
          </>
        )}

        {step === 'done' && (
          <>
            <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
            <Text style={[styles.doneTitle, { color: colors.primary }]}>
              @{username.toLowerCase().trim()}
            </Text>
            <Text style={[styles.doneSubtext, { color: colors.textSecondary }]}>
              {t('onboarding.identityReady')}
            </Text>
          </>
        )}
      </Animated.View>

      {/* Тонкая линия внизу */}
      <View style={[styles.bottomLine, { backgroundColor: colors.accent, opacity: 0.3 }]} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '80%',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 36,
    fontWeight: '200',
    letterSpacing: 10,
    textTransform: 'uppercase',
  },
  divider: {
    height: 2,
    width: 60,
    marginVertical: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  atSign: {
    fontSize: 20,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 16,
    fontWeight: '300',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  creatingTitle: {
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 2,
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
  },
  creatingSubtext: {
    fontSize: 12,
    fontWeight: '300',
    letterSpacing: 1,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 16,
  },
  doneSubtext: {
    fontSize: 14,
    fontWeight: '300',
    marginTop: 8,
  },
  bottomLine: {
    position: 'absolute',
    bottom: 60,
    width: 100,
    height: 1,
  },
});

export default OnboardingScreen;