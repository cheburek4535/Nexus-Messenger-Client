import { StyleSheet, Platform } from 'react-native';
import { ThemeColors } from './ThemeContext';

export const globalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    glassPanel: {
      backgroundColor: colors.glass,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      ...(Platform.OS === 'web'
        ? { backdropFilter: 'blur(12px)' }
        : {}),
    },
    glassPanelGlow: {
      backgroundColor: colors.glass,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.accent + '30',
      padding: 20,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: '200',
      color: colors.primary,
      letterSpacing: 2,
    },
    bodyText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '300',
    },
    captionText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '300',
      letterSpacing: 0.5,
    },
    accentLine: {
      height: 1.5,
      width: 40,
      backgroundColor: colors.accent,
      marginVertical: 12,
    },
    glowLine: {
      height: 1.5,
      width: 60,
      backgroundColor: colors.accent,
      marginVertical: 12,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 2,
    },
    futuristicCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    futuristicButton: {
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.accent,
    },
    futuristicButtonOutline: {
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    input: {
      fontSize: 15,
      fontWeight: '300',
      lineHeight: 20,
      paddingTop: 0,
      paddingBottom: 0,
    },
  });