import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDatabase } from '../src/database/connection';
import { getLocalIdentity } from '../src/services/identity';
import { createGroupOnServer, createChannelOnServer, searchUsersFromServer } from '../src/services/api';
import { upsertGroup, upsertGroupMembers, saveGroupMessage } from '../src/services/groupService';
import { upsertChannel, upsertChannelMembers, saveChannelMessage } from '../src/services/channelService';
import { t } from '../src/services/i18n';
import { getAllChats, Chat } from '../src/services/chatService';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

const CreateGroupScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const isChannel = params.type === 'channel';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [existingChats, setExistingChats] = useState<Chat[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadExistingChats();
  }, []);

  const loadExistingChats = async () => {
    const chats = await getAllChats();
    const nonGhost = chats.filter(c => !c.isGhost);
    setExistingChats(nonGhost);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const results = await searchUsersFromServer(q);
    setSearchResults(results);
  };

  const toggleUser = (username: string) => {
    const next = new Set(selectedUsers);
    if (next.has(username)) {
      next.delete(username);
    } else {
      next.add(username);
    }
    setSelectedUsers(next);
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: 'base64' });
      setAvatarUri(`data:image/jpeg;base64,${base64}`);
    }
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t('common.error'), t('group.name') + ' ' + t('common.error'));
      return;
    }
    if (selectedUsers.size === 0) {
      Alert.alert(t('common.error'), t('group.selectUsers'));
      return;
    }

    setCreating(true);
    const identity = await getLocalIdentity();
    if (!identity) { setCreating(false); return; }

    const members = [identity.username, ...Array.from(selectedUsers)];
    const now = Date.now();

    if (isChannel) {
      const result = await createChannelOnServer({
        name: trimmedName,
        description: description.trim() || undefined,
        avatar_uri: avatarUri || undefined,
        created_by: identity.username,
        members,
      });

      if (result.success && result.channel_id) {
        await upsertChannel({
          id: result.channel_id,
          name: trimmedName,
          description: description.trim(),
          avatar_uri: avatarUri || undefined,
          owner_username: identity.username,
          created_at: now,
          updated_at: now,
        });
        await upsertChannelMembers(result.channel_id, members);

        const sysMsgId = `sys_${result.channel_id}_${now}`;
        await saveChannelMessage({
          id: sysMsgId,
          channel_id: result.channel_id,
          sender_username: identity.username,
          content_type: 'text',
          content_text: t('channel.create'),
          timestamp: now,
          is_system: 1,
        });

        router.replace({ pathname: '/channel/[id]', params: { id: result.channel_id } });
      } else {
        Alert.alert(t('common.error'), result.error || t('error.server'));
      }
    } else {
      const result = await createGroupOnServer({
        name: trimmedName,
        description: description.trim() || undefined,
        avatar_uri: avatarUri || undefined,
        created_by: identity.username,
        members,
      });

      if (result.success && result.group_id) {
        await upsertGroup({
          id: result.group_id,
          name: trimmedName,
          description: description.trim(),
          avatar_uri: avatarUri || undefined,
          created_by: identity.username,
          created_at: now,
          updated_at: now,
        });
        await upsertGroupMembers(result.group_id, members);

        const sysMsgId = `sys_${result.group_id}_${now}`;
        await saveGroupMessage({
          id: sysMsgId,
          group_id: result.group_id,
          sender_username: identity.username,
          content_type: 'text',
          content_text: t('group.created', trimmedName),
          timestamp: now,
          is_system: 1,
        });

        router.replace({ pathname: '/group/[id]', params: { id: result.group_id } });
      } else {
        Alert.alert(t('common.error'), result.error || t('error.server'));
      }
    }
    setCreating(false);
  };

  const renderUserItem = ({ item }: { item: any }) => {
    const username = item.username || item;
    const displayName = item.display_name || '';
    const isSelected = selectedUsers.has(username);
    return (
      <TouchableOpacity
        style={[localStyles.userItem, { backgroundColor: colors.glass, borderColor: isSelected ? colors.accent + '50' : colors.border }]}
        onPress={() => toggleUser(username)}
      >
        <View style={[localStyles.userAvatar, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
          {item.avatar_uri ? (
            <Image source={{ uri: item.avatar_uri }} style={localStyles.userAvatarImage} />
          ) : (
            <Text style={{ color: colors.accent, fontSize: 14 }}>{(displayName || username).substring(0, 2).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[localStyles.userName, { color: colors.primary }]}>{displayName || `@${username}`}</Text>
          <Text style={[localStyles.userUsername, { color: colors.textSecondary }]}>@{username}</Text>
        </View>
        <View style={[localStyles.checkbox, {
          backgroundColor: isSelected ? colors.accent : 'transparent',
          borderColor: isSelected ? colors.accent : colors.border,
        }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[localStyles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={localStyles.backBtn}>
          <Ionicons name="close" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[localStyles.headerTitle, { color: colors.primary }]}>{isChannel ? t('channel.create') : t('group.create')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={localStyles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} style={[localStyles.avatarPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={localStyles.avatarPreview} />
            ) : (
              <View style={localStyles.avatarPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                <Text style={[localStyles.avatarLabel, { color: colors.textSecondary }]}>{t('group.addPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={localStyles.formSection}>
          <TextInput
            style={[localStyles.input, { color: colors.text, backgroundColor: colors.glass, borderColor: colors.border }]}
            placeholder={t('group.name')}
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[localStyles.input, localStyles.textArea, { color: colors.text, backgroundColor: colors.glass, borderColor: colors.border }]}
            placeholder={t('group.description')}
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={localStyles.searchSection}>
          <View style={[localStyles.searchBar, { backgroundColor: colors.glass, borderColor: colors.accent + '20' }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[localStyles.searchInput, { color: colors.text }]}
              placeholder={t('group.searchUsers')}
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
            />
          </View>

          <Text style={[localStyles.sectionTitle, { color: colors.textSecondary }]}>
            {t('group.members')} ({selectedUsers.size})
          </Text>

          {searchQuery.length >= 2 && searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={item => item.username}
              renderItem={renderUserItem}
              scrollEnabled={false}
              style={{ maxHeight: 300 }}
            />
          ) : searchQuery.length < 2 && existingChats.length > 0 ? (
            <FlatList
              data={existingChats}
              keyExtractor={item => item.username}
              renderItem={({ item }) => renderUserItem({ item: { username: item.username, display_name: item.displayName, avatar_uri: item.avatarUri } })}
              scrollEnabled={false}
              style={{ maxHeight: 400 }}
            />
          ) : searchQuery.length >= 2 && searchResults.length === 0 ? (
            <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>{t('group.noResults')}</Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={[localStyles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[localStyles.createButton, {
            backgroundColor: selectedUsers.size > 0 && name.trim() ? colors.accent : colors.border,
            opacity: creating ? 0.6 : 1,
          }]}
          onPress={handleCreate}
          disabled={creating || !name.trim() || selectedUsers.size === 0}
        >
          <Ionicons name={isChannel ? 'megaphone-outline' : 'people-outline'} size={20} color="#FFF" />
          <Text style={localStyles.createButtonText}>{isChannel ? t('channel.create') : t('group.create')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatarPicker: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarPreview: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { alignItems: 'center', gap: 4 },
  avatarLabel: { fontSize: 11, fontWeight: '300' },
  formSection: { paddingHorizontal: 16, gap: 12 },
  input: {
    borderRadius: 12, padding: 14, fontSize: 15,
    borderWidth: 0.5, marginBottom: 12,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  searchSection: { paddingHorizontal: 16, marginTop: 20 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 12, borderWidth: 0.5,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 },
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 10, marginBottom: 6,
    borderWidth: 0.5, gap: 12,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', borderWidth: 0.5,
  },
  userAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  userName: { fontSize: 15, fontWeight: '500' },
  userUsername: { fontSize: 12, fontWeight: '300', marginTop: 1 },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  emptyText: { textAlign: 'center', marginTop: 20, fontSize: 14, fontWeight: '300' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5 },
  createButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 16, gap: 8,
  },
  createButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

export default CreateGroupScreen;
