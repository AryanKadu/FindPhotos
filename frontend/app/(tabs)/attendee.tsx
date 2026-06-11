import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { COLORS } from '@/constants/theme';
import { identifyFace, photoProxyUrl, downloadPhotosZip, type PhotoMatch } from '@/lib/api';

export default function AttendeeScreen() {
  const { event } = useLocalSearchParams<{ event?: string }>();
  const [manualEventId, setManualEventId] = useState('');
  
  const activeEventId = event || manualEventId;
  const [tempEventId, setTempEventId] = useState('');

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();

  const [cameraVisible, setCameraVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // API state
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<PhotoMatch[]>([]);
  const [facesDetected, setFacesDetected] = useState(0);
  const [searchError, setSearchError] = useState('');

  // Viewer state
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoMatch | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Web file picker ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const itemSize = Math.min(180, Math.max(90, (width - 64) / 3));

  const openCamera = async () => {
    setCameraError('');

    if (Platform.OS === 'web') {
      // On web, use file picker instead of camera
      triggerFilePicker();
      return;
    }

    const currentPermission = permission?.granted ? permission : await requestPermission();

    if (!currentPermission.granted) {
      setCameraError('Camera permission is required to capture a selfie.');
      return;
    }

    setCameraVisible(true);
  };

  const triggerFilePicker = () => {
    if (Platform.OS !== 'web') return;

    // Create or reuse a hidden file input
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.style.display = 'none';
      input.addEventListener('change', handleFileSelected);
      document.body.appendChild(input);
      fileInputRef.current = input;
    }
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFileSelected = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setCapturedUri(url);
    setPreviewVisible(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
      });

      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setCameraVisible(false);
        setPreviewVisible(true);
      }
    } catch {
      setCameraError('Unable to capture photo. Please try again.');
    }
  };

  const retake = async () => {
    setPreviewVisible(false);
    setSearchError('');
    await openCamera();
  };

  const runSearch = async () => {
    if (!capturedUri || !activeEventId) return;

    setCameraVisible(false);
    setPreviewVisible(false);
    setIsSearching(true);
    setSearchError('');
    setFacesDetected(0);
    setMatches([]);
    setShowResults(true);

    try {
      const data = await identifyFace(capturedUri, activeEventId);
      setFacesDetected(data.faces_detected);
      setMatches(data.matches);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to identify face';
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
  };

  const resetSearch = () => {
    setShowResults(false);
    setMatches([]);
    setSearchError('');
    setCapturedUri(null);
    setFacesDetected(0);
  };

  const downloadPhoto = async (photo: PhotoMatch) => {
    setIsDownloading(true);
    try {
      const url = photoProxyUrl(photo.drive_file_id);
      // Fallback filename if backend doesn't provide one
      const rawFilename = photo.filename || `photo_${photo.drive_file_id}.jpg`;
      // Ensure the filename is safe for the filesystem (no spaces or weird characters)
      const safeFilename = rawFilename.replace(/[^a-zA-Z0-9.\-_]/g, '_');

      if (Platform.OS === 'web') {
        // Append a query param to bypass the browser's disk cache.
        // If the browser cached the image via the <img> tag (no-cors opaque response),
        // reusing it for fetch() causes a CORS 'Failed to fetch' error.
        const res = await fetch(`${url}?download=1`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = FileSystem.documentDirectory + safeFilename;
        const downloaded = await FileSystem.downloadAsync(url, fileUri);
        if (downloaded.status !== 200) {
          throw new Error(`Server returned HTTP ${downloaded.status}`);
        }
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloaded.uri);
        } else {
          alert('Sharing is not available on this device');
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to download photo: ${msg}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (matches.length === 0) return;
    setIsDownloading(true);
    try {
      const blob = await downloadPhotosZip(
        matches.map(m => ({ drive_file_id: m.drive_file_id, filename: m.filename }))
      );

      if (Platform.OS === 'web') {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${activeEventId}_photos.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = FileSystem.documentDirectory + `${activeEventId}_photos.zip`;
        // expo-file-system cannot save a Blob directly from fetch. 
        // We have to read it as base64 or download directly from a URL.
        // But since we already have a Blob on native, we must convert it to base64.
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          await FileSystem.writeAsStringAsync(fileUri, base64data, { encoding: FileSystem.EncodingType.Base64 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
          } else {
            alert('Sharing is not available on this device');
          }
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      console.error('Zip download error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to download zip: ${msg}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const renderMatchItem = ({ item }: { item: PhotoMatch }) => (
    <Pressable
      onPress={() => setSelectedPhoto(item)}
      style={[styles.photoCard, { width: itemSize, height: itemSize }]}
    >
      <Image
        source={{ uri: photoProxyUrl(item.drive_file_id) }}
        style={styles.photoImage}
        resizeMode="cover"
      />
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreText}>{Math.round(item.score * 100)}%</Text>
      </View>
    </Pressable>
  );

  if (!activeEventId) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 20 }]}>
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>Enter Event Code</Text>
          <Text style={styles.promptText}>To find your photos, you need the event code from the organizer.</Text>
          <TextInput
            style={[styles.input, { marginVertical: 16 }]}
            placeholder="e.g. aarav_wedding"
            placeholderTextColor={COLORS.textMuted}
            value={tempEventId}
            onChangeText={setTempEventId}
            autoCapitalize="none"
          />
          <Pressable 
            style={[styles.actionButton, !tempEventId.trim() && { opacity: 0.5 }]} 
            onPress={() => { if (tempEventId.trim()) setManualEventId(tempEventId.trim()); }}
          >
            <Text style={styles.actionButtonText}>Join Event</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {!showResults ? (
        <View style={styles.centerContainer}>
          <Text style={styles.title}>Find Your Event Photos</Text>
          <Text style={styles.subtitle}>
            Upload a selfie, and we'll instantly find all photos of you from the event <Text style={{fontWeight: '700'}}>'{activeEventId}'</Text>.
          </Text>
          <Pressable onPress={openCamera} style={styles.captureButton}>
            <Ionicons
              color={COLORS.text}
              name={Platform.OS === 'web' ? 'cloud-upload' : 'camera'}
              size={26}
            />
            <Text style={styles.captureText}>
              {Platform.OS === 'web' ? 'Upload' : 'Capture'}
            </Text>
          </Pressable>
          <Text style={styles.captureHint}>
            {Platform.OS === 'web'
              ? 'Upload a selfie to find your photos'
              : 'Take a selfie to find your photos'}
          </Text>
          {cameraError ? <Text style={styles.errorText}>{cameraError}</Text> : null}
        </View>
      ) : (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultsTitle}>Found {matches.length} Photos</Text>
              <Text style={styles.resultsSubtitle}>
                {facesDetected > 1 ? 'Multiple faces detected. ' : ''}
                Sorted by similarity match.
              </Text>
            </View>
            <View style={styles.headerActions}>
              {matches.length > 0 && (
                <Pressable
                  onPress={handleDownloadZip}
                  disabled={isDownloading}
                  style={styles.zipButton}
                >
                  {isDownloading ? (
                    <ActivityIndicator color={COLORS.text} size="small" />
                  ) : (
                    <Ionicons color={COLORS.text} name="download-outline" size={16} />
                  )}
                  <Text style={styles.zipButtonText}>ZIP</Text>
                </Pressable>
              )}
              <Pressable onPress={resetSearch} style={styles.resetButton}>
                <Ionicons color={COLORS.text} name="close" size={20} />
              </Pressable>
            </View>
          </View>

          {isSearching ? (
            <View style={styles.searchingContainer}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.searchingText}>Searching for your face…</Text>
            </View>
          ) : searchError ? (
            <View style={styles.errorContainer}>
              <Ionicons color={COLORS.error} name="alert-circle-outline" size={32} />
              <Text style={styles.errorTitle}>Search Failed</Text>
              <Text style={styles.errorDetail}>{searchError}</Text>
              <Pressable onPress={openCamera} style={styles.retryButton}>
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons color={COLORS.textMuted} name="images-outline" size={48} />
              <Text style={styles.emptyTitle}>No Matches Found</Text>
              <Text style={styles.emptyText}>
                {facesDetected === 0
                  ? 'No face was detected in your photo. Try a clearer selfie.'
                  : 'Your face was detected but no matching photos were found in the event album.'}
              </Text>
              <Pressable onPress={openCamera} style={styles.retryButton}>
                <Text style={styles.retryText}>Try Another Photo</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              data={matches}
              keyExtractor={(item) => item.drive_file_id}
              numColumns={3}
              renderItem={renderMatchItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Native Camera Modal */}
      <Modal animationType="slide" onRequestClose={() => setCameraVisible(false)} visible={cameraVisible}>
        <View style={styles.cameraScreen}>
          <CameraView facing="front" ref={cameraRef} style={StyleSheet.absoluteFill} />
          <View style={styles.cameraFooter}>
            <Pressable onPress={() => setCameraVisible(false)} style={styles.cameraSecondaryAction}>
              <Ionicons color={COLORS.text} name="close" size={20} />
            </Pressable>
            <Pressable onPress={capturePhoto} style={styles.shutterOuter}>
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.cameraSecondarySpacer} />
          </View>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal animationType="fade" onRequestClose={() => setPreviewVisible(false)} transparent visible={previewVisible}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview</Text>
            {capturedUri ? <Image source={{ uri: capturedUri }} style={styles.previewImage} /> : null}

            <View style={styles.previewActions}>
              <Pressable onPress={retake} style={styles.previewSecondaryButton}>
                <Text style={styles.previewSecondaryText}>Retake</Text>
              </Pressable>
              <Pressable onPress={runSearch} style={styles.previewPrimaryButton}>
                {isSearching ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <Text style={styles.previewPrimaryText}>Find My Photos</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal animationType="fade" onRequestClose={() => setSelectedPhoto(null)} transparent visible={!!selectedPhoto}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setSelectedPhoto(null)} style={styles.viewerCloseButton}>
              <Ionicons color={COLORS.text} name="close" size={28} />
            </Pressable>
          </View>
          {selectedPhoto && (
            <Image
              source={{ uri: photoProxyUrl(selectedPhoto.drive_file_id) }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.viewerFooter}>
            <Pressable
              disabled={isDownloading}
              onPress={() => selectedPhoto && downloadPhoto(selectedPhoto)}
              style={styles.downloadButton}
            >
              {isDownloading ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <>
                  <Ionicons color={COLORS.text} name="download-outline" size={20} />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  captureButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.accent,
    gap: 8,
  },
  captureText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  captureHint: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },
  // Results
  resultsContainer: {
    flex: 1,
    paddingTop: 18,
    paddingHorizontal: 14,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  resultsTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  resultsSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  zipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
  },
  zipButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  captureIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  // Searching state
  searchingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  searchingText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  errorDetail: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Grid
  gridContent: {
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  photoCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceSoft,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  scoreBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(13,15,26,0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scoreText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  // Camera
  cameraScreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  cameraFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 36,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  cameraSecondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(16,16,16,0.6)',
  },
  cameraSecondarySpacer: {
    width: 42,
    height: 42,
  },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  // Preview
  previewBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,16,0.84)',
    padding: 20,
  },
  previewCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  // Event Prompt
  promptCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    gap: 8,
  },
  promptTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  promptText: {
    color: COLORS.textMuted,
    fontSize: 15,
  },
  input: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    minHeight: 48,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
  },
  previewSecondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSecondaryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  previewPrimaryButton: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPrimaryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  // Viewer
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'space-between',
  },
  viewerHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  viewerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    flex: 1,
    width: '100%',
  },
  viewerFooter: {
    padding: 30,
    paddingBottom: 50,
    alignItems: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
    minWidth: 180,
  },
  downloadButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
