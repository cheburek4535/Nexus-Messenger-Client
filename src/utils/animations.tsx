import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, Pressable } from 'react-native';

export const FadeInView = ({ children, delay = 0, duration = 250, style }: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: any;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

export const PressScale = React.memo(({ children, scaleTo = 0.97, style, onPress, onLongPress, delayLongPress, ...props }: {
  children: React.ReactNode;
  scaleTo?: number;
  style?: any;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  [key: string]: any;
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleTo,
      friction: 8,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [scaleTo, scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 8,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={style}
      {...props}
    >
      <Animated.View style={[{ transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
});
