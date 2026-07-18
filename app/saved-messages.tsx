import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  Platform, Alert, Dimensions, StatusBar, Keyboard, KeyboardAvoidingView,
  BackHandler,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { getLocalIdentity } from '../src/services/identity';
import {
  sendSavedMessage, getSavedMessages, deleteSavedMessage,
  SavedMessage,
} from '../src/services/savedMessagesService';
import { toggleReaction, getMyReaction } from '../src/services/reactionsService';
import { setPendingForward } from '../src/services/forwardService';
import ActionSheet, { ActionSheetOption } from '../src/components/ActionSheet';
import ScrollToBottomButton from '../src/components/ui/ScrollToBottomButton';
import MediaViewer from '../src/components/ui/MediaViewer';
import { useChatScroll } from '../src/hooks/useChatScroll';
import { FadeInView } from '../src/utils/animations';
import { downloadFile } from '../src/utils/downloadFile';
import { t } from '../src/services/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SavedHeader = ({ onBack, colors }: { onBack: () => void; colors: any }) => (
  <View style={[headerStyles.container, { backgroundColor: colors.surface + 'F0', borderBottomColor: colors.border }]}>
    <TouchableOpacity onPress={onBack} style={headerStyles.backButton}>
      <Ionicons name="chevron-back" size={24} color={colors.accent} />
    </TouchableOpacity>
    <View style={[headerStyles.avatar, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
      <Ionicons name="bookmark" size={20} color={colors.accent} />
    </View>
    <View style={headerStyles.textInfo}>
      <Text style={[headerStyles.name, { color: colors.primary }]}>{t('saved.title')}</Text>
      <Text style={[headerStyles.status, { color: colors.textSecondary }]}>{t('saved.chatListLabel')}</Text>
    </View>
  </View>
);

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 4, paddingBottom: 8, paddingHorizontal: 8,
    borderBottomWidth: 0.5,
  },
  backButton: { padding: 8 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginRight: 10,
  },
  textInfo: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontWeight: '400', letterSpacing: 0.5 },
  status: { fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
});

const ReplyBar = ({ replyToText, replyToUser, onCancel, colors }: any) => (
  <View style={[replyStyles.container, { backgroundColor: colors.accent + '10', borderLeftColor: colors.accent }]}>
    <View style={replyStyles.content}>
      <Ionicons name="arrow-undo" size={14} color={colors.accent} />
      <View style={replyStyles.info}>
        <Text style={[replyStyles.user, { color: colors.accent }]}>{replyToUser}</Text>
        <Text style={[replyStyles.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {replyToText || t('chat.mediaFallback')}
        </Text>
      </View>
    </View>
    <TouchableOpacity onPress={onCancel} style={replyStyles.cancel}>
      <Ionicons name="close" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  </View>
);

const replyStyles = StyleSheet.create({
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
          { uri }, { shouldPlay: true }
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
        <View key={emoji} style={[reactStyles.reactionPill, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '30' }]}>
          <Text style={reactStyles.reactionEmoji}>{emoji}</Text>
          {count > 1 && <Text style={[reactStyles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>}
        </View>
      ))}
    </View>
  );
};

const reactStyles = StyleSheet.create({
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 0.5,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 10, fontWeight: '500' },
});

