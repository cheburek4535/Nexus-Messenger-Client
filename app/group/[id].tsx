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
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { Audio, Video, ResizeMode } from 'expo-av';
import { getLocalIdentity } from '../../src/services/identity';
import { sendGroupMessageToServer, getGroupFromServer } from '../../src/services/api';
import {
  getGroupById,
  getGroupMembers,
  getGroupMessages,
  saveGroupMessage,
  updateGroupMessageStatus,
  updateGroupMessageId,
  saveGroupMessageRead,
  getGroupMessageReadsForMessages,
  ensureGroupExistsLocally,
  GroupData,
  GroupMessage,
} from '../../src/services/groupService';
import { sendGroupMessage as sendGroupMessageLocal } from '../../src/services/groupMessageService';
import { wsManager } from '../../src/services/websocket';
import { t } from '../../src/services/i18n';
import { toggleReaction, getMyReaction } from '../../src/services/reactionsService';
import ActionSheet, { ActionSheetOption } from '../../src/components/ActionSheet';
import { setPendingForward } from '../../src/services/forwardService';
import { getCachedGroupMessages, setCachedGroupMessages, appendGroupMessage, updateGroupMessageInCache, removeGroupMessageFromCache } from '../../src/services/messageCache';
import { FadeInView } from '../../src/utils/animations';
import { useChatScroll } from '../../src/hooks/useChatScroll';
import ScrollToBottomButton from '../../src/components/ui/ScrollToBottomButton';
import MediaViewer from '../../src/components/ui/MediaViewer';
import { downloadFile } from '../../src/utils/downloadFile';

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

const GroupHeader = ({ group, memberCount, onBack, onInfo, colors, tz }: any) => {
  const initial = group?.name?.substring(0, 2).toUpperCase() || 'GR';

  return (
    <View style={[headerStyles.container, {
      backgroundColor: colors.surface + 'F0',
      borderBottomColor: colors.border
    }]}>
      <TouchableOpacity onPress={onBack} style={headerStyles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.accent} />
      </TouchableOpacity>

      <TouchableOpacity style={headerStyles.groupInfo} onPress={onInfo}>
        <View style={[headerStyles.avatar, {
          backgroundColor: colors.accent + '15',
          borderColor: colors.accent + '40'
        }]}>
          {group?.avatarUri ? (
            <Image source={{ uri: group.avatarUri }} style={headerStyles.avatarImage} />
          ) : (
            <Text style={[headerStyles.avatarText, { color: colors.accent }]}>
              {initial}
            </Text>
          )}
        </View>
        <View style={headerStyles.textInfo}>
          <Text style={[headerStyles.name, { color: colors.primary }]} numberOfLines={1}>
                  {group?.name || t('group.fallbackName')}
          </Text>
          <Text style={[headerStyles.memberCount, { color: colors.textSecondary }]}>
            {t('group.membersCount', String(memberCount)) + ` • ${tz}`}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={onInfo} style={headerStyles.infoButton}>
        <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
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
  groupInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  avatarText: { fontSize: 15, fontWeight: '300', letterSpacing: 1 },
  avatarImage: { width: 38, height: 38, borderRadius: 19 },
  textInfo: { gap: 1, flex: 1 },
  name: { fontSize: 16, fontWeight: '400', letterSpacing: 0.5 },
  memberCount: { fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
  infoButton: { padding: 8 },
});

const SystemMessage = ({ message, colors }: { message: GroupMessage; colors: any }) => (
  <View style={[systemStyles.container, { backgroundColor: colors.accent + '06' }]}>
    <Text style={[systemStyles.text, { color: colors.textSecondary }]}>
      {message.contentText}
    </Text>
  </View>
);

const systemStyles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginVertical: 4,
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  text: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    fontWeight: '300',
    letterSpacing: 0.3,
  },
});

const ReactionBar = ({ reactions, colors }: { reactions?: { username: string; reaction: string }[]; colors: any }) => {
  if (!reactions || reactions.length === 0) return null;
  const counts = new Map<string, number>();
  reactions.forEach(r => counts.set(r.reaction, (counts.get(r.reaction) || 0) + 1));
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
      {Array.from(counts.entries()).map(([emoji, count]) => (
        <View key={emoji} style={[reactStyles.pill, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '30' }]}>
          <Text style={reactStyles.emoji}>{emoji}</Text>
          {count > 1 && <Text style={[reactStyles.count, { color: colors.textSecondary }]}>{count}</Text>}
        </View>
      ))}
    </View>
  );
};

const reactStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 0.5 },
  emoji: { fontSize: 14 },
  count: { fontSize: 10, fontWeight: '500' },
});

const VoicePlayer = ({ uri, isPlaying, progress, duration, onToggle, colors }: any) => {
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };
  const progressFraction = duration > 0 ? progress / duration : 0;
  return (
    <TouchableOpacity onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle'} size={28} color={colors.accent} />
      <View style={{ flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
        <View style={{ width: `${progressFraction * 100}%`, height: 4, backgroundColor: colors.accent, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.textSecondary, minWidth: 32, textAlign: 'right' }}>
        {formatTime(isPlaying ? (duration - progress) : duration)}
      </Text>
    </TouchableOpacity>
  );
};

const MessageBubble = ({ message, isMine, colors, isDark, onLongPress, reactions, onVoiceToggle, voiceState, readCount, memberCount: totalMembers, myUsername }: any) => {
  const bubbleColor = isMine
    ? isDark ? '#1E3A5F' : colors.accent + '15'
    : colors.surface;

  const getStatusIcon = () => {
    if (!isMine) return null;
    const allRead = totalMembers > 0 && readCount >= totalMembers - 1;
    switch (message.status) {
      case 'sending': return <Ionicons name="time-outline" size={12} color={colors.textSecondary} />;
      case 'sent': return <Ionicons name="checkmark-outline" size={12} color={colors.textSecondary} />;
      case 'delivered': return allRead
        ? <Ionicons name="checkmark-done" size={12} color={colors.accent} />
        : <Ionicons name="checkmark-done-outline" size={12} color={colors.textSecondary} />;
      case 'read': return <Ionicons name="checkmark-done" size={12} color={colors.accent} />;
      default: return <Ionicons name="checkmark-outline" size={12} color={colors.textSecondary} />;
    }
  };

  const renderContent = () => {
    if (message.contentType === 'image' && message.contentUri) {
      return (
        <Image
          source={{ uri: message.contentUri }}
          style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
          contentFit="cover"
        />
      );
    }
    if (message.contentType === 'voice' && message.contentUri) {
      const isVoicePlaying = voiceState?.currentVoiceMsg === message.contentUri && voiceState?.isPlaying;
      const vProgress = voiceState?.currentVoiceMsg === message.contentUri ? (voiceState?.playbackProgress || 0) : 0;
      const vDuration = voiceState?.currentVoiceMsg === message.contentUri ? (voiceState?.playbackDuration || 0) : 0;
      return (
        <VoicePlayer
          uri={message.contentUri}
          isPlaying={isVoicePlaying}
          progress={vProgress}
          duration={vDuration}
          onToggle={() => onVoiceToggle?.(message.contentUri)}
          colors={colors}
        />
      );
    }
    if (message.contentType === 'video' && message.contentUri) {
      return (
        <Video
          source={{ uri: message.contentUri }}
          style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
        />
      );
    }
    return (
      <Text style={[bubbleStyles.text, { color: colors.text }]}>
        {message.contentText}
      </Text>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={300}
    >
      <View style={[bubbleStyles.container, isMine ? bubbleStyles.mine : bubbleStyles.theirs]}>
        {!isMine && (
          <TouchableOpacity onPress={() => router.push(`/profile/${message.senderUsername}`)}>
            <Text style={[bubbleStyles.sender, { color: colors.accent }]}>
              {message.senderUsername}
            </Text>
          </TouchableOpacity>
        )}
        <View style={[
          bubbleStyles.bubble,
          {
            backgroundColor: bubbleColor,
            borderColor: isMine ? (isDark ? '#2B5277' : colors.accent + '30') : colors.border,
          }
        ]}>
          {message.replyToText && (
            <TouchableOpacity onPress={() => router.push(`/profile/${message.replyToUsername}`)} style={[bubbleStyles.replyQuote, { backgroundColor: colors.accent + '08', borderLeftColor: colors.accent }]}>
              <Text style={[bubbleStyles.replyUser, { color: colors.accent }]}>{message.replyToUsername === myUsername ? t('chat.you') : (message.replyToUsername || t('chat.reply'))}</Text>
              <Text style={[bubbleStyles.replyText, { color: colors.textSecondary }]} numberOfLines={1}>{message.replyToText}</Text>
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
        </View>
        {reactions && reactions.length > 0 && (
          <ReactionBar reactions={reactions} colors={colors} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const bubbleStyles = StyleSheet.create({
  container: { marginBottom: 6, maxWidth: SCREEN_WIDTH * 0.78 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  sender: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2, marginLeft: 4 },
  bubble: { padding: 12, paddingBottom: 6, borderRadius: 16, borderWidth: 0.5 },
  text: { fontSize: 15, lineHeight: 20, fontWeight: '300' },
  replyQuote: {
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, borderRadius: 8, borderLeftWidth: 3,
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
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  time: { fontSize: 10, letterSpacing: 0.3 },
});

const GroupChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<GroupData | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [readCountsMap, setReadCountsMap] = useState<Map<string, number>>(new Map());
  const [reactionsMap, setReactionsMap] = useState<Map<string, { username: string; reaction: string }[]>>(new Map());
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState<string | undefined>();
  const [canWrite, setCanWrite] = useState(true);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState<GroupMessage | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerUri, setMediaViewerUri] = useState<string>('');
  const [mediaViewerType, setMediaViewerType] = useState<'image' | 'video'>('image');
  const [mediaViewerMimeType, setMediaViewerMimeType] = useState<string | undefined>(undefined);
  const [mediaViewerTitle, setMediaViewerTitle] = useState<string | undefined>(undefined);

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
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  // Voice recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [currentVoiceMsg, setCurrentVoiceMsg] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const tzStr = React.useMemo(() => {
    const o = -new Date().getTimezoneOffset();
    const h = Math.floor(Math.abs(o) / 60);
    const m = Math.abs(o) % 60;
    return o === 0 ? 'UTC' : `UTC${o > 0 ? '+' : '-'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
  }, []);

  const flatListRef = useRef<FlatList>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initialMsgCount = useRef(0);
  const headerHeight = insets.top + 50;

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
    loadData();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [id]);

  const loadGroupMsgs = async (groupId: string) => {
    const msgs = await getGroupMessages(groupId);
    setMessages(msgs);
    setCachedGroupMessages(groupId, msgs);
    return msgs;
  };

  const loadData = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    setMyUsername(identity.username);

    const groupId = id!;

    // 1. Сразу показываем кэш (если есть)
    const cached = getCachedGroupMessages(groupId);
    if (cached) {
      setMessages(cached);
      initialMsgCount.current = cached.length;
    }

    // 2. Фоново синхронизируем с сервера
    try {
      const serverGroup = await getGroupFromServer(groupId);
      if (serverGroup && serverGroup.id) {
        const { upsertGroup, upsertGroupMembers } = await import('../../src/services/groupService');
        await upsertGroup({
          id: serverGroup.id,
          name: serverGroup.name,
          description: serverGroup.description || '',
          avatar_uri: serverGroup.avatar_uri || '',
          created_by: serverGroup.created_by,
          created_at: serverGroup.created_at,
          updated_at: serverGroup.updated_at || serverGroup.created_at,
          is_channel: serverGroup.is_channel,
          owner_username: serverGroup.owner_username || null,
          admin_usernames: serverGroup.admin_usernames || undefined,
        });
        if (serverGroup.members && serverGroup.members.length > 0) {
          await upsertGroupMembers(serverGroup.id, serverGroup.members);
        }
      }
    } catch (_e) {}

    // 3. Загружаем из локальной БД (всегда актуально)
    const groupData = await getGroupById(groupId);
    setGroup(groupData);
    const members = await getGroupMembers(groupId);
    setMemberCount(members.length);

    const msgs = await loadGroupMsgs(groupId);
    if (!cached) initialMsgCount.current = msgs.length;

    // 4. Read receipts в фоне, только для непрочитанных
    if (identity) {
      const ownMsgIds: string[] = [];
      for (const msg of msgs) {
        if (msg.senderUsername !== identity.username && !msg.isSystem) {
          wsManager.sendGroupReadReceipt(groupId, msg.id);
          saveGroupMessageRead(msg.id, identity.username).catch(() => {});
        }
        if (msg.senderUsername === identity.username) {
          ownMsgIds.push(msg.id);
        }
      }
      if (ownMsgIds.length > 0) {
        const readMap = await getGroupMessageReadsForMessages(ownMsgIds);
        setReadCountsMap(readMap);
      }
    }

    if (unsubscribeRef.current) unsubscribeRef.current();

    unsubscribeRef.current = wsManager.onSystemMessage('group_message', async (data: any) => {
      if (data.group_id === id) {
        if (data.content_type === 'reaction') {
          try {
            const payload = JSON.parse(data.content_text || '{}');
            const { setReaction, removeReaction } = await import('../../src/services/reactionsService');
            const sender = data.sender_username || data.from_user || '';
            if (payload.reaction) {
              await setReaction(payload.message_id, payload.reaction, sender);
              setReactionsMap(prev => {
                const m = new Map(prev);
                const existing = m.get(payload.message_id) || [];
                const filtered = existing.filter(r => r.username !== sender);
                filtered.push({ username: sender, reaction: payload.reaction });
                m.set(payload.message_id, filtered);
                return m;
              });
            } else {
              await removeReaction(payload.message_id, sender);
              setReactionsMap(prev => {
                const m = new Map(prev);
                const existing = m.get(payload.message_id) || [];
                m.set(payload.message_id, existing.filter(r => r.username !== sender));
                return m;
              });
            }
          } catch {}
          return;
        }
        // Как в DM: загружаем из БД после того, как глобальный обработчик сохранил
        const updated = await getGroupMessages(groupId);
        if (updated.length > 0) {
          const lastMsg = updated[updated.length - 1];
          setMessages(prev => {
            // Check for existing message by ID (normal case)
            if (prev.some(m => m.id === lastMsg.id)) return prev;
            // Check for potential duplicate by sender/content/timestamp (race condition: WebSocket echo arrived before HTTP response)
            const isDuplicate = prev.some(m => 
              m.senderUsername === lastMsg.senderUsername &&
              m.contentText === lastMsg.contentText &&
              Math.abs(m.timestamp - lastMsg.timestamp) < 2000
            );
            if (isDuplicate) return prev;
            const result = [...prev, lastMsg];
            setCachedGroupMessages(groupId, result);
            return result;
          });
        }
        // Эхо: обновляем статус
        const sender = data.sender_username || data.from_user || '';
        if (sender === identity.username) {
          updateGroupMessageStatus(data.message_id, 'delivered').catch(() => {});
        }
      }
    });
  };

  useEffect(() => {
    if (messages.length === 0) return;
    loadGroupReactions();
  }, [messages.length]);

  useEffect(() => {
    const unsubGroupRead = wsManager.onGroupRead((data) => {
      if (data.groupId !== id) return;
      saveGroupMessageRead(data.messageId, data.fromUser).catch(() => {});
      setReadCountsMap(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(data.messageId) || 0;
        newMap.set(data.messageId, current + 1);
        return newMap;
      });
      setMessages(prev => prev.map(m =>
        m.id === data.messageId && m.senderUsername === myUsername
          ? { ...m, status: 'read' as const }
          : m
      ));
    });
    return () => { unsubGroupRead(); };
  }, [id, myUsername]);

  const loadGroupReactions = async () => {
    try {
      const { getGroupReactionsForMessages: batchGet } = await import('../../src/services/reactionsService');
      const map = await batchGet(messages.map(m => m.id));
      setReactionsMap(map);
    } catch {}
  };

  const handleLongPress = async (msg: GroupMessage) => {
    setActionSheetMessageId(msg.id);
    const current = await getMyReaction(msg.id, myUsername);
    setMyReaction(current);
    const isMine = msg.senderUsername === myUsername;
    const options: ActionSheetOption[] = [
      {
        label: t('chat.reply'),
        icon: 'arrow-undo',
        onPress: () => {
          setReplyMessage(msg);
          setActionSheetVisible(false);
        },
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
          setActionSheetVisible(false);
        },
      },
      ...(isMine ? [{
        label: t('chat.deleteMessage'),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () => {
          setActionSheetVisible(false);
          // handleDeleteGroupMessage(msg.id);
        },
      }] : []),
    ];
    setActionSheetTitle(t('chat.sendMessage'));
    setActionSheetOptions(options);
    setActionSheetVisible(true);
  };

  const handleReaction = async (emoji: string) => {
    if (!actionSheetMessageId) return;
    const result = await toggleReaction(actionSheetMessageId, emoji, myUsername, undefined, id);
    setMyReaction(result.reaction);
    await loadGroupReactions();
    setActionSheetVisible(false);
    if (result.reaction) {
      try {
        await sendGroupMessageToServer({
          group_id: id!,
          sender_username: myUsername,
          content_type: 'reaction',
          content_text: JSON.stringify({ message_id: actionSheetMessageId, reaction: result.reaction }),
        });
      } catch {}
    }
  };

const handleSendText = async () => {
    if (!inputText.trim() || !id || !myUsername) return;
    const content = inputText.trim();
    setInputText('');

    onSendMessage();

    const replyId = replyMessage?.id || null;
    const replyText = replyMessage?.contentText || replyMessage?.replyToText || null;
    const replyToUsername = replyMessage?.senderUsername || null;
    setReplyMessage(null);

    const msgId = `grpmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMsg: GroupMessage = {
      id: msgId,
      groupId: id,
      senderUsername: myUsername,
      contentType: 'text',
      contentText: content,
      contentUri: null,
      mediaMimeType: null,
      replyToId: replyId,
      replyToText: replyText,
      replyToUsername,
      timestamp: Date.now(),
      status: 'sending',
      isSystem: false,
      isDeleted: false,
    };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      setCachedGroupMessages(id!, updated);
      return updated;
    });

    await ensureGroupExistsLocally(id!, group?.name || id!, myUsername);

    await sendGroupMessageLocal({
      groupId: id,
      senderUsername: myUsername,
      contentType: 'text',
      contentText: content,
      replyToId: replyId || undefined,
      replyToText: replyText || undefined,
    });

    try {
      const result = await sendGroupMessageToServer({
        group_id: id,
        sender_username: myUsername,
        content_type: 'text',
        content_text: content,
        reply_to_id: replyId || undefined,
        reply_to_text: replyText || undefined,
      });
      if (result.message_id) {
        await updateGroupMessageId(msgId, result.message_id);
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev.map(m => {
              if (m.id === result.message_id) {
                return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || msgId };
              }
              if (m.id === msgId) return null;
              return m;
            }).filter((m): m is GroupMessage => m !== null);
            setCachedGroupMessages(id!, merged);
            return merged;
          }
          const updated = prev.map(m => m.id === msgId ? { ...m, id: result.message_id!, status: 'sent' as const, timestamp: serverTimestamp } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      } else {
        await updateGroupMessageStatus(msgId, 'failed');
        setMessages(prev => {
          const updated = prev.map(m => m.id === msgId ? { ...m, status: 'failed' as const } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Send group message error:', error);
      await updateGroupMessageStatus(msgId, 'failed');
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, status: 'failed' as const } : m);
        setCachedGroupMessages(id!, updated);
        return updated;
      });
    }
  };

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

  const handleSendMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('common.permissionNeeded'), t('common.cameraAccess'));
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
    processedUri = await fileToDataUri(processedUri, mimeType);

    onSendMessage();

    const replyId = replyMessage?.id || null;
    const replyText = replyMessage?.contentText || replyMessage?.replyToText || null;
    const replyToUsername = replyMessage?.senderUsername || null;
    setReplyMessage(null);

    const msgId = `grpmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMsg: GroupMessage = {
      id: msgId,
      groupId: id!,
      senderUsername: myUsername,
      contentType: mediaType as 'image' | 'video',
      contentText: null,
      contentUri: processedUri,
      mediaMimeType: mimeType,
      replyToId: replyId,
      replyToText: replyText,
      replyToUsername,
      timestamp: Date.now(),
      status: 'sending',
      isSystem: false,
      isDeleted: false,
    };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      setCachedGroupMessages(id!, updated);
      return updated;
    });

    await ensureGroupExistsLocally(id!, group?.name || id!, myUsername);

    await sendGroupMessageLocal({
      groupId: id!,
      senderUsername: myUsername,
      contentType: mediaType as 'image' | 'video',
      contentUri: processedUri,
      mediaMimeType: mimeType,
      replyToId: replyId || undefined,
      replyToText: replyText || undefined,
    });

    try {
      const result = await sendGroupMessageToServer({
        group_id: id!,
        sender_username: myUsername,
        content_type: mediaType,
        content_text: '',
        content_uri: processedUri,
        reply_to_id: replyId || undefined,
        reply_to_text: replyText || undefined,
      });
      if (result.message_id) {
        await updateGroupMessageId(msgId, result.message_id);
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev.map(m => {
              if (m.id === result.message_id) {
                return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || msgId };
              }
              if (m.id === msgId) return null;
              return m;
            }).filter((m): m is GroupMessage => m !== null);
            setCachedGroupMessages(id!, merged);
            return merged;
          }
          const updated = prev.map(m => m.id === msgId ? { ...m, id: result.message_id!, status: 'sent' as const, timestamp: serverTimestamp } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      } else {
        await updateGroupMessageStatus(msgId, 'failed');
        setMessages(prev => {
          const updated = prev.map(m => m.id === msgId ? { ...m, status: 'failed' as const } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Send group media error:', error);
      await updateGroupMessageStatus(msgId, 'failed');
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, status: 'failed' as const } : m);
        setCachedGroupMessages(id!, updated);
        return updated;
      });
    }
  };

  // ─── Voice recording ──────────────────────────────────────
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.permissionNeeded'), t('common.microphoneAccess'));
        return;
      }
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
  };

  const stopRecording = async () => {
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
      if (recordingDuration < 1) return;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const dataUri = `data:audio/m4a;base64,${base64}`;

      const replyId = replyMessage?.id || null;
      const replyText = replyMessage?.contentText || replyMessage?.replyToText || null;
      const replyToUsername = replyMessage?.senderUsername || null;

      setReplyMessage(null);
      onSendMessage();
      const msg = await sendGroupMessageLocal({
        groupId: id!,
        senderUsername: myUsername,
        contentType: 'voice',
        contentUri: dataUri,
        mediaMimeType: 'audio/m4a',
        replyToId: replyId,
        replyToText: replyText,
        replyToUsername,
      });

      setMessages(prev => {
        const updated = [...prev, msg];
        setCachedGroupMessages(id!, updated);
        return updated;
      });

      await ensureGroupExistsLocally(id!, group?.name || id!, myUsername);

      const result = await sendGroupMessageToServer({
        group_id: id!, sender_username: myUsername, content_type: 'voice',
        content_text: '', content_uri: dataUri,
      });
if (result.message_id) {
        await updateGroupMessageId(msg.id, result.message_id);
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            // Merge: update the existing server message with our local info (replyTo, etc.)
            const merged = prev.map(m => {
              if (m.id === result.message_id) {
                return { ...m, status: 'sent' as const, timestamp: serverTimestamp, replyToId: m.replyToId || msg.id };
              }
              if (m.id === msg.id) return null; // Remove temp message
              return m;
            }).filter((m): m is GroupMessage => m !== null);
            setCachedGroupMessages(id!, merged);
            return merged;
          }
          // Normal case: update temp message to server ID
          const updated = prev.map(m => m.id === msg.id ? { ...m, id: result.message_id!, status: 'sent' as const, timestamp: serverTimestamp } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      } else {
        await updateGroupMessageStatus(msg.id, 'failed');
        setMessages(prev => {
          const updated = prev.map(m => m.id === msg.id ? { ...m, status: 'failed' as const } : m);
          setCachedGroupMessages(id!, updated);
          return updated;
        });
      }
    } catch { console.error('Failed to stop recording'); }
  };

  const toggleVoicePlayback = async (uri: string) => {
    if (currentVoiceMsg === uri && sound) {
      const status: any = await sound.getStatusAsync();
      if (status.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else if (status.positionMillis < (status.durationMillis || 0)) {
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        await sound.setPositionAsync(0);
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }
    if (sound) { await sound.unloadAsync(); setSound(null); }
    setIsPlaying(false);
    setPlaybackProgress(0);
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri }, { shouldPlay: true }
      );
      setSound(newSound);
      setCurrentVoiceMsg(uri);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setPlaybackProgress(status.positionMillis || 0);
          setPlaybackDuration(status.durationMillis || 0);
          if (!status.isPlaying && status.didJustFinish) {
            setIsPlaying(false);
            setPlaybackProgress(0);
          }
        }
      });
    } catch { console.error('Failed to play voice'); }
  };

  const openMediaViewer = useCallback((uri: string, type: 'image' | 'video', mimeType?: string, title?: string) => {
    setMediaViewerUri(uri);
    setMediaViewerType(type);
    setMediaViewerMimeType(mimeType);
    setMediaViewerTitle(title);
    setMediaViewerVisible(true);
  }, []);

  const renderMessage = ({ item, index }: { item: GroupMessage; index: number }) => {
    if (item.isSystem) {
      return <SystemMessage message={item} colors={colors} />;
    }
    const isNew = index >= initialMsgCount.current;
    const bubble = (
      <MessageBubble
        message={item}
        isMine={item.senderUsername === myUsername}
        colors={colors}
        isDark={isDark}
        onLongPress={handleLongPress}
        reactions={reactionsMap.get(item.id)}
        onVoiceToggle={toggleVoicePlayback}
        voiceState={{ currentVoiceMsg, isPlaying, playbackProgress, playbackDuration }}
        readCount={readCountsMap.get(item.id) || 0}
        memberCount={memberCount}
        myUsername={myUsername}
        onPressMedia={openMediaViewer}
      />
    );
    return isNew ? <FadeInView duration={200}>{bubble}</FadeInView> : bubble;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={{ paddingTop: insets.top }}>
        <GroupHeader
          group={group}
          memberCount={memberCount}
          onBack={() => router.back()}
          onInfo={() => router.push(`/group/${id}/info` as any)}
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
                    <Ionicons name="people-outline" size={48} color={colors.textSecondary + '60'} />
                    <Text style={[styles.emptyTitle, { color: colors.accent }]}>
                {group?.name || t('group.fallbackName')}
                    </Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {t('group.noChats')}
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

            {canWrite ? (
              <View style={[
                styles.inputContainer,
                {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom + 4,
                }
              ]}>
                {replyMessage && (
                  <View style={[styles.replyPreview, { backgroundColor: colors.accent + '08', borderLeftColor: colors.accent }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.replyPreviewUser, { color: colors.accent }]}>{t('chat.reply')}</Text>
                      <Text style={[styles.replyPreviewText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {replyMessage.contentText || replyMessage.contentUri ? '📷 Media' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setReplyMessage(null)}>
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
                {isRecording && (
                  <View style={[styles.recordingBar, { backgroundColor: '#D32F2F20', borderColor: '#D32F2F40' }]}>
                    <View style={styles.recordingDot} />
                    <Text style={[styles.recordingTimer, { color: '#D32F2F' }]}>
                      {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:
                      {String(recordingDuration % 60).padStart(2, '0')}
                    </Text>
                    <Text style={[styles.recordingLabel, { color: '#D32F2F' }]}>{t('chat.recording')}</Text>
                  </View>
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
                      style={[styles.input, { color: colors.text }]}
                      value={inputText}
                      onChangeText={setInputText}
                      placeholder={t('chat.sendMessage')}
                      placeholderTextColor={colors.textSecondary + '80'}
                      multiline
                      maxLength={5000}
                    />
                  </View>
                  {inputText.trim() ? (
                    <TouchableOpacity
                      style={[styles.sendButton, { backgroundColor: colors.accent }]}
                      onPress={handleSendText}
                    >
                      <Ionicons name="arrow-up" size={20} color="#FFF" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.micButton, {
                        backgroundColor: isRecording ? '#D32F2F' : colors.accent + '10',
                        borderColor: isRecording ? '#D32F2F' : colors.border,
                      }]}
                      onPressIn={startRecording}
                      onPressOut={stopRecording}
                    >
                      <Ionicons name={isRecording ? 'stop' : 'mic-outline'} size={20} color={isRecording ? '#FFF' : colors.accent} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}
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

      <ActionSheet
        visible={actionSheetVisible}
        title={actionSheetTitle}
        options={actionSheetOptions}
        onCancel={() => setActionSheetVisible(false)}
        reactions
        selectedReaction={myReaction}
        onReaction={handleReaction}
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
  sendButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 0 },
  micButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 0, borderWidth: 0.5 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4, borderRadius: 8, borderLeftWidth: 3 },
  replyPreviewUser: { fontSize: 11, fontWeight: '600' },
  replyPreviewText: { fontSize: 12, fontWeight: '300' },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, paddingHorizontal: 16, marginHorizontal: 2, marginBottom: 4,
    borderRadius: 12, borderWidth: 0.5, gap: 8,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D32F2F' },
  recordingTimer: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  recordingLabel: { fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
});

export default GroupChatScreen;
