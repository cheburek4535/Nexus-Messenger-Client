import React, { useEffect, useState, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { AppState, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme, ThemeProvider } from '../src/theme/ThemeContext';
import SplashScreen from '../src/components/SplashScreen';
import { checkProfileExists } from '../src/utils/storage';
import { getLocalIdentity, deleteLocalIdentity } from '../src/services/identity';
import { wsManager } from '../src/services/websocket';
import { getDatabase } from '../src/database/connection';
import { startAutoDeleteScheduler } from '../src/services/autoDeleteService';
import { StatusBar } from 'expo-status-bar';
import { ghostChatManager } from '../src/services/ghostChatManager';
import {
  initializeNotifications,
  registerPushToken,
  setupNotificationResponseHandler,
} from '../src/services/notifications';
import { loadSavedLanguage } from '../src/services/i18n';

const GHOST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const RootNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const { colors, isDark } = useTheme();
  const backgroundTimestamp = useRef(0);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('Initializing database...');
        await getDatabase();
        setIsDbReady(true);
        console.log('Database ready');

        await loadSavedLanguage();

        let identity = await checkProfileExists();
        if (identity) {
          const full = await getLocalIdentity();
          if (!full) {
            console.warn('⚠️ checkProfileExists passed but getLocalIdentity returned null — identity corrupted, cleaning up');
            await deleteLocalIdentity();
            identity = false;
          }
        }
        console.log('Profile exists:', identity);
        setHasProfile(identity);
      } catch (error) {
        console.error('Initialization error:', error);
        setIsDbReady(true);
        setHasProfile(false);
      }
    };
    init();

    const safetyTimer = setTimeout(() => {
      setIsDbReady(true);
    }, 5000);

    return () => clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    if (!hasProfile || !isDbReady) return;

    console.log('🌐 Setting up ghost chat manager');
    ghostChatManager.init();
    const unsub = ghostChatManager.on('invitation', (inv) => {
      router.push(`/ghost-invite-received?id=${inv.id}&from=${inv.fromUser}&snapshots=${inv.snapshotsAllowed}&createdAt=${inv.createdAt}`);
    });

	console.log('🌐 Connecting WebSocket (auto-registers if needed)');
    wsManager.connect();
    startAutoDeleteScheduler();

    initializeNotifications().then(() => {
      registerPushToken().catch(() => {});
    });
    setupNotificationResponseHandler();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('App state:', nextAppState);
      if (nextAppState === 'active') {
        wsManager.connect();
        ghostChatManager.restoreGhostChatsOnAppForeground();

        if (backgroundTimestamp.current > 0) {
          const elapsed = Date.now() - backgroundTimestamp.current;
          if (elapsed > GHOST_TIMEOUT_MS) {
            console.log('Ghost chats timed out, ending all sessions');
            ghostChatManager.clearAllGhostChats();
          }
        }
        backgroundTimestamp.current = 0;
      }
      if (nextAppState === 'background') {
        backgroundTimestamp.current = Date.now();
        ghostChatManager.endGhostChatOnAppBackground();
      }
    });

    return () => {
      subscription.remove();
      unsub();
    };
  }, [hasProfile, isDbReady]);

  if (isLoading || !isDbReady || hasProfile === null) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SplashScreen onFinish={() => setIsLoading(false)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          >
            {!hasProfile ? (
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            ) : (
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            )}
          </Stack>
        </View>
      </GestureHandlerRootView>
    </>
  );
};

const RootLayout = () => {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
};

export default RootLayout;
