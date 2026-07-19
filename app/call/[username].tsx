import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { callService, CallState } from '../../src/services/callService';
import { getLocalIdentity } from '../../src/services/identity';
import { t } from '../../src/services/i18n';

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const CallScreen = () => {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [callState, setCallState] = useState<CallState>('idle');
  const [peerUsername, setPeerUsername] = useState(username || '');
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [myUsername, setMyUsername] = useState('');
  const [isIncoming, setIsIncoming] = useState(false);
  const [isRinging, setIsRinging] = useState(false);

  const callInfoRef = useRef<CallState>('idle');

  useEffect(() => {
    getLocalIdentity().then(id => {
      if (id) setMyUsername(id.username);
    });
  }, []);

  useEffect(() => {
    const initial = callService.getState();
    if (initial.state !== 'idle') {
      setCallState(initial.state);
      setPeerUsername(initial.peerUsername);
      setCallDuration(initial.duration);
      setIsSpeakerOn(initial.isSpeakerOn);
      setIsMuted(initial.isMuted);
      if (initial.state === 'incoming') {
        setIsIncoming(true);
        callService.playRingtone();
        callService.sendRinging();
        setIsRinging(true);
      }
      callInfoRef.current = initial.state;
    } else if (username) {
      setIsIncoming(false);
      setCallState('calling');
      callService.initiateCall(username).then(success => {
        if (!success) {
          router.back();
        }
      });
    }

    const unsubState = callService.onStateChange((info) => {
      setCallState(info.state);
      setPeerUsername(info.peerUsername);
      setCallDuration(info.duration);
      setIsSpeakerOn(info.isSpeakerOn);
      setIsMuted(info.isMuted);
      callInfoRef.current = info.state;

      if (info.state === 'incoming') {
        setIsIncoming(true);
        callService.playRingtone();
        callService.sendRinging();
        setIsRinging(true);
      } else if (info.state === 'connected') {
        setIsIncoming(false);
        callService.stopRingtone();
        setIsRinging(false);
      } else if (info.state === 'ended') {
        callService.stopRingtone();
        setIsRinging(false);
        setTimeout(() => {
          if (router.canGoBack()) {
            router.back();
          }
        }, 2000);
      }
    });

    const unsubAction = callService.onCallAction((action, data) => {
      if (action === 'incoming_call' || action === 'call_connected') {
        setIsRinging(false);
      }
    });

    return () => {
      unsubState();
      unsubAction();
      if (callInfoRef.current === 'calling' || callInfoRef.current === 'connected') {
        callService.endCall();
      }
      callService.stopRingtone();
    };
  }, [username]);

  const handleAccept = async () => {
    await callService.acceptCall();
  };

  const handleReject = () => {
    callService.stopRingtone();
    callService.rejectCall();
    router.back();
  };

  const handleEnd = () => {
    callService.stopRingtone();
    callService.endCall();
    router.back();
  };

  const handleToggleSpeaker = () => {
    callService.toggleSpeaker();
  };

  const handleToggleMute = () => {
    callService.toggleMute();
  };

  const displayName = peerUsername ? `@${peerUsername}` : '';

  const stateText = () => {
    switch (callState) {
      case 'calling': return t('call.calling');
      case 'incoming': return '';
      case 'connected': return formatDuration(callDuration);
      case 'ended': return t('call.ended');
      default: return '';
    }
  };

  const statusColor = callState === 'connected' ? '#4CAF50' : colors.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: '#0A0A0A' }]}>
      <StatusBar barStyle="light-content" />

      {/* Background lines */}
      <View style={styles.bgContainer} pointerEvents="none">
        <View style={[styles.bgLine, { top: '20%', backgroundColor: colors.accent + '08', width: '60%' }]} />
        <View style={[styles.bgLine, { top: '50%', backgroundColor: colors.accent + '06', width: '80%', left: '10%' }]} />
        <View style={[styles.bgLine, { top: '75%', backgroundColor: colors.accent + '05', width: '40%', right: '5%' }]} />
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleEnd} style={styles.headerBack}>
          <Ionicons name="chevron-down" size={28} color="#FFF" />
        </TouchableOpacity>
        {callState !== 'incoming' && callState !== 'idle' && (
          <View style={styles.connectionInfo}>
            <Text style={[styles.connectionText, { color: statusColor }]}>
              {callState === 'connected' ? t('call.connected') : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Caller info */}
      <View style={styles.callerInfo}>
        <View style={[styles.avatar, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>
            {(displayName || '?').replace('@', '').substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.callerName}>{displayName}</Text>
        <Text style={[styles.callerStatus, { color: statusColor }]}>
          {stateText()}
        </Text>
      </View>

      {/* Incoming call buttons */}
      {(callState === 'incoming' || isIncoming) && (
        <View style={styles.incomingButtons}>
          <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
            <View style={[styles.buttonCircle, { backgroundColor: '#D32F2F' }]}>
              <Ionicons name="close" size={32} color="#FFF" />
            </View>
            <Text style={styles.buttonLabel}>{t('call.decline')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <View style={[styles.buttonCircle, { backgroundColor: '#4CAF50' }]}>
              <Ionicons name="call" size={32} color="#FFF" />
            </View>
            <Text style={styles.buttonLabel}>{t('call.accept')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active call buttons */}
      {(callState === 'connected' || callState === 'calling') && !isIncoming && (
        <View style={styles.activeButtons}>
          <View style={styles.activeButtonRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleToggleMute}>
              <View style={[styles.actionCircle, { backgroundColor: isMuted ? colors.accent : 'rgba(255,255,255,0.1)' }]}>
                <Ionicons name={isMuted ? 'mic-off' : 'mic-outline'} size={24} color="#FFF" />
              </View>
              <Text style={styles.actionLabel}>{isMuted ? t('call.unmute') : t('call.mute')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleToggleSpeaker}>
              <View style={[styles.actionCircle, { backgroundColor: isSpeakerOn ? colors.accent : 'rgba(255,255,255,0.1)' }]}>
                <Ionicons name={isSpeakerOn ? 'volume-high' : 'volume-low-outline'} size={24} color="#FFF" />
              </View>
              <Text style={styles.actionLabel}>{isSpeakerOn ? t('call.speakerOff') : t('call.speaker')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.endCallButton} onPress={handleEnd}>
            <View style={[styles.buttonCircle, { backgroundColor: '#D32F2F' }]}>
              <Ionicons name="call" size={32} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </View>
            <Text style={styles.buttonLabel}>{t('call.end')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ended state */}
      {callState === 'ended' && (
        <View style={styles.endedContainer}>
          <TouchableOpacity style={styles.endCallButton} onPress={() => router.back()}>
            <Text style={[styles.endedClose, { color: colors.accent }]}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgContainer: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
  bgLine: { position: 'absolute', height: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBack: { padding: 8 },
  connectionInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connectionText: { fontSize: 12, fontWeight: '300', letterSpacing: 1 },
  callerInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: -60,
  },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 36, fontWeight: '200', letterSpacing: 2 },
  callerName: { fontSize: 28, fontWeight: '300', color: '#FFF', letterSpacing: 1 },
  callerStatus: { fontSize: 15, fontWeight: '300', letterSpacing: 0.5 },
  incomingButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
    paddingBottom: 80,
    paddingHorizontal: 40,
  },
  rejectButton: { alignItems: 'center', gap: 8 },
  acceptButton: { alignItems: 'center', gap: 8 },
  buttonCircle: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  buttonLabel: { fontSize: 12, color: '#FFF', fontWeight: '300', letterSpacing: 0.5 },
  activeButtons: {
    alignItems: 'center',
    gap: 40,
    paddingBottom: 60,
  },
  activeButtonRow: {
    flexDirection: 'row',
    gap: 50,
  },
  actionButton: { alignItems: 'center', gap: 8 },
  actionCircle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  actionLabel: { fontSize: 11, color: '#FFF', fontWeight: '300', letterSpacing: 0.5 },
  endCallButton: { alignItems: 'center', gap: 8 },
  endedContainer: { alignItems: 'center', paddingBottom: 80 },
  endedClose: { fontSize: 16, fontWeight: '300' },
});

export default CallScreen;
