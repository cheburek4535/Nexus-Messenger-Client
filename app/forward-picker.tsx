import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { getAllChats, Chat } from '../src/services/chatService';
import { getAllGroups } from '../src/services/groupService';
import { getAllChannels } from '../src/services/channelService';
import { getLocalIdentity } from '../src/services/identity';
import { sendMessageToServer, sendGroupMessageToServer, sendChannelMessageToServer } from '../src/services/api';
import { sendMessage } from '../src/services/messageService';
import { saveGroupMessage } from '../src/services/groupService';
import { saveChannelMessage } from '../src/services/channelService';
import { sendSavedMessage } from '../src/services/savedMessagesService';
import { getPendingForward, clearPendingForward } from '../src/services/forwardService';
import { t } from '../src/services/i18n';

interface SelectableItem {
  id: string;
  name: string;
  username: string;
  avatarUri: string | null;
  type: 'dm' | 'group' | 'channel' | 'saved';
}

const ForwardPickerScreen = () => {
  const { colors } = useTheme();
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const identity = await getLocalIdentity();
    if (!identity) return;

    const result: SelectableItem[] = [];

    // Add Saved Messages as the first item
    result.push({
      id: '__saved__',
      name: t('saved.chatListLabel'),
      username: '__saved__',
      avatarUri: null,
      type: 'saved',
    });

    const dms = await getAllChats();
    for (const dm of dms) {
      result.push({
        id: dm.id,
        name: dm.displayName || `@${dm.username}`,
        username: dm.username,
        avatarUri: dm.avatarUri,
        type: 'dm',
      });
    }

    const groups = await getAllGroups();
    for (const g of groups) {
      result.push({
        id: `group_${g.id}`,
        name: g.name,
        username: g.id,
        avatarUri: g.avatarUri,
        type: 'group',
      });
    }

    const channels = await getAllChannels();
    for (const ch of channels) {
      if (ch.ownerUsername === identity.username) {
        result.push({
          id: ch.id,
          name: ch.name,
          username: ch.id,
          avatarUri: ch.avatarUri,
          type: 'channel',
        });
      }
    }

    setItems(result);
  };

  const filteredItems = searchQuery.trim()
    ? items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= 10) return;
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleForward = useCallback(async () => {
    const msg = getPendingForward();
    if (!msg || selectedIds.size === 0) return;
    setSending(true);

    const identity = await getLocalIdentity();
    if (!identity) { setSending(false); return; }

    const promises: Promise<any>[] = [];

    for (const item of items) {
      if (!selectedIds.has(item.id)) continue;

      if (item.type === 'saved') {
        promises.push((async () => {
          await sendSavedMessage({
            senderUsername: identity.username,
            contentText: msg.contentText || undefined,
            contentType: msg.contentType as any,
            contentUri: msg.contentUri,
            mediaMimeType: msg.mediaMimeType,
            forwardedFrom: msg.senderUsername,
          });
        })());
      } else if (item.type === 'dm') {
        promises.push((async () => {
          const localMsg = await sendMessage({
            chatId: item.id,
            senderUsername: identity.username,
            contentText: msg.contentText || undefined,
            contentType: msg.contentType as any,
            contentUri: msg.contentUri,
            mediaMimeType: msg.mediaMimeType,
            forwardedFrom: msg.senderUsername,
          });
          // Encrypt forwarded content for DM
          let ciphertext = msg.contentText || '';
          let nonce = '';
          if (msg.contentText) {
            try {
              const { encryptForRecipient } = await import('../src/crypto/secureChannel');
              const enc = await encryptForRecipient(msg.contentText, item.username);
              ciphertext = enc.ciphertext;
              nonce = enc.nonce;
            } catch {}
          }
          const result = await sendMessageToServer(identity.username, item.username, ciphertext, {
            nonce,
            contentType: msg.contentType,
            contentUri: msg.contentUri || undefined,
            mediaMimeType: msg.mediaMimeType || undefined,
            forwardedFrom: msg.senderUsername,
          });
          return result;
        })());
      } else if (item.type === 'group') {
        promises.push((async () => {
          const msgId = `grpmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await saveGroupMessage({
            id: msgId,
            group_id: item.username,
            sender_username: identity.username,
            content_type: msg.contentType,
            content_text: msg.contentText || undefined,
            content_uri: msg.contentUri || undefined,
            media_mime_type: msg.mediaMimeType || undefined,
            timestamp: Date.now(),
            forwarded_from: msg.senderUsername,
          });
          const result = await sendGroupMessageToServer({
            group_id: item.username,
            sender_username: identity.username,
            content_type: msg.contentType,
            content_text: msg.contentText || undefined,
            content_uri: msg.contentUri || undefined,
            forwarded_from: msg.senderUsername,
          });
          return result;
        })());
      } else if (item.type === 'channel') {
        promises.push((async () => {
          const msgId = `chmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await saveChannelMessage({
            id: msgId,
            channel_id: item.username,
            sender_username: identity.username,
            content_type: msg.contentType,
            content_text: msg.contentText || undefined,
            content_uri: msg.contentUri || undefined,
            media_mime_type: msg.mediaMimeType || undefined,
            timestamp: Date.now(),
            forwarded_from: msg.senderUsername,
          });
          const result = await sendChannelMessageToServer({
            channel_id: item.username,
            sender_username: identity.username,
            content_type: msg.contentType,
            content_text: msg.contentText || undefined,
            content_uri: msg.contentUri || undefined,
            media_mime_type: msg.mediaMimeType || undefined,
            forwarded_from: msg.senderUsername,
          });
          return result;
        })());
      }
    }

    await Promise.allSettled(promises);
    clearPendingForward();
    setSending(false);
    if (router.canGoBack()) router.back();
  }, [items, selectedIds, colors]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'saved': return 'bookmark-outline' as const;
      case 'dm': return 'person-outline' as const;
      case 'group': return 'people-outline' as const;
      case 'channel': return 'megaphone-outline' as const;
      default: return 'chatbubble-outline' as const;
    }
  };

  const renderItem = ({ item }: { item: SelectableItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.item, { backgroundColor: colors.glass, borderColor: colors.accent + '15' }]}
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}>
          {item.avatarUri ? (
            <Image source={{ uri: item.avatarUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons name={getIcon(item.type)} size={20} color={colors.accent} />
          )}
        </View>
        <Text style={[styles.name, { color: colors.primary }]} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.checkbox, {
          borderColor: isSelected ? colors.accent : colors.border,
          backgroundColor: isSelected ? colors.accent : 'transparent',
        }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { clearPendingForward(); router.back(); }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.primary }]}>{t('forward.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.glass, borderColor: colors.accent + '20' }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('forward.search')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('forward.noChats')}</Text>
        </View>
      )}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      {selectedIds.size > 0 && (
        <TouchableOpacity
          style={[styles.forwardButton, { backgroundColor: colors.accent }]}
          onPress={handleForward}
          disabled={sending}
          activeOpacity={0.8}
        >
          <Text style={styles.forwardButtonText}>
            {sending ? t('common.sending') : t('forward.button', String(selectedIds.size))}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  searchBar: {
    marginHorizontal: 16, marginBottom: 8, padding: 10,
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 0.5, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { flexGrow: 1, paddingBottom: 100 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 3, padding: 12,
    borderRadius: 12, borderWidth: 0.5, gap: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  name: { flex: 1, fontSize: 15, fontWeight: '500' },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
  },
  forwardButton: {
    position: 'absolute', bottom: 32, left: 32, right: 32,
    paddingVertical: 14, borderRadius: 14,
    alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  forwardButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 15, marginTop: 12 },
});

export default ForwardPickerScreen;
