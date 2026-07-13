import React from 'react';
import { TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

interface ScrollToBottomButtonProps {
  onPress: () => void;
  visible: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  onPress,
  visible,
  accessibilityLabel = 'Scroll to bottom',
  testID = 'scroll-to-bottom-button',
}) => {
  const { colors } = useTheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  const buttonStyle = {
    opacity: fadeAnim,
    transform: [{ scale: scaleAnim }],
  };

  return (
    <Animated.View style={[styles.container, buttonStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.button, { backgroundColor: colors.surface + 'E0', borderColor: colors.accent + '40' }]}
        activeOpacity={0.7}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Animated.View
          style={{
            transform: [{ rotate: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }],
          }}
        >
          <Ionicons name="chevron-down" size={24} color={colors.accent} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    zIndex: 100,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
});

export default ScrollToBottomButton;