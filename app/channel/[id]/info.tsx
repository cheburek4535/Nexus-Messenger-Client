import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLocalIdentity } from '../../../src/services/identity';
import { getChannelFromServer, updateChannelOnServer, addChannelMemberOnServer, removeChannelMemberOnServer, deleteChannelOnServer, leaveChannelOnServer, getUserProfile } from '../../../src/services/api';
import { getChannelById, getChannelMembers, upsertChannelMembers, updateChannelInfo, removeChannelMemberLocally, ChannelData } from '../../../src/services/channelService';
import { searchUsersFromServer } from '../../../src/services/api';
import { t } from '../../../src/services/i18n';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

const ChannelInfoScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, { avatar_uri?: string; display_name?: string }>>({});
  const [myUsername, setMyUsername] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showAddMembers, setShowAddMembers] = useState(false);

  const isOwner = channel?.ownerUsername === myUsername;

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const identity = await getLocalIdentity();
    if (identity) setMyUsername(identity.username);

    const localChannel = await getChannelById(id);
    const localMembers = await getChannelMembers(id);
    const serverData = await getChannelFromServer(id);

    const merged: ChannelData | null = serverData
      ? {
          id: serverData.id || id,
          name: serverData.name || localChannel?.name || '',
          description: serverData.description || localChannel?.description || null,
          avatarUri: serverData.avatar_uri || localChannel?.avatarUri || null,
          ownerUsername: serverData.owner_username || localChannel?.ownerUsername || '',
          createdAt: serverData.created_at || localChannel?.createdAt || Date.now(),
          updatedAt: serverData.updated_at || localChannel?.updatedAt || Date.now(),
          memberCount: localChannel?.memberCount || 0,
          lastMessageText: null,
          lastMessageTime: null,
        }
      : localChannel;

    if (merged) {
      setChannel(merged);
      setName(merged.name);
      setDescription(merged.description || '');
      setAvatarUri(merged.avatarUri);
    }

    const serverMembers: string[] = serverData?.members || [];
    const allMembers = [...new Set([...localMembers, ...serverMembers])];
    setMembers(allMembers);

    const profiles: Record<string, { avatar_uri?: string; display_name?: string }> = {};
    for (const username of allMembers) {
      if (username && username !== identity?.username) {
        try {
          const profile = await getUserProfile(username, identity?.username);
          if (profile && !profile.error) {
            profiles[username] = { avatar_uri: profile.avatar_uri, display_name: profile.display_name };
          }
        } catch {}
      }
    }
    setMemberProfiles(profiles);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: false });
    if (!result.canceled && result.assets[0]) {
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: 'base64' });
      setAvatarUri(`data:image/jpeg;base64,${base64}`);
    }
  };

  const handleSave = async () => {
    if (!id || !channel) return;
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert(t('common.error'), t('channel.editName')); return; }
    setSaving(true);
    const identity = await getLocalIdentity();
    if (!identity) { setSaving(false); return; }
    const serverOk = await updateChannelOnServer({ channel_id: id, name: trimmedName, description: description.trim() || undefined, avatar_uri: avatarUri || undefined, created_by: identity.username });
    await updateChannelInfo(id, { name: trimmedName, description: description.trim(), avatar_uri: avatarUri || undefined });
    if (serverOk) { Alert.alert(t('common.success'), t('channel.saveChanges')); } else { Alert.alert(t('common.error'), t('error.server')); }
    setSaving(false);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const results = await searchUsersFromServer(q);
    setSearchResults(results.filter((r: any) => !members.includes(r.username)));
  };

  const toggleUser = (username: string) => {
    const next = new Set(selectedUsers);
    if (next.has(username)) next.delete(username); else next.add(username);
    setSelectedUsers(next);
  };

  const handleAddMembers = async () => {
    if (selectedUsers.size === 0) return;
    setSaving(true);
    const identity = await getLocalIdentity();
    if (!identity) { setSaving(false); return; }
    const newMembers = Array.from(selectedUsers);
    let allOk = true;
    for (const username of newMembers) {
      const ok = await addChannelMemberOnServer(id!, username, identity.username);
      if (!ok) allOk = false;
    }
    if (allOk) {
      await upsertChannelMembers(id!, newMembers);
      setMembers(prev => [...prev, ...newMembers]);
      setSelectedUsers(new Set());
      setSearchQuery('');
      setSearchResults([]);
      setShowAddMembers(false);
      Alert.alert(t('common.success'), t('common.done'));
    } else {
      Alert.alert(t('common.error'), t('error.server'));
    }
    setSaving(false);
  };

  const handleRemoveMember = (username: string) => {
    Alert.alert(
      t('channel.remove'),
      t('channel.confirmRemove') + ' @' + username,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('channel.remove'),
          style: 'destructive',
          onPress: async () => {
            const ok = await removeChannelMemberOnServer(id!, username);
            if (ok) {
              await removeChannelMemberLocally(id!, username);
              setMembers(prev => prev.filter(m => m !== username));
            } else {
              Alert.alert(t('common.error'), t('error.server'));
            }
          },
        },
      ]
    );
  };

  const renderMemberItem = ({ item }: { item: string }) => {
    const profile = memberProfiles[item];
    const displayName = profile?.display_name || '';
    const avatar = profile?.avatar_uri || null;
    const isO = channel?.ownerUsername === item;
    return (
      <View style={[localStyles.memberItem, { backgroundColor: colors.glass, borderColor: colors.border }]}>
        <TouchableOpacity style={[localStyles.memberAvatar, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]} onPress={() => router.push(`/profile/${item}`)}>
          {avatar ? <Image source={{ uri: avatar }} style={localStyles.memberAvatarImage} /> : <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '500' }}>{(displayName || item).substring(0, 2).toUpperCase()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/profile/${item}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[localStyles.memberName, { color: colors.primary }]}>{displayName || `@${item}`}</Text>
            {isO && <View style={[localStyles.roleBadge, { backgroundColor: colors.warning + '25', borderColor: colors.warning + '50' }]}><Text style={[localStyles.roleBadgeText, { color: colors.warning }]}>{t('channel.owner')}</Text></View>}
          </View>
          {displayName && <Text style={[localStyles.memberUsername, { color: colors.textSecondary }]}>@{item}</Text>}
        </TouchableOpacity>
        {isOwner && !isO && (
          <TouchableOpacity onPress={() => handleRemoveMember(item)} style={localStyles.removeBtn}>
            <Ionicons name="close-circle-outline" size={22} color={colors.danger || '#FF3B30'} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[localStyles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={localStyles.centerContent}><ActivityIndicator size="large" color={colors.accent} /></View>
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={[localStyles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[localStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={localStyles.backBtn}><Ionicons name="arrow-back" size={24} color={colors.accent} /></TouchableOpacity>
          <Text style={[localStyles.headerTitle, { color: colors.primary }]}>{t('channel.info')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={localStyles.centerContent}><Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>{t('common.error')}</Text></View>
      </View>
    );
  }

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[localStyles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={localStyles.backBtn}><Ionicons name="arrow-back" size={24} color={colors.accent} /></TouchableOpacity>
        <Text style={[localStyles.headerTitle, { color: colors.primary }]}>{t('channel.info')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={localStyles.avatarSection}>
          <TouchableOpacity onPress={isOwner ? handlePickAvatar : undefined} style={[localStyles.avatarPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {avatarUri ? <Image source={{ uri: avatarUri }} style={localStyles.avatarPreview} /> : (
              <View style={localStyles.avatarPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                <Text style={[localStyles.avatarLabel, { color: colors.textSecondary }]}>{t('group.addPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        {isOwner && (
          <>
            <View style={localStyles.formSection}>
              <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>{t('channel.editName')}</Text>
              <TextInput style={[localStyles.input, { color: colors.text, backgroundColor: colors.glass, borderColor: colors.border }]} value={name} onChangeText={setName} placeholder={t('channel.editName')} placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={localStyles.formSection}>
              <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>{t('channel.editDescription')}</Text>
              <TextInput style={[localStyles.input, localStyles.textArea, { color: colors.text, backgroundColor: colors.glass, borderColor: colors.border }]} value={description} onChangeText={setDescription} placeholder={t('channel.editDescription')} placeholderTextColor={colors.textSecondary} multiline numberOfLines={3} />
            </View>
            <View style={localStyles.formSection}>
              <TouchableOpacity style={[localStyles.saveButton, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]} onPress={handleSave} disabled={saving || !name.trim()}>
                {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="save-outline" size={20} color="#FFF" />}
                <Text style={localStyles.saveButtonText}>{t('channel.saveChanges')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        <View style={localStyles.membersSection}>
          <View style={localStyles.membersHeader}>
            <Text style={[localStyles.sectionTitle, { color: colors.textSecondary }]}>{t('channel.members')} ({members.length})</Text>
            {isOwner && (
              <TouchableOpacity style={[localStyles.addMembersBtn, { borderColor: colors.accent }]} onPress={() => setShowAddMembers(!showAddMembers)}>
                <Ionicons name={showAddMembers ? 'close' : 'person-add-outline'} size={16} color={colors.accent} />
                <Text style={[localStyles.addMembersBtnText, { color: colors.accent }]}>{showAddMembers ? t('common.cancel') : t('channel.addMembers')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {members.length > 0 ? (
            <FlatList data={members} keyExtractor={item => item} renderItem={renderMemberItem} scrollEnabled={false} />
          ) : (
            <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>{t('group.noChats')}</Text>
          )}
        </View>
        {showAddMembers && isOwner && (
          <View style={localStyles.addMembersSection}>
            <View style={[localStyles.searchBar, { backgroundColor: colors.glass, borderColor: colors.accent + '20' }]}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput style={[localStyles.searchInput, { color: colors.text }]} placeholder={t('group.searchUsers')} placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={handleSearch} />
            </View>
            {searchQuery.length >= 2 && searchResults.length > 0 ? (
              <FlatList data={searchResults} keyExtractor={item => item.username} renderItem={({ item }: { item: any }) => {
                const username = item.username || item;
                const isSelected = selectedUsers.has(username);
                return (
                  <TouchableOpacity style={[localStyles.userItem, { backgroundColor: colors.glass, borderColor: isSelected ? colors.accent + '50' : colors.border }]} onPress={() => toggleUser(username)}>
                    <View style={[localStyles.userAvatar, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
                      {item.avatar_uri ? <Image source={{ uri: item.avatar_uri }} style={localStyles.userAvatarImage} /> : <Text style={{ color: colors.accent, fontSize: 14 }}>{(item.display_name || username).substring(0, 2).toUpperCase()}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[localStyles.userName, { color: colors.primary }]}>{item.display_name || `@${username}`}</Text>
                      <Text style={[localStyles.userUsername, { color: colors.textSecondary }]}>@{username}</Text>
                    </View>
                    <View style={[localStyles.checkbox, { backgroundColor: isSelected ? colors.accent : 'transparent', borderColor: isSelected ? colors.accent : colors.border }]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  </TouchableOpacity>
                );
              }} scrollEnabled={false} style={{ maxHeight: 300, marginTop: 12 }} />
            ) : searchQuery.length >= 2 && searchResults.length === 0 ? (
              <Text style={[localStyles.emptyText, { color: colors.textSecondary, marginTop: 12 }]}>{t('group.noResults')}</Text>
            ) : null}
            {selectedUsers.size > 0 && (
              <TouchableOpacity style={[localStyles.saveButton, { backgroundColor: colors.accent, marginTop: 12 }]} onPress={handleAddMembers} disabled={saving}>
                <Ionicons name="person-add-outline" size={20} color="#FFF" />
                <Text style={localStyles.saveButtonText}>{t('channel.addMembers')} ({selectedUsers.size})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Leave / Delete Channel */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, paddingBottom: 40, gap: 10 }}>
          {myUsername && channel?.ownerUsername !== myUsername && (
            <TouchableOpacity
              style={[localStyles.dangerButton, { borderColor: colors.danger || '#D32F2F' }]}
              onPress={async () => {
                try { await leaveChannelOnServer(id!, myUsername); } catch (_) {}
                const { deleteChannelLocally } = await import('../../../src/services/channelService');
                await deleteChannelLocally(id!);
                router.back();
              }}
            >
              <Ionicons name="exit-outline" size={20} color={colors.danger || '#D32F2F'} />
              <Text style={[localStyles.dangerButtonText, { color: colors.danger || '#D32F2F' }]}>
                {t('channel.leave')}
              </Text>
            </TouchableOpacity>
          )}
          {myUsername && channel?.ownerUsername === myUsername && (
            <TouchableOpacity
              style={[localStyles.dangerButton, { borderColor: colors.danger || '#D32F2F' }]}
              onPress={async () => {
                const ok = await deleteChannelOnServer(id!, myUsername);
                if (ok) {
                  const { deleteChannelLocally } = await import('../../../src/services/channelService');
                  await deleteChannelLocally(id!);
                  router.back();
                } else {
                  Alert.alert(t('common.error'), t('error.server'));
                }
              }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger || '#D32F2F'} />
              <Text style={[localStyles.dangerButtonText, { color: colors.danger || '#D32F2F' }]}>
                {t('channel.delete')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatarPicker: { width: 100, height: 100, borderRadius: 50, borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarPreview: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { alignItems: 'center', gap: 4 },
  avatarLabel: { fontSize: 11, fontWeight: '300' },
  formSection: { paddingHorizontal: 16, marginTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  input: { borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 0.5, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 16, gap: 8, marginBottom: 8 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  membersSection: { paddingHorizontal: 16, marginTop: 24 },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 },
  addMembersBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  addMembersBtnText: { fontSize: 12, fontWeight: '500' },
  memberItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 0.5, gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5 },
  memberAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  memberName: { fontSize: 15, fontWeight: '500' },
  memberUsername: { fontSize: 12, fontWeight: '300', marginTop: 1 },
  roleBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5 },
  roleBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  emptyText: { textAlign: 'center', marginTop: 20, fontSize: 14, fontWeight: '300' },
  dangerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, gap: 8,
    borderWidth: 1,
  },
  dangerButtonText: { fontSize: 15, fontWeight: '500' },
  addMembersSection: { paddingHorizontal: 16, marginTop: 16, paddingBottom: 24 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, borderWidth: 0.5 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  userItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 0.5, gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5 },
  userAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  userName: { fontSize: 15, fontWeight: '500' },
  userUsername: { fontSize: 12, fontWeight: '300', marginTop: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  removeBtn: { padding: 4 },
});

export default ChannelInfoScreen;
