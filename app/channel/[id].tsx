import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Platform, Dimensions, StatusBar, Keyboard, KeyboardAvoidingView, Alert, BackHandler } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { Audio, Video, ResizeMode } from 'expo-av';
import { getLocalIdentity } from '../../src/services/identity';
import { getChannelFromServer, sendChannelMessageToServer } from '../../src/services/api';
import { getChannelById, getChannelMembers, getChannelMessages, saveChannelMessage, updateChannelMessageId, ChannelData, ChannelMessage as OldChannelMessage, isChannelOwner, upsertChannel, upsertChannelMembers, ensureChannelExistsLocally } from '../../src/services/channelService';
import { sendChannelMessage as sendChannelMessageLocal, ChannelMessage } from '../../src/services/channelMessageService';
import { toggleReaction, getMyReaction } from '../../src/services/reactionsService';
import { wsManager } from '../../src/services/websocket';
import { t } from '../../src/services/i18n';
import { setPendingForward } from '../../src/services/forwardService';
import ActionSheet, { ActionSheetOption } from '../../src/components/ActionSheet';
import { getCachedChannelMessages, setCachedChannelMessages, appendChannelMessage, removeChannelMessageFromCache } from '../../src/services/messageCache';
import { FadeInView } from '../../src/utils/animations';
import { useChatScroll } from '../../src/hooks/useChatScroll';
import ScrollToBottomButton from '../../src/components/ui/ScrollToBottomButton';
import MediaViewer from '../../src/components/ui/MediaViewer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ChannelHeader = ({ channel, memberCount, onBack, onInfo, colors }: any) => {
  return (
    <View style={[headerStyles.container, { backgroundColor: colors.surface + 'F0', borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack} style={headerStyles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.accent} />
      </TouchableOpacity>
      <TouchableOpacity style={headerStyles.info} onPress={onInfo}>
        <View style={[headerStyles.avatar, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '30' }]}>
          {channel?.avatarUri ? (
            <Image source={{ uri: channel.avatarUri }} style={headerStyles.avatarImage} />
          ) : (
            <Ionicons name="megaphone-outline" size={20} color={colors.accent} />
          )}
        </View>
        <View style={headerStyles.textInfo}>
          <Text style={[headerStyles.name, { color: colors.primary }]} numberOfLines={1}>
            {channel?.name || t('channel.fallbackName')}
          </Text>
          <Text style={[headerStyles.subtitle, { color: colors.textSecondary }]}>
            {t('channel.header', String(memberCount))}
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
  container: { flexDirection: 'row', alignItems: 'center', paddingTop: 4, paddingBottom: 8, paddingHorizontal: 8, borderBottomWidth: 0.5 },
  backButton: { padding: 8 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  avatarImage: { width: 38, height: 38, borderRadius: 19 },
  textInfo: { gap: 1, flex: 1 },
  name: { fontSize: 16, fontWeight: '400', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
  infoButton: { padding: 8 },
});

const ChannelVoicePlayer = ({ uri, colors }: { uri: string; colors: any }) => {
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
              if (s.didJustFinish) { setIsPlaying(false); setPosition(0); if (intervalRef.current) clearInterval(intervalRef.current); }
            }
          }, 200);
        }
      } else {
        const { sound, status } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        setIsPlaying(true);
        if (status.isLoaded) setDuration(status.durationMillis || 0);
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded) {
            setPosition(s.positionMillis);
            setDuration(s.durationMillis || 0);
            if (s.didJustFinish) { setIsPlaying(false); setPosition(0); }
          }
        });
      }
    } catch (e) { console.error('Voice playback error:', e); }
  };

  const seek = async (value: number) => {
    if (soundRef.current) { await soundRef.current.setPositionAsync(value); setPosition(value); }
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

const ChannelReactionBar = ({ reactions, colors }: { reactions: { username: string; reaction: string }[]; colors: any }) => {
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 0.5 },
  emoji: { fontSize: 13 },
  count: { fontSize: 11, fontWeight: '500' },
});

const ChannelChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [canWrite, setCanWrite] = useState(false);
  const [replyMessage, setReplyMessage] = useState<ChannelMessage | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState<string | undefined>();
  const [reactionsMap, setReactionsMap] = useState<Map<string, { username: string; reaction: string }[]>>(new Map());
  const [myReaction, setMyReaction] = useState<string | null>(null);
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

  const loadChannelMsgs = async (channelId: string) => {
    const msgs = await getChannelMessages(channelId);
    setMessages(msgs);
    setCachedChannelMessages(channelId, msgs);
    return msgs;
  };

  const loadData = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    const myUser = identity.username;
    setMyUsername(myUser);

    const channelId = id!;

    // 1. Сразу показываем кэш (если есть)
    const cached = getCachedChannelMessages(channelId);
    if (cached) {
      setMessages(cached);
      initialMsgCount.current = cached.length;
    }

    // 2. Фоново синхронизируем с сервера
    try {
      const serverChannel = await getChannelFromServer(channelId);
      if (serverChannel && serverChannel.id) {
        await upsertChannel({
          id: serverChannel.id,
          name: serverChannel.name,
          description: serverChannel.description || '',
          avatar_uri: serverChannel.avatar_uri || '',
          owner_username: serverChannel.owner_username,
          created_at: serverChannel.created_at,
          updated_at: serverChannel.updated_at || serverChannel.created_at,
        });
        if (serverChannel.members && serverChannel.members.length > 0) {
          await upsertChannelMembers(serverChannel.id, serverChannel.members);
        }
      }
    } catch (_e) {}

    // 3. Загружаем из локальной БД (всегда актуально)
    const channelData = await getChannelById(channelId);
    setChannel(channelData);
    const members = await getChannelMembers(channelId);
    setMemberCount(members.length);

    if (channelData && myUser) {
      const owner = await isChannelOwner(channelId, myUser);
      setCanWrite(owner);
    }

    const msgs = await loadChannelMsgs(channelId);
    if (!cached) initialMsgCount.current = msgs.length;

    if (unsubscribeRef.current) unsubscribeRef.current();

    unsubscribeRef.current = wsManager.onSystemMessage('channel_message', async (data: any) => {
      if (data.group_id === id) {
        // Handle reaction messages
        if (data.content_type === 'reaction') {
          try {
            const payload = JSON.parse(data.content_text || '{}');
            const { setReaction, removeReaction } = await import('../../src/services/reactionsService');
            const sender = data.sender_username || data.from_user || '';
            if (payload.reaction) {
              await setReaction(payload.message_id, payload.reaction, sender, undefined, id);
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
                const existing = (m.get(payload.message_id) || []).filter(r => r.username !== sender);
                if (existing.length > 0) m.set(payload.message_id, existing);
                else m.delete(payload.message_id);
                return m;
              });
            }
          } catch {}
          return;
        }
        // Как в DM: загружаем из БД после того, как глобальный обработчик сохранил
        const updated = await getChannelMessages(channelId);
        if (updated.length > 0) {
          const lastMsg = updated[updated.length - 1];
          setMessages(prev => {
            if (prev.some(m => m.id === lastMsg.id)) return prev;
            const result = [...prev, lastMsg];
            setCachedChannelMessages(channelId, result);
            return result;
          });
        }
      }
    });
  };

  // Ensure channel exists in local DB before saving messages (like createOrGetChat for DMs)
  const ensureChannelExistsLocally = async (channelId: string, channelName: string, ownerUsername: string) => {
    try {
      const { getChannelById, upsertChannel } = await import('../../src/services/channelService');
      const existing = await getChannelById(channelId);
      if (!existing) {
        await upsertChannel({
          id: channelId,
          name: channelName,
          description: '',
          avatar_uri: '',
          owner_username: ownerUsername,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    } catch (e) {
      console.warn('ensureChannelExistsLocally failed:', e);
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

    try {
      const msg = await sendChannelMessageLocal({
        channelId: id!,
        senderUsername: myUsername,
        contentText: content,
        contentType: 'text',
        replyToId: replyId || undefined,
        replyToText: replyText || undefined,
        replyToUsername,
      });

      setMessages(prev => {
        const updated = [...prev, msg];
        setCachedChannelMessages(id!, updated);
        return updated;
      });

      const result = await sendChannelMessageToServer({
        channel_id: id!,
        sender_username: myUsername,
        content_type: 'text',
        content_text: content,
        reply_to_id: replyId || undefined,
        reply_to_text: replyText || undefined,
        reply_to_username: replyToUsername || undefined,
      });
      if (result.message_id) {
        await updateChannelMessageId(msg.id, result.message_id);
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev
              .map((m): ChannelMessage | null => {
                if (m.id === result.message_id) {
                  return { ...m, timestamp: serverTimestamp, replyToId: m.replyToId || msg.id };
                }
                if (m.id === msg.id) return null;
                return m;
              })
              .filter((m): m is ChannelMessage => m !== null);
            setCachedChannelMessages(id!, merged);
            return merged;
          }
          const updated = prev.map(m => m.id === msg.id ? { ...m, id: result.message_id!, timestamp: serverTimestamp } : m);
          setCachedChannelMessages(id!, updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Send channel message error:', error);
    }
  };

  const fileToDataUri = async (fileUri: string, mimeType: string): Promise<string> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:${mimeType};base64,${base64}`;
    } catch { return fileUri; }
  };

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

    const msgId = `chmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMsg: ChannelMessage = {
      id: msgId, channelId: id!, senderUsername: myUsername,
      contentType: mediaType as 'image' | 'video',
      contentText: null, contentUri: processedUri,
      mediaMimeType: mimeType, replyToId: replyId, replyToText: replyText,
      replyToUsername,
      timestamp: Date.now(), status: 'sending', isSystem: false, isDeleted: false,
    };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      setCachedChannelMessages(id!, updated);
      return updated;
    });

    try {
      const msg = await sendChannelMessageLocal({
        channelId: id!,
        senderUsername: myUsername,
        contentType: mediaType as 'image' | 'video',
        contentUri: processedUri,
        mediaMimeType: mimeType,
        replyToId: replyId || undefined,
        replyToText: replyText || undefined,
      });

      setMessages(prev => {
        const updated = [...prev, msg];
        setCachedChannelMessages(id!, updated);
        return updated;
      });

      const result = await sendChannelMessageToServer({
        channel_id: id!,
        sender_username: myUsername,
        content_type: mediaType,
        content_text: '',
        content_uri: processedUri,
        media_mime_type: mimeType,
        reply_to_id: replyId || undefined,
        reply_to_text: replyText || undefined,
      });
      if (result.message_id) {
        await updateChannelMessageId(msg.id, result.message_id);
        // Use server timestamp for consistent ordering across timezones
const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
if (existingServerMsg) {
            const merged = prev
              .map((m): ChannelMessage | null => {
                if (m.id === result.message_id) {
                  return { ...m, timestamp: serverTimestamp, replyToId: m.replyToId || msg.id };
                }
                if (m.id === msg.id) return null;
                return m;
              })
              .filter((m): m is ChannelMessage => m !== null);
            setCachedChannelMessages(id!, merged);
            return merged;
          }
          const updated = prev.map(m => m.id === msg.id ? { ...m, id: result.message_id!, timestamp: serverTimestamp } : m);
          setCachedChannelMessages(id!, updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Send channel media error:', error);
    }
  };

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
      const msg = await sendChannelMessageLocal({
        channelId: id!,
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
        setCachedChannelMessages(id!, updated);
        return updated;
      });

      const result = await sendChannelMessageToServer({
        channel_id: id!, sender_username: myUsername,
        content_type: 'voice', content_text: '', content_uri: dataUri,
        media_mime_type: 'audio/m4a',
      });
      if (result.message_id) {
        await updateChannelMessageId(msg.id, result.message_id);
        // Use server timestamp for consistent ordering across timezones
        const serverTimestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        setMessages(prev => {
          // Check if message with server ID already exists (from WebSocket echo) - merge instead of duplicate
          const existingServerMsg = prev.find(m => m.id === result.message_id);
          if (existingServerMsg) {
            const merged = prev
              .map((m): ChannelMessage | null => {
                if (m.id === result.message_id) {
                  return { ...m, timestamp: serverTimestamp, replyToId: m.replyToId || msg.id };
                }
                if (m.id === msg.id) return null;
                return m;
              })
              .filter((m): m is ChannelMessage => m !== null);
            setCachedChannelMessages(id!, merged);
            return merged;
          }
          const updated = prev.map(m => m.id === msg.id ? { ...m, id: result.message_id!, timestamp: serverTimestamp } : m);
          setCachedChannelMessages(id!, updated);
          return updated;
        });
      }
    } catch (e) {
      console.error('Failed to stop recording', e);
    }
  };

  const loadChannelReactions = async () => {
    try {
      const { getGroupReactionsForMessages: batchGet } = await import('../../src/services/reactionsService');
      const map = await batchGet(messages.map(m => m.id));
      setReactionsMap(map);
    } catch (e) {
      console.error('Failed to load channel reactions', e);
    }
  };

  useEffect(() => {
    if (messages.length === 0) return;
    loadChannelReactions();
  }, [messages.length]);

  const handleReaction = async (emoji: string) => {
    if (!actionSheetMessageId) return;
    const result = await toggleReaction(actionSheetMessageId, emoji, myUsername, undefined, id);
    setMyReaction(result.reaction);
    await loadChannelReactions();
    setActionSheetVisible(false);
    if (result.reaction) {
      try {
        await sendChannelMessageToServer({
          channel_id: id!,
          sender_username: myUsername,
          content_type: 'reaction',
          content_text: JSON.stringify({ message_id: actionSheetMessageId, reaction: result.reaction }),
        });
      } catch {}
    }
  };

  const handleLongPress = async (msg: ChannelMessage) => {
    setActionSheetMessageId(msg.id);
    const current = await getMyReaction(msg.id, myUsername);
    setMyReaction(current);
    const isMine = msg.senderUsername === myUsername;
    const options: ActionSheetOption[] = [
      {
        label: t('chat.reply'),
        icon: 'arrow-undo',
        onPress: () => { setReplyMessage(msg); setActionSheetVisible(false); },
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
      {
        label: t('chat.copyMessage'),
        icon: 'copy-outline',
        onPress: async () => { await Clipboard.setStringAsync(msg.contentText || msg.contentUri || ''); setActionSheetVisible(false); },
      },
      ...(isMine ? [{
        label: t('chat.deleteMessage'),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () => { setActionSheetVisible(false); },
      }] : []),
    ];
    setActionSheetTitle(t('chat.sendMessage'));
    setActionSheetOptions(options);
    setActionSheetVisible(true);
  };

  const openMediaViewer = useCallback((uri: string, type: 'image' | 'video', mimeType?: string, title?: string) => {
    setMediaViewerUri(uri);
    setMediaViewerType(type);
    setMediaViewerMimeType(mimeType);
    setMediaViewerTitle(title);
    setMediaViewerVisible(true);
  }, []);

  const renderMessage = ({ item, index }: { item: ChannelMessage; index: number }) => {
    if (item.isSystem) {
      return (
        <View style={[systemStyles.container, { backgroundColor: colors.accent + '06' }]}>
          <Text style={[systemStyles.text, { color: colors.textSecondary }]}>{item.contentText}</Text>
        </View>
      );
    }
    const isNew = index >= initialMsgCount.current;
    const isMine = item.senderUsername === myUsername;
    const bubbleColor = isMine ? (isDark ? '#1E3A5F' : colors.accent + '15') : colors.surface;

    const renderContent = () => {
      if (item.contentType === 'image' && item.contentUri) {
        return (
          <TouchableOpacity onPress={() => openMediaViewer(item.contentUri!, 'image', item.mediaMimeType || undefined, undefined)} activeOpacity={0.9}>
            <Image
              source={{ uri: item.contentUri }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              contentFit="cover"
            />
          </TouchableOpacity>
        );
      }
      if (item.contentType === 'video' && item.contentUri) {
        return (
          <TouchableOpacity onPress={() => openMediaViewer(item.contentUri!, 'video', item.mediaMimeType || undefined, undefined)} activeOpacity={0.9}>
            <Video
              source={{ uri: item.contentUri }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          </TouchableOpacity>
        );
      }
      if (item.contentType === 'voice' && item.contentUri) {
        return <ChannelVoicePlayer uri={item.contentUri} colors={colors} />;
      }
      return (
        <Text style={[bubbleStyles.text, { color: colors.text }]}>{item.contentText}</Text>
      );
    };

    const bubble = (
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => handleLongPress(item)} delayLongPress={300}>
        <View style={[bubbleStyles.container, isMine ? bubbleStyles.mine : bubbleStyles.theirs]}>
          {!isMine && (
            <TouchableOpacity onPress={() => router.push(`/profile/${item.senderUsername}`)}>
              <Text style={[bubbleStyles.sender, { color: colors.accent }]}>{item.senderUsername}</Text>
            </TouchableOpacity>
          )}
          <View style={[bubbleStyles.bubble, { backgroundColor: bubbleColor, borderColor: isMine ? (isDark ? '#2B5277' : colors.accent + '30') : colors.border }]}>
{item.replyToText && (
            <TouchableOpacity onPress={() => router.push(`/profile/${item.replyToUsername}`)} style={[bubbleStyles.replyQuote, { backgroundColor: colors.accent + '08', borderLeftColor: colors.accent }]}>
              <Text style={[bubbleStyles.replyUser, { color: colors.accent }]}>{item.replyToUsername === myUsername ? t('chat.you') : (item.replyToUsername || t('chat.reply'))}</Text>
              <Text style={[bubbleStyles.replyText, { color: colors.textSecondary }]} numberOfLines={1}>{item.replyToText}</Text>
            </TouchableOpacity>
          )}
            {item.forwardedFrom && (
              <TouchableOpacity onPress={() => router.push(`/profile/${item.forwardedFrom}` as any)}>
                <Text style={[bubbleStyles.forwardedHeader, { color: colors.accent }]}>
                  {t('forward.forwardedFrom', item.forwardedFrom ?? '')}
                </Text>
              </TouchableOpacity>
            )}
            {renderContent()}
            <View style={bubbleStyles.footer}>
              <Text style={[bubbleStyles.time, { color: colors.textSecondary }]}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </Text>
            </View>
          </View>
          {reactionsMap.get(item.id) && reactionsMap.get(item.id)!.length > 0 && (
            <ChannelReactionBar reactions={reactionsMap.get(item.id)!} colors={colors} />
          )}
        </View>
      </TouchableOpacity>
    );
    return isNew ? <FadeInView duration={200}>{bubble}</FadeInView> : bubble;
  };

return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: insets.top }}>
        <ChannelHeader channel={channel} memberCount={memberCount} onBack={() => router.back()} onInfo={() => router.push(`/channel/${id}/info` as any)} colors={colors} />
      </View>

      {(() => {
        const chatPane = (
          <>
            <View style={styles.flex}>
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
                    <Ionicons name="megaphone-outline" size={48} color={colors.textSecondary + '60'} />
                    <Text style={[styles.emptyTitle, { color: colors.accent }]}>{channel?.name || t('channel.fallbackName')}</Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('channel.noMessages')}</Text>
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
              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 }]}>
                {replyMessage && (
                  <View style={[styles.replyPreview, { backgroundColor: colors.accent + '08', borderLeftColor: colors.accent }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.replyPreviewUser, { color: colors.accent }]}>{t('chat.reply')}</Text>
                      <Text style={[styles.replyPreviewText, { color: colors.textSecondary }]} numberOfLines={1}>{replyMessage.contentText || replyMessage.contentUri ? '📷 Media' : ''}</Text>
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
                      {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(recordingDuration % 60).padStart(2, '0')}
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
                    <TextInput style={[styles.input, { color: colors.text }]} value={inputText} onChangeText={setInputText} placeholder={t('chat.sendMessage')} placeholderTextColor={colors.textSecondary + '80'} multiline maxLength={5000} />
                  </View>
                  {inputText.trim() ? (
                    <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.accent }]} onPress={handleSendText}>
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
            ) : (
              <View style={[styles.lockedBanner, { backgroundColor: colors.glass }]}>
                <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
                <Text style={[styles.lockedText, { color: colors.textSecondary }]}>{t('channel.onlyAdmins')}</Text>
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
  lockedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 10, marginBottom: 6, borderRadius: 12 },
  lockedText: { fontSize: 13, fontWeight: '300' },
});

const bubbleStyles = StyleSheet.create({
  container: { marginBottom: 6, maxWidth: SCREEN_WIDTH * 0.78 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  sender: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2, marginLeft: 4 },
  bubble: { padding: 12, paddingBottom: 6, borderRadius: 16, borderWidth: 0.5 },
  text: { fontSize: 15, lineHeight: 20, fontWeight: '300' },
  replyQuote: { paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, borderRadius: 8, borderLeftWidth: 3 },
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

const systemStyles = StyleSheet.create({
  container: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, marginVertical: 4, maxWidth: SCREEN_WIDTH * 0.8 },
  text: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', fontWeight: '300', letterSpacing: 0.3 },
});

export default ChannelChatScreen;
