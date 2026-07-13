import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { wsManager } from '../../src/services/websocket';
import { getAllChats, deleteChat, Chat } from '../../src/services/chatService';
import { ghostChatManager } from '@/src/services/ghostChatManager';
import { getAllGroups, getGroupById, upsertGroup, upsertGroupMembers, saveGroupMessage, deleteGroupLocally, removeGroupMemberLocally } from '@/src/services/groupService';
import { getAllChannels, getChannelById, upsertChannel, upsertChannelMembers, saveChannelMessage, deleteChannelLocally, removeChannelMemberLocally } from '@/src/services/channelService';
import { getUserGroupsFromServer, getUserChannelsFromServer, deleteGroupOnServer, deleteChannelOnServer, removeGroupMemberOnServer, leaveChannelOnServer } from '@/src/services/api';
import { getLocalIdentity } from '@/src/services/identity';
import { getLastSavedMessage, getSavedMessageCount, deleteAllSavedMessages } from '@/src/services/savedMessagesService';
import { updateMessageStatus } from '../../src/services/messageService';
import ActionSheet, { ActionSheetOption } from '@/src/components/ActionSheet';
import TechBackground from '@/src/components/TechBackground';
import { t } from '../../src/services/i18n';
import { PressScale } from '../../src/utils/animations';

const StatusIcon = ({ status, color }: { status: string; color: string }) => {
  let icon: keyof typeof Ionicons.glyphMap;
  switch (status) {
    case 'sending': icon = 'time-outline'; break;
    case 'sent': icon = 'checkmark-outline'; break;
    case 'delivered': icon = 'checkmark-done-outline'; break;
    case 'read': icon = 'checkmark-done'; break;
    case 'failed': icon = 'close-circle-outline'; break;
    default: return null;
  }
  return <Ionicons name={icon} size={14} color={color} style={{ marginRight: 4 }} />;
};

