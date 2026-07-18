import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Dimensions,
  StatusBar,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { getLocalIdentity } from '../../src/services/identity';
import {
  createOrGetChat,
  getChatByUsername,
  Chat,
  setAutoDeleteTimer,
  deleteChat,
  blockUser,
} from '../../src/services/chatService';
import {
  sendMessage,
  getMessages,
  saveIncomingMessage,
  Message,
  deleteMessage,
  updateMessageStatus,
  updateMessageId,
} from '../../src/services/messageService';
import { sendMessageToServer, getUserProfile } from '../../src/services/api';
import { wsManager } from '../../src/services/websocket';
import { ghostChatManager } from '@/src/services/ghostChatManager';
import ActionSheet, { ActionSheetOption } from '@/src/components/ActionSheet';
import { upsertContact, syncChatsWithContacts, getContact } from '@/src/services/contactService';
import { t } from '../../src/services/i18n';
import { toggleReaction, getMyReaction } from '../../src/services/reactionsService';
import { setPendingForward } from '../../src/services/forwardService';
import { getCachedMessages, setCachedMessages, appendMessage, updateMessageInCache, removeMessageFromCache } from '../../src/services/messageCache';
import { FadeInView } from '../../src/utils/animations';
import { downloadFile } from '../../src/utils/downloadFile';
import { useChatScroll } from '../../src/hooks/useChatScroll';
import ScrollToBottomButton from '../../src/components/ui/ScrollToBottomButton';
import MediaViewer from '../../src/components/ui/MediaViewer';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ChatBackground = ({ colors }: { colors: any }) => (
  <View style={backgroundStyles.container} pointerEvents="none">
    <View style={[backgroundStyles.line, { top: '15%', backgroundColor: colors.accent + '10', width: '70%' }]} />
    <View style={[backgroundStyles.line, { top: '35%', backgroundColor: colors.accent + '08', width: '40%', left: '10%' }]} />
    <View style={[backgroundStyles.line, { top: '55%', backgroundColor: colors.accent + '10', width: '60%', right: '5%' }]} />
    <View style={[backgroundStyles.line, { top: '75%', backgroundColor: colors.accent + '06', width: '80%', left: '5%' }]} />
    <View style={[backgroundStyles.circle, { top: '20%', left: '10%', borderColor: colors.accent + '15' }]} />
    <View style={[backgroundStyles.circle, { bottom: '20%', right: '5%', borderColor: colors.accent + '10', width: 150, height: 150, borderRadius: 75 }]} />
    <View style={[backgroundStyles.circle, { top: '60%', left: '60%', borderColor: colors.accent + '08', width: 100, height: 100, borderRadius: 50 }]} />
    <View style={[backgroundStyles.dot, { top: '10%', right: '20%', backgroundColor: colors.accent + '20' }]} />
    <View style={[backgroundStyles.dot, { bottom: '15%', left: '15%', backgroundColor: colors.accent + '15' }]} />
    <View style={[backgroundStyles.dot, { top: '45%', left: '80%', backgroundColor: colors.accent + '10' }]} />
  </View>
);

const backgroundStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
  line: { position: 'absolute', height: 1 },
  circle: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1 },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
});

const ChatHeader = ({ username, displayName, avatarUri, isGhost, onBack, onMinimize, onSettings, onAvatarPress, colors, tz }: any) => {
  const initial = (displayName || username)?.replace('ghost_', '').substring(0, 2).toUpperCase();

  return (
    <View style={[headerStyles.container, {
      backgroundColor: colors.surface + 'F0',
      borderBottomColor: colors.border
    }]}>
      <TouchableOpacity onPress={onBack} style={headerStyles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.accent} />
      </TouchableOpacity>

      <TouchableOpacity style={headerStyles.userInfo} onPress={onAvatarPress}>
        <View style={[headerStyles.avatar, {
          backgroundColor: colors.accent + '15',
          borderColor: colors.accent + '40'
        }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={headerStyles.avatarImage} />
          ) : (
            <Text style={[headerStyles.avatarText, { color: colors.accent }]}>
              {initial}
            </Text>
          )}
        </View>
        <View style={headerStyles.userTextInfo}>
          <View style={headerStyles.nameRow}>
            <Text style={[headerStyles.name, { color: colors.primary }]}>
              {displayName || `@${username?.replace('ghost_', '')}`}
            </Text>
            {isGhost && (
              <View style={[headerStyles.ghostBadge, {
                backgroundColor: colors.accent + '20',
                borderColor: colors.accent + '40'
              }]}>
                <Ionicons name="flash" size={10} color={colors.accent} />
                <Text style={[headerStyles.ghostText, { color: colors.accent }]}>{t('common.ghost')}</Text>
              </View>
            )}
          </View>
          <Text style={[headerStyles.status, { color: colors.textSecondary }]}>
            {(isGhost ? t('chat.ghostStatus') : t('chat.secureStatus')) + ` • ${tz}`}
          </Text>
        </View>
      </TouchableOpacity>

      {isGhost && (
        <TouchableOpacity onPress={onMinimize} style={headerStyles.minimizeButton}>
          <Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onSettings} style={headerStyles.settingsButton}>
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
};

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
  },
  backButton: { padding: 8 },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  avatarText: { fontSize: 15, fontWeight: '300', letterSpacing: 1 },
  avatarImage: { width: 38, height: 38, borderRadius: 19 },
  userTextInfo: { gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '400', letterSpacing: 0.5 },
  ghostBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, borderWidth: 0.5, gap: 3,
  },
  ghostText: { fontSize: 8, fontWeight: '600', letterSpacing: 1 },
  status: { fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
  minimizeButton: { padding: 8 },
  settingsButton: { padding: 8 },
});

