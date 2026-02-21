import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { COLORS } from '@/constants/theme';

const PLACEHOLDER_RESULTS = Array.from({ length: 12 }, (_, index) => `photo-${index + 1}`);

export default function AttendeeScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();

  const [cameraVisible, setCameraVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const itemSize = Math.min(180, Math.max(90, (width - 64) / 3));

  const openCamera = async () => {
    setCameraError('');
    const currentPermission = permission?.granted ? permission : await requestPermission();

    if (!currentPermission.granted) {
      setCameraError('Camera permission is required to capture a selfie.');
      return;
    }

    setCameraVisible(true);
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
    await openCamera();
  };

  const findMyPhotos = () => {
    setPreviewVisible(false);
    setShowResults(true);
  };

  return (
    <View style={styles.screen}>
      {!showResults ? (
        <View style={styles.centerContainer}>
          <Pressable onPress={openCamera} style={styles.captureButton}>
            <Ionicons color={COLORS.text} name="camera" size={26} />
            <Text style={styles.captureText}>Capture</Text>
          </Pressable>
          {cameraError ? <Text style={styles.errorText}>{cameraError}</Text> : null}
        </View>
      ) : (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>Your Photos</Text>
            <Pressable onPress={openCamera} style={styles.captureIconButton}>
              <Ionicons color={COLORS.text} name="camera-outline" size={20} />
            </Pressable>
          </View>

          <FlatList
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            data={PLACEHOLDER_RESULTS}
            keyExtractor={(item) => item}
            numColumns={3}
            renderItem={() => <View style={[styles.photoPlaceholder, { width: itemSize, height: itemSize }]} />}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

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

      <Modal animationType="fade" onRequestClose={() => setPreviewVisible(false)} transparent visible={previewVisible}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview</Text>
            {capturedUri ? <Image source={{ uri: capturedUri }} style={styles.previewImage} /> : null}

            <View style={styles.previewActions}>
              <Pressable onPress={retake} style={styles.previewSecondaryButton}>
                <Text style={styles.previewSecondaryText}>Retake</Text>
              </Pressable>
              <Pressable onPress={findMyPhotos} style={styles.previewPrimaryButton}>
                <Text style={styles.previewPrimaryText}>Find My Photos</Text>
              </Pressable>
            </View>
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
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },
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
  captureIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
  },
  gridContent: {
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  photoPlaceholder: {
    borderRadius: 12,
    backgroundColor: '#2A2D44',
  },
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
});
