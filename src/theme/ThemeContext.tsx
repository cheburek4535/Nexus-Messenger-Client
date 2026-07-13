import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { colorPresets, Palette, ColorPresetKey } from './colorPresets';
import { loadSettings, onSettingsChange, getCachedSettings, updateSettings } from '../services/settingsService';

export type ThemeColors = Palette;

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  colorPresetKey: ColorPresetKey;
  setColorPreset: (key: ColorPresetKey) => void;
  accentOverride: string | null;
  setAccentOverride: (color: string | null) => void;
  computeColors: Palette;
}

const defaultPalette = colorPresets[0].dark;

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: defaultPalette,
  toggleTheme: () => {},
  colorPresetKey: 'default',
  setColorPreset: () => {},
  accentOverride: null,
  setAccentOverride: () => {},
  computeColors: defaultPalette,
});

function applyAccentOverride(palette: Palette, override: string | null): Palette {
  if (!override) return palette;
  return { ...palette, accent: override, accentGlow: override + '80' };
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [colorPresetKey, setColorPresetKey] = useState<ColorPresetKey>('default');
  const [accentOverride, setAccentOverride] = useState<string | null>(null);

  useEffect(() => {
    init();
    const unsubscribe = onSettingsChange(() => {
      const s = getCachedSettings();
      setIsDark(s.theme === 'dark');
      setColorPresetKey(s.colorPreset);
      setAccentOverride(s.accentColor);
    });
    return unsubscribe;
  }, []);

  const init = async () => {
    const settings = await loadSettings();
    setIsDark(settings.theme === 'dark');
    setColorPresetKey(settings.colorPreset);
    setAccentOverride(settings.accentColor);
    setIsLoaded(true);
  };

  const toggleTheme = async () => {
    const newValue = !isDark;
    setIsDark(newValue);
    await updateSettings({ theme: newValue ? 'dark' : 'light' });
  };

  const setColorPreset = async (key: ColorPresetKey) => {
    setColorPresetKey(key);
    await updateSettings({ colorPreset: key });
  };

  const setAccentOverrideFn = async (color: string | null) => {
    setAccentOverride(color);
    await updateSettings({ accentColor: color });
  };

  const computeColors = useMemo(() => {
    const preset = colorPresets.find(p => p.key === colorPresetKey) || colorPresets[0];
    const palette = isDark ? preset.dark : preset.light;
    return applyAccentOverride(palette, accentOverride);
  }, [isDark, colorPresetKey, accentOverride]);

  const colors = computeColors;

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{
      isDark,
      colors,
      toggleTheme,
      colorPresetKey,
      setColorPreset,
      accentOverride,
      setAccentOverride: setAccentOverrideFn,
      computeColors,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);