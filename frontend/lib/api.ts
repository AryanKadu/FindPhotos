/**
 * API client for the FindPhotos FastAPI backend.
 * All backend calls go through this module.
 */

import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthResponse = {
  status: string;
  model: string;
  collection: string;
};

export type StatsResponse = {
  total_vectors: number;
  collection: string;
  error?: string;
};

export type IngestResponse = {
  status: string;
  folder_id: string;
};

export type IngestStatus = {
  running: boolean;
  folder_id: string;
  total_images: number;
  processed: number;
  faces_found: number;
};

export type FolderPreview = {
  folder_id: string;
  total_images: number;
  subfolders: Record<string, string[]>;
};

export type PhotoItem = {
  drive_file_id: string;
  filename: string;
  subfolder_name: string;
};

export type PhotosResponse = {
  total: number;
  page: number;
  per_page: number;
  photos: PhotoItem[];
};

export type PhotoMatch = {
  photo_url: string;
  drive_file_id: string;
  filename: string;
  subfolder_name: string;
  cluster_id: string;
  score: number;
};

export type IdentifyResponse = {
  faces_detected: number;
  matches: PhotoMatch[];
  cluster_ids: string[];
};

export type AppConfig = {
  sim_threshold: number;
};

export type ConfigUpdateResponse = {
  status: string;
  config: AppConfig;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the proxied URL for a Drive photo (served through the backend). */
export function photoProxyUrl(driveFileId: string): string {
  return `${API_URL}/photo/${driveFileId}`;
}

// ── API Functions ────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/** How many face vectors are currently indexed in Qdrant. */
export async function getStats(eventId?: string): Promise<StatsResponse> {
  const url = eventId ? `${API_URL}/stats?event_id=${eventId}` : `${API_URL}/stats`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
  return res.json();
}

/** Paginated list of unique photos from Qdrant (deduped by drive_file_id). */
export async function getPhotos(page = 0, perPage = 24, eventId?: string): Promise<PhotosResponse> {
  const url = eventId 
    ? `${API_URL}/photos?page=${page}&per_page=${perPage}&event_id=${eventId}`
    : `${API_URL}/photos?page=${page}&per_page=${perPage}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Photos failed: ${res.status}`);
  return res.json();
}

export async function previewDriveFolder(driveLink: string): Promise<FolderPreview> {
  const res = await fetch(`${API_URL}/ingest/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drive_link: driveLink }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Preview failed: ${res.status}`);
  }
  return res.json();
}

export async function ingestDriveFolder(driveLink: string, eventId: string): Promise<IngestResponse> {
  const res = await fetch(`${API_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drive_link: driveLink, event_id: eventId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Ingest failed: ${res.status}`);
  }
  return res.json();
}

export async function getIngestStatus(): Promise<IngestStatus> {
  const res = await fetch(`${API_URL}/ingest/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

/**
 * Upload a selfie and return matching photos from the indexed collection.
 * top_k: how many matches to return (default 50, max 200).
 */
export async function identifyFace(imageUri: string, eventId?: string): Promise<IdentifyResponse> {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    // On web: imageUri is either a blob URL or a data URI
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('file', blob, 'selfie.jpg');
  } else {
    // On native: pass the file URI directly
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'selfie.jpg',
    } as unknown as Blob);
  }

  const url = eventId ? `${API_URL}/identify?event_id=${eventId}` : `${API_URL}/identify`;
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type — fetch sets it with the boundary automatically
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Identify failed: ${res.status}`);
  }
  return res.json();
}

// ── Organizer Config / Data Management ───────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_URL}/config`);
  if (!res.ok) throw new Error(`Config check failed: ${res.status}`);
  return res.json();
}

export async function updateConfig(simThreshold: number): Promise<ConfigUpdateResponse> {
  const res = await fetch(`${API_URL}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sim_threshold: simThreshold }),
  });
  if (!res.ok) throw new Error(`Config update failed: ${res.status}`);
  return res.json();
}

export async function deleteEvent(eventId?: string): Promise<{ status: string }> {
  const url = eventId ? `${API_URL}/events/${eventId}` : `${API_URL}/events`;
  const res = await fetch(url, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Delete failed: ${res.status}`);
  }
  return res.json();
}

export async function downloadPhotosZip(photos: { drive_file_id: string; filename: string }[]): Promise<Blob> {
  const res = await fetch(`${API_URL}/download-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Zip download failed: ${res.status}`);
  }
  return res.blob();
}

export async function deletePhoto(fileId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/photo/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `Delete photo failed: ${res.status}`);
  }
  return res.json();
}