const MessageBubble = ({ message, isMine, colors, isDark, onLongPress, onReply, reactions, onPressMedia }: any) => {
  const bubbleColor = isMine
    ? isDark ? '#1E3A5F' : colors.accent + '15'
    : colors.surface;

  const renderContent = () => {
    switch (message.contentType) {
      case 'image':
        return (
          <TouchableOpacity onPress={() => onPressMedia?.(message.contentUri!, 'image', message.mediaMimeType)} activeOpacity={0.9}>
            <Image
              source={{ uri: message.contentUri! }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              contentFit="cover"
            />
          </TouchableOpacity>
        );
      case 'video':
        return (
          <TouchableOpacity onPress={() => onPressMedia?.(message.contentUri!, 'video', message.mediaMimeType)} activeOpacity={0.9}>
            <Image
              source={{ uri: message.contentUri! }}
              style={[bubbleStyles.mediaImage, { borderColor: isMine ? colors.accent + '30' : colors.border }]}
              contentFit="cover"
            />
          </TouchableOpacity>
        );
      case 'voice':
        return <VoicePlayer uri={message.contentUri!} colors={colors} />;
      default:
        return <Text style={[bubbleStyles.text, { color: colors.text }]}>{message.contentText}</Text>;
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onLongPress={() => onLongPress(message)} delayLongPress={300}>
      <View style={[
        bubbleStyles.container,
        isMine ? bubbleStyles.mine : bubbleStyles.theirs,
        { backgroundColor: bubbleColor, borderColor: isMine ? (isDark ? '#2B5277' : colors.accent + '30') : colors.border },
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
          <Text style={[bubbleStyles.forwardedHeader, { color: colors.accent }]}>
            {t('forward.forwardedFrom', message.forwardedFrom)}
          </Text>
        )}
        {renderContent()}
        <View style={bubbleStyles.footer}>
          <Text style={[bubbleStyles.time, { color: colors.textSecondary }]}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </Text>
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
  replyQuote: { paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, borderRadius: 8, borderLeftWidth: 3 },
  replyUser: { fontSize: 11, fontWeight: '600', marginBottom: 1 },
  replyText: { fontSize: 12, fontWeight: '300' },
  forwardedHeader: { fontSize: 12, fontStyle: 'italic', fontWeight: '500', marginBottom: 4 },
  mediaImage: { width: 200, height: 200, borderRadius: 12, borderWidth: 0.5, marginBottom: 4 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 4 },
  time: { fontSize: 10, letterSpacing: 0.3 },
});

const EmptyState = ({ colors, myUsername }: { colors: any; myUsername: string }) => (
  <View style={emptyStyles.container}>
    <View style={[emptyStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[emptyStyles.iconCircle, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
        <Ionicons name="bookmark" size={32} color={colors.accent} />
      </View>
      <Text style={[emptyStyles.title, { color: colors.primary }]}>{t('saved.emptyTitle')}</Text>
      <Text style={[emptyStyles.body, { color: colors.textSecondary }]}>
        {t('saved.emptyBody')}
      </Text>
      <View style={[emptyStyles.divider, { backgroundColor: colors.accent + '30' }]} />
      <View style={emptyStyles.hintRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
        <Text style={[emptyStyles.hintText, { color: colors.textSecondary }]}>
          {t('saved.emptyHint', myUsername)}
        </Text>
      </View>
    </View>
  </View>
);

const emptyStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, marginTop: -40 },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', gap: 12 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '300', letterSpacing: 1 },
  body: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '300' },
  divider: { height: 1, width: 40, marginVertical: 4 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '300' },
});

const SavedMessagesScreen = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [replyMessage, setReplyMessage] = useState<SavedMessage | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState<string | undefined>();
  const [reactionsMap, setReactionsMap] = useState<Map<string, { username: string; reaction: string }[]>>(new Map());
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerUri, setMediaViewerUri] = useState<string>('');
  const [mediaViewerType, setMediaViewerType] = useState<'image' | 'video'>('image');
  const [mediaViewerMimeType, setMediaViewerMimeType] = useState<string | undefined>(undefined);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef(0);
  const headerHeight = insets.top + 50;

  const {
    onContentSizeChange, onScroll, onScrollBeginDrag,
    onScrollToBottomPress, onSendMessage, showScrollButton,
  } = useChatScroll({ flatListRef, messages, myUsername });

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

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;
    setMyUsername(identity.username);
    const msgs = await getSavedMessages(100);
    setMessages(msgs);
  };

  useEffect(() => {
    if (messages.length === 0) return;
    loadReactions();
  }, [messages.length]);

  const loadReactions = useCallback(async () => {
    try {
      const { getGroupReactionsForMessages: batchGet } = await import('../src/services/reactionsService');
      const map = await batchGet(messages.map(m => m.id));
      setReactionsMap(map);
    } catch {}
  }, [messages]);

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

  const sendTextMessage = useCallback(async (text: string, replyTo?: SavedMessage | null) => {
    if (!text.trim()) return;
    const content = text.trim();
    setInputText('');

    onSendMessage();

    const message = await sendSavedMessage({
      senderUsername: myUsername,
      contentText: content,
      contentType: 'text',
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.contentText || replyTo?.replyToText || null,
      replyToUsername: replyTo?.senderUsername || null,
    });
    setReplyMessage(null);
    setMessages(prev => [...prev, message]);
  }, [myUsername]);

  const handleSendText = useCallback(() => {
    if (!inputText.trim()) return;
    sendTextMessage(inputText, replyMessage);
  }, [inputText, sendTextMessage, replyMessage]);

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
    processedUri = await fileToDataUri(processedUri, mimeType);

    onSendMessage();

    const message = await sendSavedMessage({
      senderUsername: myUsername,
      contentType: mediaType as 'image' | 'video',
      contentUri: processedUri,
      mediaMimeType: mimeType,
      replyToId: replyMessage?.id || null,
      replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
      replyToUsername: replyMessage?.senderUsername || null,
    });
    setReplyMessage(null);
    setMessages(prev => [...prev, message]);
  }, [myUsername, replyMessage]);

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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = recording.getURI();
      if (!uri) return;
      if (recordingDuration < 1) return;
      const voiceDataUri = await fileToDataUri(uri, 'audio/m4a');

      onSendMessage();
      const message = await sendSavedMessage({
        senderUsername: myUsername,
        contentType: 'voice',
        contentUri: voiceDataUri,
        mediaMimeType: 'audio/m4a',
        replyToId: replyMessage?.id || null,
        replyToText: replyMessage?.contentText || replyMessage?.replyToText || null,
        replyToUsername: replyMessage?.senderUsername || null,
      });
      setReplyMessage(null);
      setMessages(prev => [...prev, message]);
    } catch (error) {
      console.error('Voice send error:', error);
    }
  }, [myUsername, replyMessage, recordingDuration]);

  const handleDeleteMessage = async (messageId: string) => {
    await deleteSavedMessage(messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleLongPress = useCallback((msg: SavedMessage) => {
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

  const openMediaViewer = useCallback((uri: string, type: 'image' | 'video', mimeType?: string) => {
    setMediaViewerUri(uri);
    setMediaViewerType(type);
    setMediaViewerMimeType(mimeType);
    setMediaViewerVisible(true);
  }, []);

  const renderMessage = ({ item, index }: { item: SavedMessage; index: number }) => (
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
  );

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
          ListEmptyComponent={<EmptyState colors={colors} myUsername={myUsername} />}
        />
        {showScrollButton && (
          <ScrollToBottomButton
            onPress={onScrollToBottomPress}
            visible={showScrollButton}
          />
        )}
      </View>

      <View style={[
        styles.inputContainer,
        { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 },
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
              placeholder={t('saved.placeholder')}
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
              opacity: inputText.trim() ? 1 : 0.4,
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
            <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={20} color={isRecording ? '#FFF' : colors.accent} />
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: insets.top }}>
        <SavedHeader onBack={() => router.back()} colors={colors} />
      </View>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerHeight + 8}>
          {chatPane}
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
          {chatPane}
        </View>
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
          const result = await toggleReaction(actionSheetMessageId, emoji, myUsername, '__saved__');
          setMyReaction(result.reaction);
          await loadReactions();
        }}
      />

      <MediaViewer
        visible={mediaViewerVisible}
        onClose={() => setMediaViewerVisible(false)}
        uri={mediaViewerUri}
        mediaType={mediaViewerType}
        mimeType={mediaViewerMimeType}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  messagesContainer: { flexGrow: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
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

export default SavedMessagesScreen;
