import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { t } from '../services/i18n';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const finished = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    const timeout = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onFinish();
        });
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Text style={[styles.logo, { color: colors.primary }]}>{t('splash.logo')}</Text>
        <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('splash.tagline')}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: 12,
    textTransform: 'uppercase',
  },
  accentBar: {
    height: 2,
    width: 80,
    alignSelf: 'center',
    marginVertical: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    textAlign: 'center',
    letterSpacing: 4,
  },
});

export default SplashScreen;
