"""
Step 5: Google Drive → InsightFace pipeline.

Prerequisites:
1. Create a Google Cloud project, enable Drive API, create a Service Account,
   download the JSON key, and save it as service_account.json.
2. Share your Drive folder with the service account email.

Run:
    python step5_drive_test.py \
        --sa_key service_account.json \
        --folder_id <Google Drive folder ID>

The folder ID is the part after /folders/ in the Drive URL.
"""

import argparse
import io
import json
import os

import cv2
import numpy as np
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from insightface.app import FaceAnalysis

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
IMAGE_MIMETYPES = {
    "image/jpeg", "image/png", "image/webp", "image/bmp",
}


# ── auth ──────────────────────────────────────────────────────────────────────

def get_drive_service(sa_key_path: str):
    creds = service_account.Credentials.from_service_account_file(
        sa_key_path, scopes=SCOPES
    )
    service = build("drive", "v3", credentials=creds)
    print(f"✅ Authenticated with service account: {creds.service_account_email}")
    return service


# ── Drive listing ─────────────────────────────────────────────────────────────

def list_files_recursive(service, folder_id: str, prefix: str = "") -> list[dict]:
    """Recursively list all files under folder_id."""
    results = []
    page_token = None

    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id, name, mimeType, parents)",
            pageToken=page_token,
        ).execute()

        for item in resp.get("files", []):
            full_name = f"{prefix}/{item['name']}" if prefix else item["name"]
            if item["mimeType"] == "application/vnd.google-apps.folder":
                # recurse
                children = list_files_recursive(service, item["id"], prefix=full_name)
                results.extend(children)
            else:
                item["full_path"] = full_name
                results.append(item)

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


# ── download ──────────────────────────────────────────────────────────────────

def download_file_to_bytes(service, file_id: str) -> bytes:
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


# ── InsightFace ───────────────────────────────────────────────────────────────

def load_model():
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Step 5: Drive → InsightFace test")
    parser.add_argument("--sa_key", default="service_account.json")
    parser.add_argument("--folder_id", required=True, help="Root Drive folder ID")
    args = parser.parse_args()

    # 1. Auth
    service = get_drive_service(args.sa_key)

    # 2. List files
    print(f"\nListing files under folder {args.folder_id}...")
    all_files = list_files_recursive(service, args.folder_id)
    image_files = [f for f in all_files if f.get("mimeType") in IMAGE_MIMETYPES]
    print(f"  Total files   : {len(all_files)}")
    print(f"  Image files   : {len(image_files)}")

    if not image_files:
        print("❌ No image files found. Check folder ID and sharing permissions.")
        return

    # 3. Download the first image
    test_file = image_files[0]
    print(f"\nDownloading test image: {test_file['full_path']} ({test_file['id']})...")
    image_bytes = download_file_to_bytes(service, test_file["id"])
    print(f"  Downloaded {len(image_bytes):,} bytes")

    # 4. Decode
    img = bytes_to_cv2(image_bytes)
    if img is None:
        print("❌ Could not decode image bytes.")
        return
    print(f"  Decoded image shape: {img.shape}")

    # 5. Run InsightFace
    print("\nRunning InsightFace...")
    app = load_model()
    faces = app.get(img)
    print(f"  Faces detected: {len(faces)}")

    for i, face in enumerate(faces):
        emb = face.embedding
        print(f"\n  👤 Face {i + 1}:")
        print(f"     det_score  : {face.det_score:.4f}")
        print(f"     embedding  : shape={emb.shape}, norm={np.linalg.norm(emb):.4f}")

    if faces:
        print("\n✅ Full chain works: Drive → bytes → face detected → embedding extracted")
    else:
        print("\n⚠️  No faces found in the test image. Try a different image.")


if __name__ == "__main__":
    main()