const ReplyBar = ({ replyToText, replyToUser, onCancel, colors }: any) => (
  <View style={[replyBarStyles.container, { backgroundColor: colors.accent + '10', borderLeftColor: colors.accent }]}>
    <View style={replyBarStyles.content}>
      <Ionicons name="arrow-undo" size={14} color={colors.accent} />
      <View style={replyBarStyles.info}>
        <Text style={[replyBarStyles.user, { color: colors.accent }]}>{replyToUser}</Text>
        <Text style={[replyBarStyles.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {replyToText || t('chat.mediaFallback')}
        </Text>
      </View>
    </View>
    <TouchableOpacity onPress={onCancel} style={replyBarStyles.cancel}>
      <Ionicons name="close" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  </View>
);

const replyBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    marginHorizontal: 8, marginBottom: 4,
    borderRadius: 12, borderLeftWidth: 3,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1 },
  user: { fontSize: 11, fontWeight: '600' },
  text: { fontSize: 12, fontWeight: '300' },
  cancel: { padding: 4 },
});

const VoicePlayer = ({ uri, colors }: { uri: string; colors: any }) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const togglePlay = async () => {
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          intervalRef.current = setInterval(async () => {
            const s = await soundRef.current!.getStatusAsync();
            if (s.isLoaded) {
              setPosition(s.positionMillis);
              if (s.didJustFinish) {
                setIsPlaying(false);
                setPosition(0);
                if (intervalRef.current) clearInterval(intervalRef.current);
              }
            }
          }, 200);
        }
      } else {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        setIsPlaying(true);
        if (status.isLoaded) setDuration(status.durationMillis || 0);
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded) {
            setPosition(s.positionMillis);
            setDuration(s.durationMillis || 0);
            if (s.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
            }
          }
        });
      }
    } catch (e) {
      console.error('Voice playback error:', e);
    }
  };

  const seek = async (value: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(value);
      setPosition(value);
    }
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={voiceStyles.container}>
      <TouchableOpacity onPress={togglePlay} style={[voiceStyles.playButton, { backgroundColor: colors.accent }]}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#FFF" />
      </TouchableOpacity>
      <View style={voiceStyles.seekContainer}>
        <View style={[voiceStyles.seekTrack, { backgroundColor: colors.border }]}>
          <View style={[voiceStyles.seekFill, { backgroundColor: colors.accent, width: `${Math.max(progress * 100, 2)}%` }]} />
        </View>
        <View style={voiceStyles.timeRow}>
          <Text style={[voiceStyles.timeText, { color: colors.textSecondary }]}>{formatTime(position)}</Text>
          <Text style={[voiceStyles.timeText, { color: colors.textSecondary }]}>{formatTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
};

const voiceStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minWidth: 180 },
  playButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  seekContainer: { flex: 1, gap: 2 },
  seekTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  seekFill: { height: '100%', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontSize: 10, fontWeight: '300', fontVariant: ['tabular-nums'] },
});

const ReactionBar = ({ reactions, colors }: { reactions?: { username: string; reaction: string }[]; colors: any }) => {
  if (!reactions || reactions.length === 0) return null;
  const counts = new Map<string, number>();
  reactions.forEach(r => counts.set(r.reaction, (counts.get(r.reaction) || 0) + 1));
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
      {Array.from(counts.entries()).map(([emoji, count]) => (
        <View key={emoji} style={[localReactStyles.reactionPill, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '30' }]}>
          <Text style={localReactStyles.reactionEmoji}>{emoji}</Text>
          {count > 1 && <Text style={[localReactStyles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>}
        </View>
      ))}
    </View>
  );
};

const localReactStyles = StyleSheet.create({
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 0.5,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 10, fontWeight: '500' },
});

