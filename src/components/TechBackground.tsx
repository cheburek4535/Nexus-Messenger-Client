import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { getSettings, BackgroundStyle } from '../services/settingsService';

interface TechBackgroundProps {
  density?: 'low' | 'medium' | 'high';
}

const TechBackground: React.FC<TechBackgroundProps> = ({ density: explicitDensity }) => {
  const { colors } = useTheme();
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>('tech');

  useEffect(() => {
    getSettings().then(s => setBgStyle(s.backgroundStyle));
  }, []);

  const density = explicitDensity || (bgStyle === 'minimal' ? 'low' : bgStyle === 'solid' ? 'low' : 'medium');

  if (bgStyle === 'solid') return null;

  const lines = density === 'high' ? 10 : density === 'medium' ? 6 : 3;
  const circles = density === 'high' ? 6 : density === 'medium' ? 4 : 2;
  const dots = density === 'high' ? 15 : density === 'medium' ? 10 : 5;

  const lineElements = Array.from({ length: lines }).map((_, i) => (
    <View
      key={`l-${i}`}
      style={[bgStyles.line, {
        top: `${10 + (i * 80) / lines}%`,
        width: `${40 + Math.random() * 40}%`,
        left: `${Math.random() * 20}%`,
        backgroundColor: colors.accent + '08',
      }]}
    />
  ));

  const circleElements = Array.from({ length: circles }).map((_, i) => {
    const size = 80 + Math.random() * 160;
    return (
      <View
        key={`c-${i}`}
        style={[bgStyles.circle, {
          top: `${10 + Math.random() * 70}%`,
          left: `${5 + Math.random() * 65}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.accent + '10',
        }]}
      />
    );
  });

  const dotElements = Array.from({ length: dots }).map((_, i) => (
    <View
      key={`d-${i}`}
      style={[bgStyles.dot, {
        top: `${5 + Math.random() * 90}%`,
        left: `${5 + Math.random() * 80}%`,
        backgroundColor: colors.accent + '15',
      }]}
    />
  ));

  return (
    <View style={bgStyles.container} pointerEvents="none">
      {lineElements}
      {circleElements}
      {dotElements}
    </View>
  );
};

const bgStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
  line: { position: 'absolute', height: 1 },
  circle: { position: 'absolute', borderWidth: 1 },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
});

export default TechBackground;
