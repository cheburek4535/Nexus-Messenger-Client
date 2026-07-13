import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../services/i18n';

export interface ActionSheetOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

export const REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '😮'];

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onCancel: () => void;
  reactions?: boolean;
  selectedReaction?: string | null;
  onReaction?: (emoji: string) => void;
}

const ActionSheet = ({ visible, title, options, onCancel, reactions, selectedReaction, onReaction }: ActionSheetProps) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {title && (
            <>
              <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>
              <View style={[styles.divider, { backgroundColor: colors.accent }]} />
            </>
          )}
          {reactions && onReaction && (
            <>
              <View style={styles.reactionRow}>
                {REACTION_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.reactionBtn,
                      {
                        backgroundColor: selectedReaction === emoji ? colors.accent + '20' : 'transparent',
                        borderColor: selectedReaction === emoji ? colors.accent : colors.border,
                      }
                    ]}
                    onPress={() => onReaction(emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </>
          )}
          {options.map((opt, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.option, idx < options.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border + '40' }]}
              onPress={() => { opt.onPress(); onCancel(); }}
              activeOpacity={0.6}
            >
              {opt.icon && (
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={opt.destructive ? '#D32F2F' : colors.accent}
                  style={styles.optionIcon}
                />
              )}
              <Text style={[styles.optionText, {
                color: opt.destructive ? '#D32F2F' : colors.primary,
              }]}>
                {opt.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary + '40'} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.cancelButton, { borderTopWidth: 0.5, borderTopColor: colors.border }]}
            onPress={onCancel}
            activeOpacity={0.6}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  reactionRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 8, marginBottom: 4,
  },
  reactionBtn: {
    width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 22 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    width: 30,
    alignSelf: 'center',
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  optionIcon: {
    marginRight: 14,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
});

export default ActionSheet;
