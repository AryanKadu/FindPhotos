import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  type GestureResponderEvent,
  type ListRenderItemInfo,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '@/constants/theme';
import {
  ingestDriveFolder,
  getIngestStatus,
  getPhotos,
  getStats,
  photoProxyUrl,
  previewDriveFolder,
  getConfig,
  updateConfig,
  deleteEvent,
  deletePhoto,
  type FolderPreview,
  type IngestStatus,
  type PhotoItem,
  type StatsResponse,
  type AppConfig,
} from '@/lib/api';

const GALLERY_COLS = 3;

export default function OrganizerScreen() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [eventInput, setEventInput] = useState('');

  // Active event view
  const [activeEventId, setActiveEventId] = useState('');

  // Config
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Already-indexed stats (fetched on mount)
  const [stats, setStats] = useState<StatsResponse | null>(null);

  // Gallery
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryTotal, setGalleryTotal] = useState(0);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // Folder preview state
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [folderData, setFolderData] = useState<FolderPreview | null>(null);
  const [error, setError] = useState('');

  // Ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<IngestStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── On mount: load stats + first gallery page ─────────────────────────────

  const loadStats = useCallback(async (eventId = activeEventId) => {
    try {
      const s = await getStats(eventId || undefined);
      setStats(s);
    } catch {
      // non-fatal
    }
  }, [activeEventId]);

  const loadGalleryPage = useCallback(async (page: number, append = false, eventId = activeEventId) => {
    setLoadingGallery(true);
    try {
      const data = await getPhotos(page, 24, eventId || undefined);
      setGalleryTotal(data.total);
      setPhotos(prev => (append ? [...prev, ...data.photos] : data.photos));
      setGalleryPage(page);
    } catch {
      // non-fatal
    } finally {
      setLoadingGallery(false);
    }
  }, [activeEventId]);

  const loadConfig = useCallback(async () => {
    try {
      const c = await getConfig();
      setConfig(c);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadGalleryPage(0);
    loadConfig();
  }, [loadStats, loadGalleryPage, loadConfig]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Sheet / folder logic ──────────────────────────────────────────────────

  const openSheet = () => {
    setError('');
    setSheetVisible(true);
  };

  const closeSheet = () => setSheetVisible(false);

  const preventClose = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  const onConnect = async () => {
    const link = folderInput.trim();
    if (!link) {
      setError('Please enter a Drive folder URL or ID.');
      return;
    }

    setIsLoadingPreview(true);
    setError('');
    closeSheet();

    try {
      const preview = await previewDriveFolder(link);
      setFolderData(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to preview folder';
      setError(message);
      setFolderData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const startIngestion = async () => {
    if (!folderInput.trim()) return;
    const eid = eventInput.trim() || 'default_event';

    setIsIngesting(true);
    setError('');
    setIngestProgress(null);

    try {
      await ingestDriveFolder(folderInput.trim(), eid);
      setActiveEventId(eid);
      // Poll every 5s (reduced from 2s to cut log spam)
      pollRef.current = setInterval(async () => {
        try {
          const status = await getIngestStatus();
          setIngestProgress(status);
          if (!status.running) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setIsIngesting(false);
            // Refresh stats + gallery after ingestion completes
            loadStats();
            loadGalleryPage(0);
          }
        } catch {
          // Silently retry on poll failure
        }
      }, 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start ingestion';
      setError(message);
      setIsIngesting(false);
    }
  };

  const handleUpdateStrictness = async (delta: number) => {
    if (!config) return;
    const newSim = Math.max(0.1, Math.min(0.9, config.sim_threshold + delta));
    try {
      const res = await updateConfig(Number(newSim.toFixed(2)));
      setConfig(res.config);
    } catch (e) {
      alert('Failed to update settings');
    }
  };

  const handleDeleteEvent = async () => {
    const isAll = !activeEventId;
    const msg = isAll 
      ? 'Are you sure you want to completely WIPE ALL PHOTOS across all events? This cannot be undone.'
      : `Are you sure you want to delete all photos for event "${activeEventId}"?`;

    if (confirm(msg)) {
      try {
        await deleteEvent(isAll ? undefined : activeEventId);
        alert(isAll ? 'All database data wiped!' : 'Event deleted');
        
        // Reset UI state completely
        setFolderData(null);
        setIngestProgress(null);
        
        loadStats();
        loadGalleryPage(0);
      } catch (e) {
        alert('Failed to delete data: ' + e);
      }
    }
  };

  const handleDeletePhoto = async (fileId: string) => {
    if (confirm('Are you sure you want to delete this photo? It will be removed from the gallery.')) {
      try {
        await deletePhoto(fileId);
        // Remove it from the local list so UI updates instantly
        setPhotos(prev => prev.filter(p => p.drive_file_id !== fileId));
        setGalleryTotal(prev => prev - 1);
        loadStats(); // update the counter
      } catch (e) {
        alert('Failed to delete photo: ' + e);
      }
    }
  };

  const subfolderEntries = folderData ? Object.entries(folderData.subfolders) : [];

  const progressPct =
    ingestProgress && ingestProgress.total_images > 0
      ? Math.round((ingestProgress.processed / ingestProgress.total_images) * 100)
      : 0;

  const hasMorePhotos = photos.length < galleryTotal;

  // ── Gallery item ──────────────────────────────────────────────────────────

  const renderPhoto = ({ item }: ListRenderItemInfo<PhotoItem>) => (
    <View style={styles.photoCell}>
      <Image
        source={{ uri: photoProxyUrl(item.drive_file_id) }}
        style={styles.photoThumb}
        resizeMode="cover"
      />
      <Text style={styles.photoLabel} numberOfLines={1}>
        {item.filename}
      </Text>
      <Pressable 
        style={styles.photoDeleteBtn} 
        onPress={() => handleDeletePhoto(item.drive_file_id)}
      >
        <Ionicons name="trash" size={16} color="#fff" />
      </Pressable>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>

      {/* Already-indexed stats banner */}
      {stats && stats.total_vectors > 0 ? (
        <View style={styles.statsBanner}>
          <Ionicons color={COLORS.success} name="checkmark-circle" size={18} />
          <Text style={styles.statsText}>
            <Text style={styles.statsNum}>{stats.total_vectors.toLocaleString()}</Text> faces already indexed
            {galleryTotal > 0 ? ` across ${galleryTotal} photos` : ''} — no re-ingestion needed after restart
          </Text>
        </View>
      ) : null}

      {/* Hero / sync card */}
      <View style={styles.heroCard}>
        <Text style={styles.title}>Event Management</Text>
        <TextInput
          style={[styles.input, { marginBottom: 16 }]}
          placeholder="Active Event ID (leave empty for all)"
          placeholderTextColor={COLORS.textMuted}
          value={activeEventId}
          onChangeText={setActiveEventId}
        />

        {config && (
           <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
             <Text style={styles.subtitle}>Strictness: {config.sim_threshold.toFixed(2)}</Text>
             <View style={{ flexDirection: 'row', gap: 10 }}>
               <Pressable onPress={() => handleUpdateStrictness(-0.05)} style={styles.smallBtn}><Text style={styles.smallBtnText}>-</Text></Pressable>
               <Pressable onPress={() => handleUpdateStrictness(0.05)} style={styles.smallBtn}><Text style={styles.smallBtnText}>+</Text></Pressable>
             </View>
           </View>
        )}

        {activeEventId ? (
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode
                value={`${Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_APP_URL || 'exp://localhost:8081/--'}/attendee?event=${activeEventId}`}
                size={150}
              />
            </View>
            <Text style={[styles.subtitle, { marginTop: 12, textAlign: 'center' }]}>Scan to open Attendee View for '{activeEventId}'</Text>
          </View>
        ) : null}

        <Pressable onPress={handleDeleteEvent} style={[styles.syncButton, { backgroundColor: COLORS.error, marginBottom: 16 }]}>
          <Ionicons color={COLORS.text} name="trash-outline" size={18} />
          <Text style={styles.syncButtonText}>
            {activeEventId ? 'Clear Event Data' : 'Wipe All Database Data'}
          </Text>
        </Pressable>

        <Text style={[styles.title, { marginTop: 10 }]}>Sync Drive</Text>
        <Text style={styles.subtitle}>
          Connect a Google Drive folder to index faces. Data is stored in Qdrant and persists across server restarts.
        </Text>

        <Pressable onPress={openSheet} style={styles.syncButton}>
          <Ionicons color={COLORS.text} name="cloud-upload-outline" size={18} />
          <Text style={styles.syncButtonText}>
            {stats && stats.total_vectors > 0 ? 'Add / Re-sync Drive Folder' : 'Sync Drive Folder'}
          </Text>
        </Pressable>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorCard}>
          <Ionicons color={COLORS.error} name="alert-circle-outline" size={18} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Preview loading */}
      {isLoadingPreview ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={COLORS.accent} size="small" />
          <Text style={styles.loadingText}>Loading folder structure…</Text>
        </View>
      ) : null}

      {/* Folder tree + ingest controls */}
      {folderData ? (
        <View style={styles.treeCard}>
          <View style={styles.treeHeader}>
            <Text style={styles.treeTitle}>Connected Folder</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{folderData.total_images} images</Text>
            </View>
          </View>

          <View style={styles.treeRow}>
            <Ionicons color={COLORS.accent} name="folder-open" size={18} />
            <Text style={styles.rootFolder}>{folderData.folder_id}</Text>
          </View>

          {subfolderEntries.map(([name, files]) => (
            <View key={name} style={styles.treeRowNested}>
              <Ionicons color={COLORS.textMuted} name="folder-outline" size={16} />
              <Text style={styles.subFolder}>
                {name} ({files.length} files)
              </Text>
            </View>
          ))}

          {!isIngesting && !ingestProgress ? (
            <Pressable onPress={startIngestion} style={styles.ingestButton}>
              <Ionicons color={COLORS.text} name="rocket-outline" size={18} />
              <Text style={styles.ingestButtonText}>Start Ingestion</Text>
            </Pressable>
          ) : null}

          {isIngesting && ingestProgress ? (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color={COLORS.accent} size="small" />
                <Text style={styles.progressText}>
                  Processing… {ingestProgress.processed}/{ingestProgress.total_images} ({progressPct}%)
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.progressDetail}>
                {ingestProgress.faces_found} faces found so far
              </Text>
            </View>
          ) : null}

          {!isIngesting && ingestProgress && !ingestProgress.running ? (
            <View style={styles.doneCard}>
              <Ionicons color={COLORS.success} name="checkmark-circle" size={22} />
              <Text style={styles.doneText}>
                Ingestion complete — {ingestProgress.faces_found} faces indexed from{' '}
                {ingestProgress.total_images} images
              </Text>
            </View>
          ) : null}
        </View>
      ) : !isLoadingPreview && !error && !(stats && stats.total_vectors > 0) ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No photos indexed yet</Text>
          <Text style={styles.emptyText}>Connect a Drive folder above to start indexing faces.</Text>
        </View>
      ) : null}

      {/* Photo gallery */}
      {photos.length > 0 ? (
        <View style={styles.gallerySection}>
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>Indexed Photos</Text>
            <Text style={styles.galleryCount}>{galleryTotal} total</Text>
          </View>

          <FlatList
            data={photos}
            keyExtractor={item => item.drive_file_id}
            numColumns={GALLERY_COLS}
            renderItem={renderPhoto}
            scrollEnabled={false}
            columnWrapperStyle={styles.galleryRow}
          />

          {hasMorePhotos ? (
            <Pressable
              disabled={loadingGallery}
              onPress={() => loadGalleryPage(galleryPage + 1, true)}
              style={[styles.loadMoreButton, loadingGallery && { opacity: 0.6 }]}
            >
              {loadingGallery ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={styles.loadMoreText}>
                  Load more ({galleryTotal - photos.length} remaining)
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : loadingGallery && photos.length === 0 ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={COLORS.accent} size="small" />
          <Text style={styles.loadingText}>Loading gallery…</Text>
        </View>
      ) : null}

      {/* Drive link modal */}
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
              style={[styles.input, { marginBottom: 10 }]}
              value={folderInput}
            />
            
            <TextInput
              autoCapitalize="none"
              onChangeText={setEventInput}
              placeholder="Event ID (e.g. aarav_wedding)"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              value={eventInput}
            />

            <Pressable
              disabled={isLoadingPreview}
              onPress={onConnect}
              style={[styles.connectButton, isLoadingPreview && { opacity: 0.6 }]}
            >
              {isLoadingPreview ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={styles.connectButtonText}>Connect</Text>
              )}
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

  // Stats banner
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(76,217,123,0.08)',
    borderColor: 'rgba(76,217,123,0.25)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  statsText: {
    color: COLORS.textMuted,
    fontSize: 13,
    flex: 1,
  },
  statsNum: {
    color: COLORS.success,
    fontWeight: '700',
  },

  // Hero
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

  // Error card
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,107,129,0.1)',
    borderColor: 'rgba(255,107,129,0.3)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    flex: 1,
  },

  // Loading card
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Tree card
  treeCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  treeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  treeTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  subFolder: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Ingest button
  ingestButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  ingestButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },

  // Progress
  progressCard: {
    gap: 8,
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceSoft,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  progressDetail: {
    color: COLORS.textMuted,
    fontSize: 12,
  },

  // Done
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(76,217,123,0.1)',
    borderColor: 'rgba(76,217,123,0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  doneText: {
    color: COLORS.success,
    fontSize: 13,
    flex: 1,
    fontWeight: '600',
  },

  // Empty state
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

  // Gallery
  gallerySection: {
    gap: 12,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  galleryCount: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  galleryRow: {
    gap: 4,
    marginBottom: 4,
  },
  photoCell: {
    flex: 1 / GALLERY_COLS,
    maxWidth: `${100 / GALLERY_COLS}%` as unknown as number,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  photoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: COLORS.text,
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },

  // Load more
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  loadMoreText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },

  // Modal
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