const MainScreen = () => {
  const { colors } = useTheme();
  const [isConnected, setIsConnected] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetOptions, setActionSheetOptions] = useState<ActionSheetOption[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [createMenuVisible, setCreateMenuVisible] = useState(false);
  const currentUsernameRef = useRef<string>('');

  useEffect(() => { getLocalIdentity().then(id => { if (id) currentUsernameRef.current = id.username; }); }, []);

  useEffect(() => {
    const unsubscribeStatus = wsManager.onStatusChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setConnectionError(true);
        setTimeout(() => setConnectionError(false), 5000);
      } else {
        setConnectionError(false);
      }
    });
    return () => { unsubscribeStatus(); };
  }, []);

  // Global handlers for real-time chat list updates
  useEffect(() => {
    const unsubGroup = wsManager.onSystemMessage('group_message', async (data: any) => {
      if (data.content_type === 'reaction' || data.content_type === 'system') return;
      try {
        const existing = await getGroupById(data.group_id);
        const ts = typeof data.timestamp === 'string' ? new Date(data.timestamp).getTime() : (data.timestamp || Date.now());
        await upsertGroup({
          id: data.group_id,
          name: data.group_name || (existing?.name || data.group_id),
          description: data.description || existing?.description || '',
          avatar_uri: data.avatar_uri || existing?.avatarUri || '',
          created_by: data.created_by || existing?.createdBy || data.sender_username || '',
          created_at: existing?.createdAt || ts,
          updated_at: ts,
          is_channel: existing?.isChannel ? true : undefined,
          owner_username: data.owner_username || existing?.ownerUsername || null,
          admin_usernames: data.admin_usernames || existing?.adminUsernames || undefined,
        });
        await saveGroupMessage({
          id: data.message_id || `grpmsg_${Date.now()}`,
          group_id: data.group_id,
          sender_username: data.sender_username || data.from_user || '',
          content_type: data.content_type || 'text',
          content_text: data.content_text || undefined,
          content_uri: data.content_uri || undefined,
          media_mime_type: data.media_mime_type || undefined,
          reply_to_id: data.reply_to_id || undefined,
          reply_to_text: data.reply_to_text || undefined,
          timestamp: ts,
          is_system: data.is_system ? 1 : 0,
          forwarded_from: data.forwarded_from || undefined,
        });
        loadChats(true);
      } catch {}
    });
    const unsubChannel = wsManager.onSystemMessage('channel_message', async (data: any) => {
      if (data.content_type === 'reaction' || data.content_type === 'system') return;
      try {
        const existing = await getChannelById(data.group_id);
        const ts = typeof data.timestamp === 'string' ? new Date(data.timestamp).getTime() : (data.timestamp || Date.now());
        await upsertChannel({
          id: data.group_id,
          name: data.channel_name || (existing?.name || data.group_id),
          description: data.description || existing?.description || '',
          avatar_uri: data.avatar_uri || existing?.avatarUri || '',
          owner_username: data.owner_username || existing?.ownerUsername || data.sender_username || '',
          created_at: existing?.createdAt || ts,
          updated_at: ts,
        });
        await saveChannelMessage({
          id: data.message_id || `chmsg_${Date.now()}`,
          channel_id: data.group_id,
          sender_username: data.sender_username || data.from_user || '',
          content_type: data.content_type || 'text',
          content_text: data.content_text || undefined,
          content_uri: data.content_uri || undefined,
          media_mime_type: data.media_mime_type || undefined,
          reply_to_id: data.reply_to_id || undefined,
          reply_to_text: data.reply_to_text || undefined,
          timestamp: ts,
          is_system: data.is_system ? 1 : 0,
          forwarded_from: data.forwarded_from || undefined,
        });
        loadChats(true);
      } catch {}
    });
    const unsubChannelSub = wsManager.onSystemMessage('channel_subscribed', async (data: any) => {
      try {
        await upsertChannel({
          id: data.channel_id,
          name: data.channel_name,
          description: data.description || '',
          avatar_uri: data.avatar_uri || '',
          owner_username: data.owner_username,
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
        if (data.members?.length) await upsertChannelMembers(data.channel_id, data.members);
        loadChats(true);
      } catch {}
    });
    const unsubGroupAdd = wsManager.onSystemMessage('group_member_added', async (data: any) => {
      try {
        await upsertGroup({
          id: data.group_id,
          name: data.group_name,
          description: data.description || '',
          avatar_uri: data.avatar_uri || '',
          created_by: data.created_by,
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
        if (data.members?.length) await upsertGroupMembers(data.group_id, data.members);
        loadChats(true);
      } catch {}
    });
    const unsubGroupLeft = wsManager.onSystemMessage('group_left', async (data: any) => {
      try { await deleteGroupLocally(data.group_id); loadChats(true); } catch {}
    });
    const unsubMemberRemoved = wsManager.onSystemMessage('member_removed', async (data: any) => {
      try { await removeGroupMemberLocally(data.group_id, data.username); loadChats(true); } catch {}
    });
    const unsubChannelLeft = wsManager.onSystemMessage('channel_left', async (data: any) => {
      try { await deleteChannelLocally(data.channel_id); loadChats(true); } catch {}
    });
    const unsubSubRemoved = wsManager.onSystemMessage('subscriber_removed', async (data: any) => {
      try { await removeChannelMemberLocally(data.channel_id, data.username); loadChats(true); } catch {}
    });
    return () => {
      unsubGroup(); unsubChannel(); unsubChannelSub(); unsubGroupAdd();
      unsubGroupLeft(); unsubMemberRemoved(); unsubChannelLeft(); unsubSubRemoved();
    };
  }, []);

  useEffect(() => {
    const unsubMsg = wsManager.onMessage(() => { loadChats(true); });
    const unsubDelivered = wsManager.onDelivered(async (messageId) => {
      await updateMessageStatus(messageId, 'delivered');
      loadChats(true);
    });
    const unsubRead = wsManager.onReadReceipt(async (messageId) => {
      await updateMessageStatus(messageId, 'read');
      loadChats(true);
    });
    return () => { unsubMsg(); unsubDelivered(); unsubRead(); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [])
  );

  const loadChats = async (quick?: boolean) => {
    const normalChats = await getAllChats();
    const ghostUsernames = ghostChatManager.getActiveGhostChats();
    const ghostChats: Chat[] = ghostUsernames.map(username => ({
      id: `ghost_${username}`,
      username,
      displayName: null,
      avatarUri: null,
      lastMessageText: ghostChatManager.getGhostMessages(username).slice(-1)[0]?.contentText || t('chatlist.ghostChatActive'),
      lastMessageTime: ghostChatManager.getGhostMessages(username).slice(-1)[0]?.timestamp || Date.now(),
      unreadCount: 0,
      isGhost: true,
      autoDeleteTimer: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    if (!quick) {
      const identity = await getLocalIdentity();

      if (identity) {
        try {
          const serverGroups = await getUserGroupsFromServer(identity.username);
          for (const sg of serverGroups) {
            await upsertGroup({
              id: sg.id, name: sg.name, description: sg.description || '',
              avatar_uri: sg.avatar_uri || '', created_by: sg.created_by,
              created_at: sg.created_at, updated_at: sg.updated_at || sg.created_at,
              is_channel: sg.is_channel, owner_username: sg.owner_username || null,
              admin_usernames: sg.admin_usernames || undefined,
            });
            if (sg.members?.length) await upsertGroupMembers(sg.id, sg.members);
          }
        } catch (_e) {}

        try {
          const serverChannels = await getUserChannelsFromServer(identity.username);
          for (const sc of serverChannels) {
            await upsertChannel({
              id: sc.id, name: sc.name, description: sc.description || '',
              avatar_uri: sc.avatar_uri || '', owner_username: sc.owner_username,
              created_at: sc.created_at, updated_at: sc.updated_at || sc.created_at,
            });
            if (sc.members?.length) await upsertChannelMembers(sc.id, sc.members);
          }
        } catch (_e) {}

        const localGroups = await getAllGroups();
        for (const g of localGroups) {
          if (!g.lastMessageText) {
            // No server fallback — messages come only via WS and local DB
          }
        }

        const localChannels = await getAllChannels();
        for (const ch of localChannels) {
          if (!ch.lastMessageText) {
            // No server fallback — messages come only via WS and local DB
          }
        }
      }
    }

    const groupData = await getAllGroups();
    const groupChats: Chat[] = groupData.map(g => ({
      id: `group_${g.id}`,
      username: g.id,
      displayName: g.name,
      avatarUri: g.avatarUri,
      lastMessageText: g.lastMessageText,
      lastMessageTime: g.lastMessageTime,
      unreadCount: 0,
      isGhost: false,
      autoDeleteTimer: 0,
      createdAt: g.createdAt,
      updatedAt: g.lastMessageTime || g.createdAt,
      isGroup: true,
      isChannel: g.isChannel,
      groupMemberCount: g.memberCount,
    }));
    const channelData = await getAllChannels();
    const channelChats: Chat[] = channelData.map(ch => ({
      id: ch.id,
      username: ch.id,
      displayName: ch.name,
      avatarUri: ch.avatarUri || '',
      lastMessageText: ch.lastMessageText || '',
      lastMessageTime: ch.lastMessageTime || ch.createdAt,
      unreadCount: 0,
      isGhost: false,
      autoDeleteTimer: 0,
      createdAt: ch.createdAt,
      updatedAt: ch.lastMessageTime || ch.createdAt,
      isGroup: true,
      isChannel: true,
      groupMemberCount: ch.memberCount,
    }));
    const lastSaved = await getLastSavedMessage();
    const savedCount = await getSavedMessageCount();
    const savedChat: Chat = {
      id: '__saved__',
      username: '__saved__',
      displayName: t('saved.chatListLabel'),
      avatarUri: null,
      lastMessageText: savedCount > 0 && lastSaved
        ? (lastSaved.contentText || `[${lastSaved.contentType}]`)
        : t('saved.emptyBody'),
      lastMessageTime: lastSaved?.timestamp || Math.max(...ghostChats.map(c => c.updatedAt), ...channelChats.map(c => c.updatedAt), ...groupChats.map(c => c.updatedAt), ...normalChats.map(c => c.updatedAt), 0),
      unreadCount: 0,
      isGhost: false,
      autoDeleteTimer: 0,
      createdAt: Date.now(),
      updatedAt: lastSaved?.timestamp || Date.now(),
      isSavedMessages: true,
    };
    setChats([savedChat, ...ghostChats, ...channelChats, ...groupChats, ...normalChats]);
  };

  const handleDeleteChat = async (chat: Chat) => {
    if (chat.isGhost) {
      ghostChatManager.removeGhostChat(chat.username);
    } else {
      await deleteChat(chat.id);
    }
    loadChats();
  };

  const handleStartGhostChat = (username: string) => {
    router.push(`/ghost-invite-sent?toUser=${username}&snapshotsAllowed=true`);
  };

  const handleLongPress = async (chat: Chat) => {
    setSelectedChat(chat);
    const options: ActionSheetOption[] = [];
    if (chat.isSavedMessages) {
      options.push({
        label: t('saved.clear'),
        icon: 'trash-outline',
        destructive: true,
        onPress: () => {
          Alert.alert(t('saved.clear'), t('saved.clearConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => {
              await deleteAllSavedMessages();
              loadChats();
            }},
          ]);
        },
      });
    } else if (!chat.isGroup) {
      options.push({
        label: t('chatlist.ghost'),
        icon: 'flash-outline',
        onPress: () => handleStartGhostChat(chat.username),
      });
      options.push({
        label: t('chatlist.delete'),
        icon: 'trash-outline',
        destructive: true,
        onPress: () => handleDeleteChat(chat),
      });
    } else {
      const identity = await getLocalIdentity();
      if (identity) {
        if (chat.isChannel) {
          const channel = await getChannelById(chat.username);
          const isOwner = channel?.ownerUsername === identity.username;
          if (isOwner) {
            options.push({
              label: t('group.delete'),
              icon: 'trash-outline',
              destructive: true,
              onPress: async () => {
                const ok = await deleteChannelOnServer(chat.username, identity.username);
                if (ok) {
                  const { deleteChannelLocally } = await import('@/src/services/channelService');
                  await deleteChannelLocally(chat.username);
                  loadChats();
                }
              },
            });
          } else {
            options.push({
              label: t('group.leave'),
              icon: 'exit-outline',
              destructive: true,
              onPress: async () => {
                try { await leaveChannelOnServer(chat.username, identity.username); } catch (_) {}
                const { deleteChannelLocally } = await import('@/src/services/channelService');
                await deleteChannelLocally(chat.username);
                loadChats();
              },
            });
          }
        } else {
          const group = await getGroupById(chat.username);
          const isCreator = group?.createdBy === identity.username;
          if (isCreator) {
            options.push({
              label: t('group.delete'),
              icon: 'trash-outline',
              destructive: true,
              onPress: async () => {
                const ok = await deleteGroupOnServer(chat.username, identity.username);
                if (ok) {
                  const { deleteGroupLocally } = await import('@/src/services/groupService');
                  await deleteGroupLocally(chat.username);
                  loadChats();
                }
              },
            });
          } else {
            options.push({
              label: t('group.leave'),
              icon: 'exit-outline',
              destructive: true,
              onPress: async () => {
                try { await removeGroupMemberOnServer(chat.username, identity.username); } catch (_) {}
                const { deleteGroupLocally } = await import('@/src/services/groupService');
                await deleteGroupLocally(chat.username);
                loadChats();
              },
            });
          }
        }
      }
    }
    setActionSheetOptions(options);
    setActionSheetVisible(true);
  };

  const getTz = () => {
    const offset = -new Date().getTimezoneOffset();
    const h = Math.floor(Math.abs(offset) / 60);
    const m = Math.abs(offset) % 60;
    return offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : '-'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (days === 1) {
      return t('chatlist.yesterday');
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const displayName = (chat: Chat) => {
    if (chat.isSavedMessages) return t('saved.chatListLabel');
    if (chat.isGroup) return chat.displayName || chat.username;
    return chat.displayName || `@${chat.username}`;
  };

  const renderChatItem = ({ item }: { item: Chat }) => (
    <PressScale
      onPress={() => {
        if (item.isSavedMessages) {
          router.push('/saved-messages' as any);
        } else if (item.isGroup) {
          if (item.isChannel) {
            router.push(`/channel/${item.username}` as unknown as any);
          } else {
            router.push(`/group/${item.username}` as unknown as any);
          }
        } else if (item.isGhost) {
          router.push(`/chat/ghost_${item.username}` as unknown as any);
        } else {
          router.push(`/chat/${item.username}` as unknown as any);
        }
      }}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={300}
      style={[localStyles.chatItem, { backgroundColor: colors.glass, borderColor: colors.accent + '15' }]}
    >
      <View style={localStyles.chatRow}>
        <View style={[localStyles.avatar, {
          backgroundColor: item.isSavedMessages ? colors.accent + '20' : item.isGroup ? colors.accent + '20' : item.isGhost ? colors.accent + '15' : colors.surface,
          borderColor: item.isSavedMessages ? colors.accent + '50' : item.isGroup ? colors.accent + '40' : item.isGhost ? colors.accent + '40' : colors.border,
        }]}>
          {item.isSavedMessages ? (
            <Ionicons name="bookmark" size={22} color={colors.accent} />
          ) : item.avatarUri ? (
            <Image source={{ uri: item.avatarUri }} style={localStyles.avatarImage} />
          ) : (
            <Text style={[localStyles.avatarText, {
              color: item.isGroup ? colors.accent : item.isGhost ? colors.accent : colors.textSecondary,
            }]}>
              {(item.displayName || item.username).substring(0, 2).toUpperCase()}
            </Text>
          )}
          {item.isGhost && (
            <View style={[localStyles.ghostIconOverlay, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="flash" size={18} color={colors.accent} />
            </View>
          )}
          {item.isGroup && (
            <View style={[localStyles.ghostIconOverlay, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name={item.isChannel ? 'megaphone' : 'people'} size={14} color={colors.accent} />
            </View>
          )}
        </View>

        <View style={localStyles.chatInfo}>
          <View style={localStyles.chatTop}>
            <View style={localStyles.nameRow}>
              <Text style={[localStyles.name, { color: colors.primary }]}>{displayName(item)}</Text>
              {item.isSavedMessages && (
                <View style={[localStyles.badge, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}>
                  <Ionicons name="bookmark" size={8} color={colors.accent} />
                  <Text style={[localStyles.badgeText, { color: colors.accent }]}>{t('saved.chatListLabel')}</Text>
                </View>
              )}
              {item.isGhost && (
                <View style={[localStyles.badge, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}>
                  <Ionicons name="flash" size={8} color={colors.accent} />
                  <Text style={[localStyles.badgeText, { color: colors.accent }]}>{t('common.ghost')}</Text>
                </View>
              )}
              {item.isGroup && item.groupMemberCount != null && (
                <View style={[localStyles.badge, { backgroundColor: item.isChannel ? colors.accent + '20' : colors.accent + '15', borderColor: item.isChannel ? colors.accent + '40' : colors.accent + '30' }]}>
                  <Text style={[localStyles.badgeText, { color: colors.accent }]}>
                    {item.isChannel ? t('channel.type') : item.groupMemberCount}
                  </Text>
                </View>
              )}
            </View>
            {item.lastMessageTime && (
              <Text style={[localStyles.time, { color: colors.textSecondary }]}>
                {formatTime(item.lastMessageTime)}
              </Text>
            )}
          </View>
          <View style={localStyles.chatBottom}>
            <View style={localStyles.messagePreview}>
              {!item.isSavedMessages && !item.isGroup && !item.isGhost && item.lastMessageStatus && item.lastMessageSender === currentUsernameRef.current && (
                <StatusIcon status={item.lastMessageStatus} color={item.lastMessageStatus === 'read' ? colors.accent : colors.textSecondary} />
              )}
              <Text style={[localStyles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.lastMessageText || (item.isSavedMessages ? '' : item.isGroup ? t('group.noChats') : t('chatlist.noMessages'))}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={[localStyles.unreadBadge, { backgroundColor: colors.accent }]}>
                <Text style={localStyles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </PressScale>
  );

  const renderEmptyChats = () => (
    <View style={localStyles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textSecondary} />
      <Text style={[localStyles.emptyText, { color: colors.textSecondary, marginTop: 16 }]}>
        {t('chatlist.empty')}
        </Text>
        <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>
          {t('chatlist.empty2')}
      </Text>
    </View>
  );

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background }]}>
      <TechBackground density="medium" />
      {connectionError && (
        <View style={localStyles.errorBar}>
          <View style={localStyles.errorDot} />
          <Text style={localStyles.errorText}>{t('error.connection')}</Text>
        </View>
      )}

      <View style={[localStyles.searchBar, { backgroundColor: colors.glass, borderColor: colors.accent + '20' }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          placeholder={t('chatlist.search')}
          placeholderTextColor={colors.textSecondary}
          style={[localStyles.searchInput, { color: colors.text }]}
          onFocus={() => router.push('/search')}
        />
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderChatItem}
        ListEmptyComponent={renderEmptyChats}
        contentContainerStyle={localStyles.list}
      />

      <TouchableOpacity
        style={[localStyles.fab, { backgroundColor: colors.accent }]}
        onPress={() => setCreateMenuVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      <ActionSheet
        visible={actionSheetVisible}
        title={selectedChat ? displayName(selectedChat) : undefined}
        options={actionSheetOptions}
        onCancel={() => setActionSheetVisible(false)}
      />

      <ActionSheet
        visible={createMenuVisible}
        title={t('chatlist.newChat')}
        options={[
          {
            label: t('group.create'),
            icon: 'people-outline',
            onPress: () => router.push('/create-group'),
          },
          {
            label: t('channel.create'),
            icon: 'megaphone-outline',
            onPress: () => router.push('/create-group?type=channel'),
          },
        ]}
        onCancel={() => setCreateMenuVisible(false)}
      />
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: { flex: 1 },
  errorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, backgroundColor: '#D32F2F20',
  },
  errorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D32F2F', marginRight: 8 },
  errorText: { fontSize: 12, color: '#D32F2F' },
  searchBar: {
    margin: 16, marginBottom: 8, padding: 12,
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 0.5,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  list: { flexGrow: 1, paddingTop: 4, paddingBottom: 16 },
  chatItem: {
    marginHorizontal: 16, marginVertical: 4, padding: 14,
    borderRadius: 12, borderWidth: 0.5,
  },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
    position: 'relative', overflow: 'hidden',
  },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  ghostIconOverlay: {
    position: 'absolute', top: -4, right: -4,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '300' },
  chatInfo: { flex: 1 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '500' },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 6, borderWidth: 0.5, gap: 2,
  },
  badgeText: { fontSize: 7, fontWeight: '600', letterSpacing: 0.5 },
  time: { fontSize: 11 },
  chatBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  messagePreview: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  lastMessage: { fontSize: 13, flex: 1 },
  unreadBadge: {
    borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 15, fontWeight: '300' },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
});

export default MainScreen;
