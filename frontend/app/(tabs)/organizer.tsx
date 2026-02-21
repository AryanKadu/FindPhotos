import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { COLORS } from '@/constants/theme';

const MOCK_FOLDER = {
  name: 'FindPhotos Root',
  subfolders: ['Events', 'Guests', 'Highlights', 'Backups'],
};

export default function OrganizerScreen() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const openSheet = () => setSheetVisible(true);

  const closeSheet = () => setSheetVisible(false);

  const onConnect = () => {
    setIsConnected(true);
    closeSheet();
  };

  const preventClose = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.heroCard}>
        <Text style={styles.title}>Sync Drive</Text>
        <Text style={styles.subtitle}>
          Connect a Google Drive folder and confirm the synced structure before photo matching starts.
        </Text>

        <Pressable onPress={openSheet} style={styles.syncButton}>
          <Ionicons color={COLORS.text} name="cloud-upload-outline" size={18} />
          <Text style={styles.syncButtonText}>Sync Drive Folder</Text>
        </Pressable>
      </View>

      {isConnected ? (
        <View style={styles.treeCard}>
          <Text style={styles.treeTitle}>Connected Folder</Text>

          <View style={styles.treeRow}>
            <Ionicons color={COLORS.accent} name="folder-open" size={18} />
            <Text style={styles.rootFolder}>{MOCK_FOLDER.name}</Text>
          </View>

          {MOCK_FOLDER.subfolders.map((folderName) => (
            <View key={folderName} style={styles.treeRowNested}>
              <Ionicons color={COLORS.textMuted} name="folder-outline" size={16} />
              <Text style={styles.subFolder}>{folderName}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No folder synced yet</Text>
          <Text style={styles.emptyText}>Connect a folder to preview its structure.</Text>
        </View>
      )}

      <Modal animationType="fade" onRequestClose={closeSheet} transparent visible={sheetVisible}>
        <Pressable onPress={closeSheet} style={styles.backdrop}>
          <Pressable onPress={preventClose} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Connect Drive Folder</Text>
            <Text style={styles.sheetSubtitle}>Paste a Google Drive folder URL or Folder ID.</Text>

            <TextInput
              autoCapitalize="none"
              onChangeText={setFolderInput}
              placeholder="https://drive.google.com/drive/folders/..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              value={folderInput}
            />

            <Pressable onPress={onConnect} style={styles.connectButton}>
              <Text style={styles.connectButtonText}>Connect</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  syncButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  syncButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  treeCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  treeTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  treeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  treeRowNested: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 22,
  },
  rootFolder: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subFolder: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  emptyState: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8,9,18,0.7)',
    padding: 16,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  connectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    minHeight: 44,
    marginTop: 8,
  },
  connectButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