const MessageBubble = ({ message, isMine, colors, isDark, onLongPress, onReply, reactions, onPressMedia }: any) => {
  const getStatusIcon = () => {
    if (!isMine) return null;
    switch (message.status) {
      case 'sending': return <Ionicons name="time-outline" size={12} color={colors.textSecondary} />;
      case 'sent': return <Ionicons name="checkmark-outline" size={12} color={colors.textSecondary} />;
      case 'delivered': return <Ionicons name="checkmark-done-outline" size={12} color={colors.textSecondary} />;
      case 'read': return <Ionicons name="checkmark-done" size={12} color={colors.accent} />;
      case 'failed': return <Ionicons name="alert-circle-outline" size={12} color="#D32F2F" />;
      default: return null;
    }
  };

  const bubbleColor = isMine
    ? isDark ? '#1E3A5F' : colors.accent + '15'
    : colors.surface;

  const renderContent = () => {
    switch (message.contentType) {
      case 'image':
        return (
          <TouchableOpacity onPress={() => onPressMedia?.(message.contentUri!, 'image', message.mediaMimeType, undefined)} activeOpacity={0.9}>
            <Image
              source={{ uri: message.contentUri! }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              contentFit="cover"
            />
          </TouchableOpacity>
        );
      case 'video':
        return (
          <TouchableOpacity onPress={() => onPressMedia?.(message.contentUri!, 'video', message.mediaMimeType, undefined)} activeOpacity={0.9}>
            <Video
              source={{ uri: message.contentUri! }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          </TouchableOpacity>
        );
      case 'voice':
        return (
          <VoicePlayer uri={message.contentUri!} colors={colors} />
        );
      default:
        return (
          <Text style={[bubbleStyles.text, { color: colors.text }]}>
            {message.contentText}
          </Text>
        );
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={() => onLongPress(message)}
      delayLongPress={300}
    >
      <View style={[
        bubbleStyles.container,
        isMine ? bubbleStyles.mine : bubbleStyles.theirs,
        {
          backgroundColor: bubbleColor,
          borderColor: isMine ? (isDark ? '#2B5277' : colors.accent + '30') : colors.border,
        }
      ]}>
        {message.replyToText && (
          <TouchableOpacity onPress={() => onReply?.(message)} style={[bubbleStyles.replyQuote, { backgroundColor: colors.background + '40', borderLeftColor: colors.accent }]}>
            <Text style={[bubbleStyles.replyUser, { color: colors.accent }]}>
              {message.replyToUsername || t('chat.reply')}
            </Text>
            <Text style={[bubbleStyles.replyText, { color: colors.textSecondary }]} numberOfLines={1}>
              {message.replyToText}
            </Text>
          </TouchableOpacity>
        )}
        {message.forwardedFrom && (
          <TouchableOpacity onPress={() => router.push(`/profile/${message.forwardedFrom}` as any)}>
            <Text style={[bubbleStyles.forwardedHeader, { color: colors.accent }]}>
              {t('forward.forwardedFrom', message.forwardedFrom ?? '')}
            </Text>
          </TouchableOpacity>
        )}
        {renderContent()}
        <View style={bubbleStyles.footer}>
          <Text style={[bubbleStyles.time, { color: colors.textSecondary }]}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </Text>
          {getStatusIcon()}
        </View>
        {reactions && reactions.length > 0 && (
          <ReactionBar reactions={reactions} colors={colors} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const bubbleStyles = StyleSheet.create({
  container: { maxWidth: SCREEN_WIDTH * 0.72, padding: 12, paddingBottom: 6, borderRadius: 16, borderWidth: 0.5, marginBottom: 6 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  text: { fontSize: 15, lineHeight: 20, fontWeight: '300' },
  replyQuote: {
    paddingHorizontal: 8, paddingVertical: 4,
    marginBottom: 6, borderRadius: 8,
    borderLeftWidth: 3,
  },
  replyUser: { fontSize: 11, fontWeight: '600', marginBottom: 1 },
  replyText: { fontSize: 12, fontWeight: '300' },
  forwardedHeader: {
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 4,
  },
  mediaImage: { width: 200, height: 200, borderRadius: 12, borderWidth: 0.5, marginBottom: 4 },
  voiceContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  voiceText: { fontSize: 13, fontWeight: '300' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 4 },
  time: { fontSize: 10, letterSpacing: 0.3 },
});

const ChatSettingsPanel = ({ chat, onClose, colors, isGhost, snapshotsAllowed, myUsername }: any) => {
  const [autoDelete, setAutoDelete] = useState(chat?.autoDeleteTimer || 0);
  const autoDeleteOptions = [
    { label: t('chat.never'), value: 0 },
    { label: t('chat.1hour'), value: 3600000 },
    { label: t('chat.6hours'), value: 21600000 },
    { label: t('chat.24hours'), value: 86400000 },
    { label: t('chat.7days'), value: 604800000 },
    { label: t('chat.30days'), value: 2592000000 },
  ];

  const handleSetAutoDelete = async (value: number) => {
    setAutoDelete(value);
    if (chat?.id) await setAutoDeleteTimer(chat.id, value);
  };

  return (
    <TouchableOpacity style={settingsStyles.overlay} activeOpacity={1} onPress={onClose}>
      <View style={[settingsStyles.panel, { backgroundColor: colors.surface }]}>
        <View style={settingsStyles.handle} />
        <Text style={[settingsStyles.title, { color: colors.primary }]}>{t('chat.settings')}</Text>
        <View style={[settingsStyles.divider, { backgroundColor: colors.accent }]} />

        {!isGhost && (
          <>
            <Text style={[settingsStyles.section, { color: colors.textSecondary }]}>{t('chat.autoDeleteSection')}</Text>
            <View style={settingsStyles.optionsGrid}>
              {autoDeleteOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[settingsStyles.option, {
                    borderColor: autoDelete === option.value ? colors.accent : colors.border,
                    backgroundColor: autoDelete === option.value ? colors.accent + '10' : 'transparent'
                  }]}
                  onPress={() => handleSetAutoDelete(option.value)}
                >
                  <Text style={[settingsStyles.optionText, { color: autoDelete === option.value ? colors.accent : colors.textSecondary }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {isGhost && (
          <>
            <View style={settingsStyles.ghostInfo}>
              <Ionicons name="flash" size={20} color={colors.accent} />
              <Text style={[settingsStyles.ghostInfoText, { color: colors.textSecondary }]}>
                {t('chat.ghostNoAutoDelete')}
              </Text>
            </View>
            <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />
            <View style={settingsStyles.ghostInfo}>
              <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
              <Text style={[settingsStyles.ghostInfoText, { color: colors.textSecondary }]}>
                {t('chat.snapshots')}{snapshotsAllowed !== false ? t('chat.snapshotsAllowed') : t('chat.snapshotsBlocked')}
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity style={settingsStyles.action} onPress={() => {
          onClose();
          Alert.alert(t('chat.blockUser'), `${t('chat.blockUser')} @${chat?.username}?`, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('chat.blockUser'), style: 'destructive', onPress: async () => { await blockUser(chat.username, myUsername); router.back(); } },
          ]);
        }}>
          <Ionicons name="ban-outline" size={18} color="#D32F2F" />
          <Text style={[settingsStyles.actionText, { color: '#D32F2F' }]}>{t('chat.blockUser')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={settingsStyles.action} onPress={() => {
          onClose();
          Alert.alert(t('chat.deleteMessage'), t('chat.cannotUndo'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteChat(chat.id); router.back(); } },
          ]);
        }}>
          <Ionicons name="trash-outline" size={18} color="#D32F2F" />
          <Text style={[settingsStyles.actionText, { color: '#D32F2F' }]}>{t('chat.deleteMessage')}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const settingsStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '300', letterSpacing: 2 },
  divider: { height: 1, width: 30, marginVertical: 12 },
  section: { fontSize: 10, fontWeight: '600', letterSpacing: 3, marginBottom: 12 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  option: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 0.5 },
  optionText: { fontSize: 13, fontWeight: '400' },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  actionText: { fontSize: 14, fontWeight: '300' },
  ghostInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  ghostInfoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

const ChatScreen = () => {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isGhost, setIsGhost] = useState(false);
  const [snapshotsAllowed, setSnapshotsAllowed] = useState(true);
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState<string | undefined>();
  const [reactionsMap, setReactionsMap] = useState<Map<string, { username: string; reaction: string }[]>>(new Map());
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [contactAvatar, setContactAvatar] = useState<string | null>(null);
  const [contactDisplayName, setContactDisplayName] = useState<string>('');
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerUri, setMediaViewerUri] = useState<string>('');
  const [mediaViewerType, setMediaViewerType] = useState<'image' | 'video'>('image');
  const [mediaViewerMimeType, setMediaViewerMimeType] = useState<string | undefined>(undefined);
  const [mediaViewerTitle, setMediaViewerTitle] = useState<string | undefined>(undefined);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const ghostUnsubRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef(0);

  const initialMsgCount = useRef(0);
  const realUsername = username?.startsWith('ghost_') ? username.replace('ghost_', '') : username;
  const isGhostChat = username?.startsWith('ghost_') || false;
  const headerHeight = insets.top + 50;
  const tzStr = React.useMemo(() => {
    const o = -new Date().getTimezoneOffset();
    const h = Math.floor(Math.abs(o) / 60);
    const m = Math.abs(o) % 60;
    return o === 0 ? 'UTC' : `UTC${o > 0 ? '+' : '-'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
  }, []);

  const {
    onContentSizeChange,
    onScroll,
    onScrollBeginDrag,
    onScrollToBottomPress,
    onSendMessage,
    showScrollButton,
  } = useChatScroll({
    flatListRef,
    messages,
    myUsername,
  });

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    // If navigating to own username, redirect to saved messages
    getLocalIdentity().then(identity => {
      if (identity && realUsername === identity.username && !isGhostChat) {
        router.replace('/saved-messages');
        return;
      }
    });
    loadChat();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (ghostUnsubRef.current) ghostUnsubRef.current();
    };
  }, [username]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/active|inactive/) && nextAppState === 'background') {
        ghostChatManager.endGhostChatOnAppBackground();
      }
      if (appStateRef.current.match(/background|inactive/) && nextAppState === 'active') {
        ghostChatManager.restoreGhostChatsOnAppForeground();
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const loadChat = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    setMyUsername(identity.username);
    setIsGhost(isGhostChat);

    const chatData = await createOrGetChat(realUsername, isGhostChat);
    setChat(chatData);

    if (!isGhostChat) {
      // Try cached contact first
      const cached = await getContact(realUsername);
      if (cached?.avatarUri) setContactAvatar(cached.avatarUri);
      if (cached?.displayName) setContactDisplayName(cached.displayName);

      // Then fetch fresh profile from server and cache it
      getUserProfile(realUsername).then(profile => {
        if (profile.avatar_uri && profile.avatar_uri !== cached?.avatarUri) {
          setContactAvatar(profile.avatar_uri);
        }
        if (profile.display_name && profile.display_name !== cached?.displayName) {
          setContactDisplayName(profile.display_name);
        }
        // Also fetch and cache public key for decryption
        if (profile.public_key) {
          upsertContact(realUsername, {
            avatarUri: profile.avatar_uri,
            displayName: profile.display_name,
            publicKey: profile.public_key,
          }).then(() => syncChatsWithContacts());
        }
      }).catch(() => {});
    }

    if (!isGhostChat) {
      const cached = getCachedMessages(chatData.id);
      if (cached) {
        setMessages(cached);
        initialMsgCount.current = cached.length;
      }

      const msgs = await getMessages(chatData.id);
      if (!cached || msgs.length !== cached.length || msgs.some((m, i) => m.id !== cached[i]?.id || m.status !== cached[i]?.status)) {
        setMessages(msgs);
        setCachedMessages(chatData.id, msgs);
        if (!cached) initialMsgCount.current = msgs.length;
      }

      msgs.forEach(msg => {
        if (msg.senderUsername !== identity.username && msg.status !== 'read') {
          wsManager.sendReadReceipt(msg.id, msg.senderUsername);
        }
      });
    } else {
      const ghostInfo = ghostChatManager.getGhostChatInfo(realUsername);
      setSnapshotsAllowed(ghostInfo?.snapshotsAllowed ?? true);
      ghostChatManager.startGhostChat(realUsername, snapshotsAllowed);
      const ghostMsgs = ghostChatManager.getGhostMessages(realUsername);
      setMessages(ghostMsgs);

      ghostUnsubRef.current = ghostChatManager.onGhostMessage(realUsername, (data) => {
        if (data.fromUser === realUsername && data.toUser === identity.username) {
          const newMsg: Message = {
            id: data.messageId,
            chatId: chatData.id,
            senderUsername: data.fromUser,
            contentType: (data.contentType || 'text') as 'text' | 'image' | 'file' | 'voice',
            contentText: data.ciphertext || '',
            contentUri: data.contentUri || null,
            mediaMimeType: data.mediaMimeType || null,
            isEncrypted: true,
            timestamp: data.timestamp,
            status: 'delivered',
            replyToId: data.replyToId || null,
            replyToText: data.replyToText || null,
            replyToUsername: data.replyToUsername || null,
            isDeleted: false,
            deleteAt: null,
          };
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const updated = [...prev, newMsg];
            ghostChatManager.saveGhostMessages(realUsername, updated);
            return updated;
          });
        }
      });
    }

    if (unsubscribeRef.current) unsubscribeRef.current();

    unsubscribeRef.current = wsManager.onMessage(async (incomingMsg) => {
      if (!incomingMsg.fromUser || !incomingMsg.toUser) return;

      if (incomingMsg.fromUser === realUsername && incomingMsg.toUser === identity.username) {
        // handleIncomingMessage уже расшифровал и сохранил в БД.
        // Загружаем из кэша/БД, чтобы получить расшифрованный текст.
        const msgs = await getMessages(chatData.id);
        if (msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          setMessages(prev => {
            if (prev.some(m => m.id === lastMsg.id)) return prev;
            const updated = [...prev, lastMsg];
            setCachedMessages(chatData.id, updated);
            return updated;
          });
        }
        wsManager.sendAck(incomingMsg.messageId);
        wsManager.sendReadReceipt(incomingMsg.messageId, incomingMsg.fromUser);
      }

      if (incomingMsg.fromUser === identity.username && incomingMsg.toUser === realUsername) {
        updateMessageStatus(incomingMsg.messageId, 'delivered').catch(() => {});
        setMessages(prev => {
          const found = prev.find(m => m.id === incomingMsg.messageId);
          if (found && (found.status === 'sending' || found.status === 'sent')) {
            const updated = prev.map(m => m.id === incomingMsg.messageId ? { ...m, status: 'delivered' as const } : m);
            if (!isGhostChat) setCachedMessages(chatData.id, updated);
            return updated;
          }
          return prev;
        });
      }
    });
  };

  useEffect(() => {
    const unsubRead = wsManager.onReadReceipt((messageId) => {
      updateMessageStatus(messageId, 'read').catch(() => {});
      setMessages(prev => {
        const found = prev.find(m => m.id === messageId);
        if (found && found.status !== 'read') {
          const updated = prev.map(m => m.id === messageId ? { ...m, status: 'read' as const } : m);
          if (chat) setCachedMessages(chat.id, updated);
          return updated;
        }
        return prev;
      });
    });
    const unsubDelivered = wsManager.onDelivered((messageId) => {
      updateMessageStatus(messageId, 'delivered').catch(() => {});
      setMessages(prev => {
        const found = prev.find(m => m.id === messageId);
        if (found && (found.status === 'sending' || found.status === 'sent')) {
          const updated = prev.map(m => m.id === messageId ? { ...m, status: 'delivered' as const } : m);
          if (chat) setCachedMessages(chat.id, updated);
          return updated;
        }
        return prev;
      });
    });
    const unsubReaction = wsManager.onReaction(async (data) => {
      try {
        const { setReaction, removeReaction } = await import('../../src/services/reactionsService');
        if (data.reaction) {
          await setReaction(data.messageId, data.reaction, data.fromUser, chat?.id);
        } else {
          await removeReaction(data.messageId, data.fromUser);
        }
        setReactionsMap(prev => {
          const m = new Map(prev);
          const existing = (m.get(data.messageId) || []).filter(r => r.username !== data.fromUser);
          if (data.reaction) {
            existing.push({ username: data.fromUser, reaction: data.reaction });
          }
          m.set(data.messageId, existing);
          return m;
        });
      } catch {}
    });
    return () => { unsubRead(); unsubDelivered(); unsubReaction(); };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    loadReactions();
  }, [messages.length]);

  const loadReactions = useCallback(async () => {
    try {
      const { getGroupReactionsForMessages: batchGet } = await import('../../src/services/reactionsService');
      const map = await batchGet(messages.map(m => m.id));
      setReactionsMap(map);
    } catch {}
  }, [messages]);

  const encryptText = useCallback(async (plaintext: string, recipient: string): Promise<{ ciphertext: string; nonce: string }> => {
    try {
      const { encryptForRecipient } = await import('../../src/crypto/secureChannel');
      return await encryptForRecipient(plaintext, recipient);
    } catch {
      return { ciphertext: plaintext, nonce: '' };
    }
  }, []);

  const sendTextMessage = useCallback(async (text: string, replyTo?: Message | null) => {
    if (!chat || !text.trim()) return;
    const content = text.trim();
    setInputText('');
    const replyId = replyTo?.id || null;
    const replyText = replyTo?.contentText || replyTo?.replyToText || null;
    const replyToUsername = replyTo?.senderUsername || null;

    onSendMessage();

    const message = await sendMessage({
      chatId: chat.id,
      senderUsername: myUsername,
      contentText: content,
      contentType: 'text',
      replyToId: replyId,
      replyToText: replyText,
      replyToUsername,
    });
    setReplyMessage(null);
    setMessages(prev => {
      const updated = [...prev, message];
      setCachedMessages(chat!.id, updated);
      return updated;
    });

    try {
      const { ciphertext, nonce } = await encryptText(content, realUsername);
      const result = await sendMessageToServer(myUsername, realUsername, ciphertext, {
        nonce,
        replyToId: replyId,
        replyToText: replyText || undefined,
        replyToUsername,
      });
      if (result.message_id) {
        await updateMessageId(message.id, result.message_id);
        await updateMessageStatus(result.message_id, 'sent');
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = typeof result.timestamp === 'string' ? parseInt(result.timestamp) : (result.timestamp || Date.now());
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev
              .map((m): Message | null => {
                if (m.id === result.message_id) {
                  return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || message.id };
                }
                if (m.id === message.id) return null;
                return m;
              })
              .filter((m): m is Message => m !== null);
            setCachedMessages(chat!.id, merged);
            return merged;
          }
          const updated = prev.map(m => {
            if (m.id !== message.id) return m;
            const newStatus = m.status === 'sending' ? 'sent' as const : m.status;
            return { ...m, id: result.message_id!, status: newStatus, timestamp: serverTimestamp };
          });
          setCachedMessages(chat!.id, updated);
          return updated;
        });
      }
    } catch (error) {
      await updateMessageStatus(message.id, 'failed');
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === message.id ? { ...m, status: 'failed' as const } : m
        );
        setCachedMessages(chat!.id, updated);
        return updated;
      });
    }
  }, [chat, myUsername, realUsername]);

  const sendGhostTextMessage = useCallback(async (text: string, replyTo?: Message | null) => {
    if (!chat || !text.trim()) return;
    const content = text.trim();
    setInputText('');
    const replyId = replyTo?.id || null;
    const replyText = replyTo?.contentText || replyTo?.replyToText || null;
    const replyToUsername = replyTo?.senderUsername || null;

    onSendMessage();

    const msgId = `ghost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMsg: Message = {
      id: msgId,
      chatId: chat.id,
      senderUsername: myUsername,
      contentType: 'text',
      contentText: content,
      contentUri: null,
      mediaMimeType: null,
      isEncrypted: true,
      timestamp: Date.now(),
      status: 'sending',
      replyToId: replyId,
      replyToText: replyText,
      replyToUsername,
      isDeleted: false,
      deleteAt: null,
    };

    setReplyMessage(null);
    setMessages(prev => {
      const updated = [...prev, newMsg];
      ghostChatManager.saveGhostMessages(realUsername, updated);
      return updated;
    });

    try {
      wsManager.sendMessage({
        type: 'ghost_message',
        from_user: myUsername,
        to_user: realUsername,
        ciphertext: content,
        nonce: '',
        is_ghost: true,
        reply_to_id: replyId,
        reply_to_text: replyText,
      });

      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === msgId ? { ...m, status: 'sent' as const } : m
        );
        ghostChatManager.saveGhostMessages(realUsername, updated);
        return updated;
      });
    } catch (error) {
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === msgId ? { ...m, status: 'failed' as const } : m
        );
        ghostChatManager.saveGhostMessages(realUsername, updated);
        return updated;
      });
    }

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chat, myUsername, realUsername]);

  const handleSendText = useCallback(() => {
    if (!inputText.trim()) return;
    if (isGhostChat) {
      sendGhostTextMessage(inputText, replyMessage);
    } else {
      sendTextMessage(inputText, replyMessage);
    }
  }, [inputText, isGhostChat, sendGhostTextMessage, sendTextMessage, replyMessage]);

  const fileToDataUri = useCallback(async (fileUri: string, mimeType: string): Promise<string> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:${mimeType};base64,${base64}`;
    } catch {
      return fileUri;
    }
  }, []);

  const handleSendMedia = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('chat.permissionNeeded'), t('chat.cameraAccess'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      exif: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    if (asset.type === 'video') {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (fileInfo.exists && fileInfo.size > 7 * 1024 * 1024) {
        Alert.alert(t('common.error'), t('chat.fileTooLarge'));
        return;
      }
    }

    let processedUri = asset.uri;

    if (asset.type === 'image') {
      const manipulated = await manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: SaveFormat.JPEG }
      );
      processedUri = manipulated.uri;
    }

    const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const mediaType = asset.type === 'video' ? 'video' : 'image';

    // Convert local file to base64 data URI so it works cross-device
    processedUri = await fileToDataUri(processedUri, mimeType);

    onSendMessage();

    const replyId = replyMessage?.id || null;
    const replyText = replyMessage?.contentText || replyMessage?.replyToText || null;
    const replyToUsername = replyMessage?.senderUsername || null;

    if (isGhostChat) {
      if (!chat) return;
      const msgId = `ghost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newMsg: Message = {
        id: msgId, chatId: chat.id, senderUsername: myUsername,
        contentType: mediaType as 'image' | 'video',
        contentText: null, contentUri: processedUri,
        mediaMimeType: mimeType, isEncrypted: true,
        timestamp: Date.now(), status: 'sending',
        replyToId: replyId,
        replyToText: replyText,
        replyToUsername,
        isDeleted: false, deleteAt: null,
      };
      setReplyMessage(null);
      setMessages(prev => {
        const updated = [...prev, newMsg];
        ghostChatManager.saveGhostMessages(realUsername, updated);
        return updated;
      });
      wsManager.sendMessage({
        type: 'ghost_message',
        from_user: myUsername,
        to_user: realUsername,
        ciphertext: '',
        nonce: '',
        is_ghost: true,
        content_uri: processedUri,
        content_type: mediaType,
        media_mime_type: mimeType,
      });
      return;
    }

    if (!chat) return;
    const message = await sendMessage({
      chatId: chat.id, senderUsername: myUsername,
      contentType: mediaType as 'image' | 'video',
      contentUri: processedUri, mediaMimeType: mimeType,
      replyToId: replyId,
      replyToText: replyText,
      replyToUsername,
    });
    setReplyMessage(null);
    setMessages(prev => {
      const updated = [...prev, message];
      setCachedMessages(chat!.id, updated);
      return updated;
    });

    try {
      const result = await sendMessageToServer(myUsername, realUsername, '', {
        nonce: '',
        contentType: mediaType,
        contentUri: processedUri,
        mediaMimeType: mimeType,
        replyToId: replyMessage?.id || null,
        replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
        replyToUsername: replyMessage?.senderUsername || null,
      });
      if (result.message_id) {
        await updateMessageStatus(message.id, 'sent');
        const serverTimestamp = typeof result.timestamp === 'string' ? parseInt(result.timestamp) : (result.timestamp || Date.now());
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev.map(m => {
              if (m.id === result.message_id) {
                return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || message.id };
              }
              if (m.id === message.id) return null;
              return m;
            }).filter((m): m is Message => m !== null);
            setCachedMessages(chat!.id, merged);
            return merged;
          }
          const updated = prev.map(m =>
            m.id === message.id 
              ? { ...m, id: result.message_id!, status: 'sent' as const, timestamp: serverTimestamp }
              : m
          );
          setCachedMessages(chat!.id, updated);
          return updated;
        });
      }
    } catch (error) {
      await updateMessageStatus(message.id, 'failed');
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === message.id ? { ...m, status: 'failed' as const } : m
        );
        setCachedMessages(chat!.id, updated);
        return updated;
      });
    }
  }, [chat, myUsername, realUsername, isGhostChat, replyMessage]);

  const startRecording = useCallback(async () => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('chat.permissionNeeded'), t('chat.micAccess'));
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
      const recording = new Audio.Recording();
      recordingRef.current = recording;
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartRef.current) / 1000));
      }, 200);
    } catch (error) {
      console.error('Record start error:', error);
      recordingRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      // Reset audio mode to release microphone
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = recording.getURI();
      if (!uri) return;
      if (recordingDuration < 1) return; // too short
      const voiceDataUri = await fileToDataUri(uri, 'audio/m4a');

      if (isGhostChat) {
        if (!chat) return;
        const msgId = `ghost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newMsg: Message = {
          id: msgId, chatId: chat.id, senderUsername: myUsername,
          contentType: 'voice', contentText: null, contentUri: voiceDataUri,
          mediaMimeType: 'audio/m4a', isEncrypted: true,
          timestamp: Date.now(), status: 'sending',
          replyToId: replyMessage?.id || null,
          replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
          replyToUsername: replyMessage?.senderUsername || null,
          isDeleted: false, deleteAt: null,
        };
        onSendMessage();
        setReplyMessage(null);
        setMessages(prev => {
          const updated = [...prev, newMsg];
          ghostChatManager.saveGhostMessages(realUsername, updated);
          return updated;
        });
        wsManager.sendMessage({
          type: 'ghost_message',
          from_user: myUsername,
          to_user: realUsername,
          ciphertext: '',
          nonce: '',
          is_ghost: true,
          content_uri: voiceDataUri,
          content_type: 'voice',
          media_mime_type: 'audio/m4a',
          reply_to_id: replyMessage?.id || null,
          reply_to_text: replyMessage?.contentText || replyMessage?.replyToText || null,
        });
        return;
      }

      if (!chat) return;
      const message = await sendMessage({
        chatId: chat.id, senderUsername: myUsername,
        contentType: 'voice', contentUri: voiceDataUri, mediaMimeType: 'audio/m4a',
        replyToId: replyMessage?.id || null,
        replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
        replyToUsername: replyMessage?.senderUsername || null,
      });
      onSendMessage();
      setReplyMessage(null);
      setMessages(prev => {
        const updated = [...prev, message];
        setCachedMessages(chat!.id, updated);
        return updated;
      });

      try {
        const result = await sendMessageToServer(myUsername, realUsername, '', {
          contentType: 'voice',
          contentUri: voiceDataUri,
          mediaMimeType: 'audio/m4a',
          replyToId: replyMessage?.id || null,
          replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
          replyToUsername: replyMessage?.senderUsername || null,
        });
        if (result.message_id) {
          await updateMessageStatus(message.id, 'sent');
          // Use server timestamp for consistent ordering across timezones
const serverTimestamp = typeof result.timestamp === 'string' ? parseInt(result.timestamp) : (result.timestamp || Date.now());
setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev
              .map((m): Message | null => {
                if (m.id === result.message_id) {
                  return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || message.id };
                }
                if (m.id === message.id) return null;
                return m;
              })
              .filter((m): m is Message => m !== null);
            setCachedMessages(chat!.id, merged);
            return merged;
            }
            const updated = prev.map(m =>
              m.id === message.id ? { ...m, id: result.message_id!, status: 'sent' as const, timestamp: serverTimestamp } : m
            );
            setCachedMessages(chat!.id, updated);
            return updated;
          });
        }
      } catch (error) {
        await updateMessageStatus(message.id, 'failed');
        setMessages(prev => {
          const updated = prev.map(m =>
            m.id === message.id ? { ...m, status: 'failed' as const } : m
          );
          setCachedMessages(chat!.id, updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Voice send error:', error);
    }
  }, [chat, myUsername, realUsername, isGhostChat, replyMessage, recordingDuration]);

  const handleLongPress = useCallback((msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isMine = msg.senderUsername === myUsername;

    setActionSheetMessageId(msg.id);
    getMyReaction(msg.id, myUsername).then(setMyReaction).catch(() => setMyReaction(null));

    const options: ActionSheetOption[] = [
      {
        label: t('chat.reply'),
        icon: 'arrow-undo',
        onPress: () => setReplyMessage(msg),
      },
      {
        label: t('chat.forward'),
        icon: 'arrow-redo',
        onPress: () => {
          setActionSheetVisible(false);
          setPendingForward({
            id: msg.id,
            senderUsername: msg.senderUsername,
            contentType: msg.contentType,
            contentText: msg.contentText,
            contentUri: msg.contentUri,
            mediaMimeType: msg.mediaMimeType,
            replyToId: msg.replyToId,
            replyToText: msg.replyToText,
            timestamp: msg.timestamp,
          });
          router.push('/forward-picker' as any);
        },
      },
      ...(msg.contentUri ? [{
        label: t('chat.downloadFile'),
        icon: 'download-outline' as const,
        onPress: () => {
          setActionSheetVisible(false);
          downloadFile(msg.contentUri!, msg.mediaMimeType || undefined);
        },
      }] : []),
      {
        label: t('chat.copyMessage'),
        icon: 'copy-outline',
        onPress: async () => {
          const textToCopy = msg.contentText || msg.contentUri || '';
          await Clipboard.setStringAsync(textToCopy);
        },
      },
      ...(isMine ? [{
        label: t('chat.deleteMessage'),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () => handleDeleteMessage(msg.id),
      }] : []),
    ];

    setActionSheetTitle(t('chat.sendMessage'));
    setActionSheetOptions(options);
    setActionSheetVisible(true);
  }, [myUsername]);

  const handleNavigateToProfile = useCallback(() => {
    router.push(`/profile/${realUsername}` as any);
  }, [realUsername]);

  const handleDeleteMessage = async (messageId: string) => {
    if (isGhostChat) {
      setMessages(prev => {
        const updated = prev.filter(m => m.id !== messageId);
        ghostChatManager.saveGhostMessages(realUsername, updated);
        return updated;
      });
    } else {
      await deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

  const handleMinimize = () => {
    ghostChatManager.saveGhostMessages(realUsername, messages);
    router.back();
  };

  const openMediaViewer = useCallback((uri: string, type: 'image' | 'video', mimeType?: string, title?: string) => {
    setMediaViewerUri(uri);
    setMediaViewerType(type);
    setMediaViewerMimeType(mimeType);
    setMediaViewerTitle(title);
    setMediaViewerVisible(true);
  }, []);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isNew = index >= initialMsgCount.current;
    return isNew ? (
      <FadeInView duration={200}>
        <MessageBubble
          message={item}
          isMine={item.senderUsername === myUsername}
          colors={colors}
          isDark={isDark}
          onLongPress={handleLongPress}
          onReply={() => setReplyMessage(item)}
          reactions={reactionsMap.get(item.id)}
          onPressMedia={openMediaViewer}
        />
      </FadeInView>
    ) : (
      <MessageBubble
        message={item}
        isMine={item.senderUsername === myUsername}
        colors={colors}
        isDark={isDark}
        onLongPress={handleLongPress}
        onReply={() => setReplyMessage(item)}
        reactions={reactionsMap.get(item.id)}
        onPressMedia={openMediaViewer}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={{ paddingTop: insets.top }}>
        <ChatHeader
          username={realUsername}
          displayName={contactDisplayName || chat?.displayName || ''}
          avatarUri={contactAvatar || chat?.avatarUri || ''}
          isGhost={isGhost}
          onBack={() => router.back()}
          onMinimize={handleMinimize}
          onSettings={() => setShowSettings(true)}
          onAvatarPress={handleNavigateToProfile}
          colors={colors}
          tz={tzStr}
        />
      </View>

{(() => {
        const chatPane = (
          <>
            <View style={styles.flex}>
            <ChatBackground colors={colors} />
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messagesContainer}
                onContentSizeChange={onContentSizeChange}
                onScroll={onScroll}
                onScrollBeginDrag={onScrollBeginDrag}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name={isGhost ? "flash-outline" : "chatbubble-outline"} size={48} color={colors.textSecondary + '60'} />
                    <Text style={[styles.emptyTitle, { color: colors.accent }]}>
                      {isGhost ? t('chat.startGhostChat') : t('chat.secureChannel')}
                    </Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {isGhost
                        ? t('chat.ghostEphemeral')
                        : t('chat.noServerHistory')}
                    </Text>
                  </View>
                }
              />
              {showScrollButton && (
                <ScrollToBottomButton
                  onPress={onScrollToBottomPress}
                  visible={showScrollButton}
                  accessibilityLabel={t('chat.scrollToBottom')}
                  testID="scroll-to-bottom-button"
                />
              )}
            </View>

            <View style={[
              styles.inputContainer,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom + 4,
              }
            ]}>
              {replyMessage && (
                <ReplyBar
                  replyToText={replyMessage.contentText || replyMessage.replyToText || t('chat.mediaFallback')}
                  replyToUser={replyMessage.senderUsername === myUsername ? t('chat.you') : `@${replyMessage.senderUsername}`}
                  onCancel={() => setReplyMessage(null)}
                  colors={colors}
                />
              )}
              <View style={styles.inputRow}>
                <TouchableOpacity
                  style={[styles.attachButton, { backgroundColor: colors.accent + '10', borderColor: colors.border }]}
                  onPress={handleSendMedia}
                >
                  <Ionicons name="attach-outline" size={20} color={colors.accent} />
                </TouchableOpacity>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background + '80', borderColor: colors.border }]}>
                  <TextInput
                    ref={inputRef}
                    style={[styles.input, { color: colors.text }]}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={isGhost ? t('chat.ghostPlaceholder') : t('chat.sendMessage')}
                    placeholderTextColor={colors.textSecondary + '80'}
                    multiline
                    maxLength={5000}
                    onFocus={() => {
                      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300);
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.actionCircle, {
                    backgroundColor: inputText.trim() ? colors.accent : colors.border + '40',
                    opacity: inputText.trim() ? 1 : 0.4
                  }]}
                  onPress={handleSendText}
                  disabled={!inputText.trim()}
                >
                  <Ionicons name="arrow-up" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionCircle, {
                    backgroundColor: isRecording ? '#D32F2F' : colors.accent + '15',
                    borderColor: isRecording ? '#D32F2F' : colors.accent + '30',
                    borderWidth: 1,
                  }]}
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                >
                  <Ionicons name={isRecording ? "mic" : "mic-outline"} size={20} color={isRecording ? "#FFF" : colors.accent} />
                </TouchableOpacity>
              </View>
</View>
            {isRecording && (
              <View style={[styles.recordingBar, { backgroundColor: '#D32F2F20', borderColor: '#D32F2F40' }]}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimer}>
                  {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(recordingDuration % 60).padStart(2, '0')}
                </Text>
                <Text style={styles.recordingLabel}>{t('chat.recording')}</Text>
              </View>
            )}
          </>
        );
        return Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerHeight + 8}>
            {chatPane}
          </KeyboardAvoidingView>
        ) : (
          <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
            {chatPane}
          </View>
        );
      })()}

      {showSettings && chat && (
        <ChatSettingsPanel chat={chat} onClose={() => setShowSettings(false)} colors={colors} isGhost={isGhost} snapshotsAllowed={snapshotsAllowed} myUsername={myUsername} />
      )}

      <ActionSheet
        visible={actionSheetVisible}
        title={actionSheetTitle}
        options={actionSheetOptions}
        onCancel={() => setActionSheetVisible(false)}
        reactions
        selectedReaction={myReaction}
        onReaction={async (emoji: string) => {
          if (!actionSheetMessageId) return;
          const result = await toggleReaction(actionSheetMessageId, emoji, myUsername, chat?.id);
          setMyReaction(result.reaction);
          await loadReactions();
          wsManager.sendReaction(actionSheetMessageId, result.reaction || '', realUsername);
        }}
      />

      <MediaViewer
        visible={mediaViewerVisible}
        onClose={() => setMediaViewerVisible(false)}
        uri={mediaViewerUri}
        mediaType={mediaViewerType}
        mimeType={mediaViewerMimeType}
        title={mediaViewerTitle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  messagesContainer: { flexGrow: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12, marginTop: -60 },
  emptyTitle: { fontSize: 20, fontWeight: '300', letterSpacing: 2 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '300' },
  inputContainer: { paddingHorizontal: 10, paddingTop: 6, borderTopWidth: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  attachButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 0.5, marginBottom: 0,
  },
  inputWrapper: { flex: 1, borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 4, minHeight: 38 },
  input: { fontSize: 15, maxHeight: 110, lineHeight: 20, fontWeight: '300', paddingTop: 0, paddingBottom: 0 },
  actionCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 0 },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, paddingHorizontal: 16, marginHorizontal: 8, marginTop: 4,
    borderRadius: 12, borderWidth: 0.5, gap: 8,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D32F2F' },
  recordingTimer: { fontSize: 14, fontWeight: '600', color: '#D32F2F', fontVariant: ['tabular-nums'] },
  recordingLabel: { fontSize: 11, fontWeight: '300', color: '#D32F2F', letterSpacing: 0.5 },
});

export default ChatScreen;
