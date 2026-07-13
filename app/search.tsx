import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { globalStyles } from '../src/theme/styles';
import { Ionicons } from '@expo/vector-icons';
import { searchUser } from '../src/services/api';
import { getLocalIdentity } from '../src/services/identity';
import { router } from 'expo-router';
import { t } from '../src/services/i18n';

type SearchState = 'idle' | 'searching' | 'found' | 'not_found' | 'error';

const SearchScreen = () => {
  const { colors } = useTheme();
  const styles = globalStyles(colors);
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [foundUser, setFoundUser] = useState<{ username: string; publicKey: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const myUsernameRef = useRef<string>('');

  useEffect(() => {
    getLocalIdentity().then(id => {
      if (id) myUsernameRef.current = id.username;
    });
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    const cleanQuery = query.trim().toLowerCase();
    setSearchState('searching');
    setErrorMessage('');

    // If searching for yourself, redirect to Saved Messages
    if (cleanQuery === myUsernameRef.current) {
      setFoundUser({ username: cleanQuery, publicKey: '' });
      setSearchState('found');
      return;
    }

    try {
      const result = await searchUser(cleanQuery);
      if (result.error) {
        setSearchState('error');
        setErrorMessage(result.error);
        return;
      }
      if (result.found && result.username) {
        // If the found user is the current user, redirect to Saved Messages
        if (result.username === myUsernameRef.current) {
          setFoundUser({ username: result.username, publicKey: '' });
          setSearchState('found');
          return;
        }
        setSearchState('found');
        setFoundUser({
          username: result.username,
          publicKey: result.publicKey || ''
        });
      } else {
        setSearchState('not_found');
      }
    } catch (error) {
      setSearchState('error');
      setErrorMessage(t('search.searchFailed'));
    }
  };

  const handleStartChat = () => {
    if (!foundUser) return;
    // If it's self, go to saved messages
    if (foundUser.username === myUsernameRef.current) {
      router.push('/saved-messages');
      return;
    }
    router.push(`./chat/${foundUser.username}`);
  };

  const handleStartGhostChat = () => {
    if (foundUser) {
      router.push(`./ghost-invite-sent?toUser=${foundUser.username}&snapshotsAllowed=true`);
    }
  };

  const getStatusIcon = () => {
    switch (searchState) {
      case 'searching':
        return <ActivityIndicator size="large" color={colors.accent} />;
      case 'found':
        return <Ionicons name="checkmark-circle" size={56} color={colors.accent} />;
      case 'not_found':
        return <Ionicons name="person-remove" size={56} color={colors.textSecondary} />;
      case 'error':
        return <Ionicons name="alert-circle" size={56} color="#D32F2F" />;
      default:
        return <Ionicons name="search" size={56} color={colors.textSecondary} />;
    }
  };

  const getStatusText = () => {
    switch (searchState) {
      case 'searching':
        return t('search.searching');
      case 'found':
        return `@${foundUser?.username}`;
      case 'not_found':
        return t('search.notFound');
      case 'error':
        return errorMessage || t('search.searchFailed');
      default:
        return t('search.enterUsername');
    }
  };

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glassPanel, localStyles.searchContainer, { borderColor: colors.border }]}>
        <View style={localStyles.inputRow}>
          <Text style={[localStyles.atSign, { color: colors.textSecondary }]}>@</Text>
          <TextInput
            placeholder={t('onboarding.usernamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={(text) => {
              setQuery(text.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
              if (searchState !== 'idle') setSearchState('idle');
            }}
            style={[localStyles.input, { color: colors.text }]}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity 
              onPress={() => {
                setQuery('');
                setSearchState('idle');
              }}
              style={localStyles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={[
            localStyles.searchButton,
            { 
              backgroundColor: query.length >= 3 ? colors.accent : colors.border,
              opacity: query.length >= 3 ? 1 : 0.5
            }
          ]}
          onPress={handleSearch}
          disabled={query.length < 3 || searchState === 'searching'}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={localStyles.resultContainer}>
        <View style={[localStyles.resultCard, { 
          backgroundColor: colors.surface,
          borderColor: searchState === 'found' ? colors.accent : colors.border 
        }]}>
          {getStatusIcon()}
          <Text style={[localStyles.statusText, { 
            color: searchState === 'error' ? '#D32F2F' : 
                   searchState === 'found' ? colors.primary : 
                   colors.textSecondary 
          }]}>
            {getStatusText()}
          </Text>
          
          {searchState === 'found' && foundUser && (
            <View style={localStyles.actionSection}>
              {foundUser.username === myUsernameRef.current ? (
                <>
                  <TouchableOpacity
                    style={[localStyles.actionButton, { backgroundColor: colors.accent }]}
                    onPress={handleStartChat}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="bookmark" size={18} color="#FFF" />
                    <Text style={localStyles.actionButtonText}>{t('search.openSaved')}</Text>
                  </TouchableOpacity>
                  <View style={localStyles.explainRow}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                    <Text style={[localStyles.explainText, { color: colors.textSecondary }]}>
                      {t('search.selfFound')}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={localStyles.buttonRow}>
                    <TouchableOpacity
                      style={[localStyles.actionButton, { backgroundColor: colors.accent }]}
                      onPress={handleStartChat}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="#FFF" />
                      <Text style={localStyles.actionButtonText}>{t('search.normalChat')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[localStyles.actionButton, localStyles.ghostButton, { borderColor: colors.accent }]}
                      onPress={handleStartGhostChat}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="flash" size={18} color={colors.accent} />
                      <Text style={[localStyles.actionButtonText, { color: colors.accent }]}>{t('chatlist.ghost')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={localStyles.explainRow}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                    <Text style={[localStyles.explainText, { color: colors.textSecondary }]}>
                      {t('search.ghostExplain')}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {searchState === 'idle' && (
        <View style={localStyles.hintContainer}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={[localStyles.hintText, { color: colors.textSecondary }]}>
            {t('saved.searchHint')}
          </Text>
        </View>
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', padding: 4, marginBottom: 24 },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  atSign: { fontSize: 20, marginRight: 4 },
  input: { flex: 1, fontSize: 18, paddingVertical: 12, fontWeight: '300' },
  clearButton: { padding: 4 },
  searchButton: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  resultContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 28, alignItems: 'center', gap: 14 },
  statusText: { fontSize: 18, fontWeight: '300', letterSpacing: 1, textAlign: 'center' },
  actionSection: { width: '100%', marginTop: 8, gap: 10 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 6,
  },
  actionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },
  ghostButton: { backgroundColor: 'transparent', borderWidth: 1 },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  explainText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '300' },
  hintContainer: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 8, marginBottom: 32 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

export default SearchScreen;
