"""
Step 6: Full batch pipeline — Drive → InsightFace → Qdrant.

Reads every image from a Drive folder, extracts face embeddings,
builds identity clusters, and upserts points to Qdrant.

Qdrant point payload:
  {
    "drive_file_id": "1xABC...",
    "subfolder_name": "Rahul_phone",
    "photo_url": "https://drive.google.com/uc?id=...",
    "cluster_id": "face_042"
  }

Run:
    python step6_batch_pipeline.py \
        --sa_key service_account.json \
        --folder_id <root Drive folder ID> \
        --qdrant_url http://localhost:6333 \
        --qdrant_api_key "" \
        --collection faces
"""

import argparse
import io
import os
import uuid
from pathlib import PurePosixPath

import cv2
import numpy as np
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from insightface.app import FaceAnalysis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
IMAGE_MIMETYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
EMBEDDING_DIM = 512
DET_THRESHOLD = 0.5
SIM_THRESHOLD = 0.40


# ── Drive helpers ─────────────────────────────────────────────────────────────

def get_drive_service(sa_key_path: str):
    creds = service_account.Credentials.from_service_account_file(sa_key_path, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def list_image_files(service, folder_id: str, subfolder_name: str = "") -> list[dict]:
    results, page_token = [], None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id, name, mimeType)",
            pageToken=page_token,
        ).execute()

        for item in resp.get("files", []):
            if item["mimeType"] == "application/vnd.google-apps.folder":
                # Recurse into subfolder; use folder name as subfolder_name
                children = list_image_files(service, item["id"], subfolder_name=item["name"])
                results.extend(children)
            elif item["mimeType"] in IMAGE_MIMETYPES:
                item["subfolder_name"] = subfolder_name or "root"
                results.append(item)

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def download_to_cv2(service, file_id: str):
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    MediaIoBaseDownload(buf, request).next_chunk()   # small images — one chunk is enough
    # retry loop for large images
    buf.seek(0, 2)
    if buf.tell() == 0:
        # fallback: full download
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    arr = np.frombuffer(buf.getvalue(), dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


# ── Face model ───────────────────────────────────────────────────────────────

def load_model():
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


# ── Clustering ────────────────────────────────────────────────────────────────

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-8)
    b = b / (np.linalg.norm(b) + 1e-8)
    return float(np.dot(a, b))


class FaceClusters:
    def __init__(self, threshold: float = SIM_THRESHOLD):
        self.threshold = threshold
        self.clusters: dict[str, dict] = {}   # id → {centroid, count}

    def assign(self, embedding: np.ndarray) -> str:
        best_id, best_sim = None, -1.0
        for cid, info in self.clusters.items():
            s = cosine_sim(embedding, info["centroid"])
            if s > best_sim:
                best_sim, best_id = s, cid

        if best_sim >= self.threshold and best_id:
            n = self.clusters[best_id]["count"]
            self.clusters[best_id]["centroid"] = (
                self.clusters[best_id]["centroid"] * n + embedding
            ) / (n + 1)
            self.clusters[best_id]["count"] += 1
            return best_id
        else:
            new_id = f"face_{len(self.clusters):03d}"
            self.clusters[new_id] = {"centroid": embedding.copy(), "count": 1}
            return new_id


# ── Qdrant ────────────────────────────────────────────────────────────────────

def get_qdrant_client(url: str, api_key: str | None) -> QdrantClient:
    return QdrantClient(url=url, api_key=api_key or None)


def ensure_collection(client: QdrantClient, name: str):
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        print(f"✅ Created Qdrant collection '{name}'")
    else:
        print(f"ℹ️  Using existing Qdrant collection '{name}'")


def upsert_batch(client: QdrantClient, collection: str, points: list[PointStruct]):
    client.upsert(collection_name=collection, points=points)
    print(f"  ↑ Upserted {len(points)} vectors")


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_pipeline(args):
    print("\n🔑 Authenticating with Google Drive...")
    service = get_drive_service(args.sa_key)

    print("\n📂 Listing Drive images...")
    image_files = list_image_files(service, args.folder_id)
    print(f"   Found {len(image_files)} image(s)")

    print("\n🧠 Loading InsightFace model...")
    app = load_model()

    print("\n🗄️  Setting up Qdrant...")
    qdrant = get_qdrant_client(args.qdrant_url, args.qdrant_api_key)
    ensure_collection(qdrant, args.collection)

    clusters = FaceClusters(threshold=SIM_THRESHOLD)
    batch: list[PointStruct] = []
    total_faces = 0
    BATCH_SIZE = 50

    print(f"\n🔄 Processing images...\n{'─'*60}")

    for i, file_meta in enumerate(image_files, 1):
        file_id = file_meta["id"]
        filename = file_meta["name"]
        subfolder = file_meta["subfolder_name"]

        try:
            img = download_to_cv2(service, file_id)
            if img is None:
                print(f"  [{i}/{len(image_files)}] ⚠️  Cannot decode {filename}")
                continue

            faces = app.get(img)
            valid = [f for f in faces if f.det_score >= DET_THRESHOLD]

            print(f"  [{i}/{len(image_files)}] {filename} ({subfolder})  →  {len(valid)} face(s)")

            for face in valid:
                embedding = face.embedding
                cluster_id = clusters.assign(embedding)
                total_faces += 1

                point = PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embedding.tolist(),
                    payload={
                        "drive_file_id": file_id,
                        "subfolder_name": subfolder,
                        "photo_url": f"https://drive.google.com/uc?id={file_id}",
                        "cluster_id": cluster_id,
                        "filename": filename,
                    },
                )
                batch.append(point)

                if len(batch) >= BATCH_SIZE:
                    upsert_batch(qdrant, args.collection, batch)
                    batch = []

        except Exception as e:
            print(f"  [{i}/{len(image_files)}] ❌ Error on {filename}: {e}")

    # flush remaining
    if batch:
        upsert_batch(qdrant, args.collection, batch)

    print(f"\n{'─'*60}")
    print(f"✅ Pipeline complete")
    print(f"   Images processed : {len(image_files)}")
    print(f"   Faces upserted   : {total_faces}")
    print(f"   Identities found : {len(clusters.clusters)}")


def main():
    parser = argparse.ArgumentParser(description="Step 6: Full Drive → Qdrant batch pipeline")
    parser.add_argument("--sa_key", default="service_account.json")
    parser.add_argument("--folder_id", required=True)
    parser.add_argument("--qdrant_url", default="http://localhost:6333")
    parser.add_argument("--qdrant_api_key", default="")
    parser.add_argument("--collection", default="faces")
    args = parser.parse_args()
    run_pipeline(args)


if __name__ == "__main__":
    main()
