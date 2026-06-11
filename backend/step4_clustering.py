"""
Step 4: Cluster face embeddings by identity.

Uses threshold-based nearest-neighbour clustering (no DBSCAN).
Produces:  cluster_id → [list of photo filenames]

Run:
    python step4_clustering.py --folder /path/to/photos --sim_threshold 0.40
"""

import argparse
import json
import uuid
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ── embedding helpers ─────────────────────────────────────────────────────────

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-8)
    b = b / (np.linalg.norm(b) + 1e-8)
    return float(np.dot(a, b))


def load_model():
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


# ── core clustering ───────────────────────────────────────────────────────────

class FaceClusters:
    """
    Incremental nearest-neighbour clustering.

    Each cluster stores the *mean* embedding of all assigned faces, used as
    the representative centroid for future comparisons.
    """

    def __init__(self, sim_threshold: float = 0.40):
        self.sim_threshold = sim_threshold
        # cluster_id → {"centroid": np.ndarray, "photos": [filename, ...]}
        self.clusters: dict[str, dict] = {}

    def _find_best_cluster(self, embedding: np.ndarray):
        best_id, best_sim = None, -1.0
        for cid, info in self.clusters.items():
            sim = cosine_similarity(embedding, info["centroid"])
            if sim > best_sim:
                best_sim = sim
                best_id = cid
        return best_id, best_sim

    def add(self, embedding: np.ndarray, filename: str) -> str:
        """Assign embedding to existing cluster or create a new one. Returns cluster_id."""
        best_id, best_sim = self._find_best_cluster(embedding)

        if best_sim >= self.sim_threshold and best_id is not None:
            # Merge into existing cluster — update centroid with running mean
            info = self.clusters[best_id]
            n = len(info["photos"])
            info["centroid"] = (info["centroid"] * n + embedding) / (n + 1)
            if filename not in info["photos"]:
                info["photos"].append(filename)
            return best_id
        else:
            # New identity
            new_id = f"face_{len(self.clusters):03d}"
            self.clusters[new_id] = {
                "centroid": embedding.copy(),
                "photos": [filename],
            }
            return new_id

    def summary(self) -> dict[str, list]:
        return {cid: info["photos"] for cid, info in self.clusters.items()}


# ── pipeline ──────────────────────────────────────────────────────────────────

def process_folder(app, folder: str, det_threshold: float, sim_threshold: float):
    folder = Path(folder)
    image_paths = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUPPORTED_EXTS)

    if not image_paths:
        print(f"❌ No images found in {folder}")
        return {}, []

    clusters = FaceClusters(sim_threshold=sim_threshold)
    face_records = []   # flat list of all detected faces with metadata

    print(f"\nProcessing {len(image_paths)} images  "
          f"(det_threshold={det_threshold}, sim_threshold={sim_threshold})...\n")

    for path in image_paths:
        img = cv2.imread(str(path))
        if img is None:
            print(f"  ⚠️  Cannot read {path.name}, skipping.")
            continue

        faces = app.get(img)
        valid = [f for f in faces if f.det_score >= det_threshold]

        for face_idx, face in enumerate(valid):
            embedding = face.embedding
            cluster_id = clusters.add(embedding, path.name)

            face_records.append({
                "filename": path.name,
                "face_index": face_idx,
                "cluster_id": cluster_id,
                "det_score": float(face.det_score),
                "bbox": face.bbox.astype(int).tolist(),
            })

        face_label = ", ".join(
            r["cluster_id"] for r in face_records if r["filename"] == path.name
        )
        print(f"  {path.name:40s} → {len(valid)} face(s): [{face_label}]")

    return clusters.summary(), face_records


def print_cluster_summary(cluster_map: dict):
    print("\n" + "=" * 60)
    print(f"{'CLUSTER':12s}  {'# PHOTOS':>8}  PHOTOS")
    print("=" * 60)
    for cid, photos in sorted(cluster_map.items()):
        print(f"  {cid:12s}  {len(photos):>8}  {', '.join(photos)}")
    print("=" * 60)
    print(f"  Total identities found: {len(cluster_map)}")


def main():
    parser = argparse.ArgumentParser(description="Step 4: face clustering")
    parser.add_argument("--folder", required=True)
    parser.add_argument("--det_threshold", type=float, default=0.5,
                        help="Detection confidence threshold")
    parser.add_argument("--sim_threshold", type=float, default=0.40,
                        help="Cosine similarity threshold to merge into existing cluster")
    parser.add_argument("--output_json", default="clusters.json",
                        help="Save cluster map to JSON file")
    args = parser.parse_args()

    app = load_model()
    cluster_map, face_records = process_folder(
        app, args.folder, args.det_threshold, args.sim_threshold
    )

    print_cluster_summary(cluster_map)

    # Save results
    output = {
        "cluster_map": cluster_map,       # cluster_id → [filenames]
        "face_records": face_records,     # per-face detail
    }
    with open(args.output_json, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n💾 Results saved to {args.output_json}")


if __name__ == "__main__":
    main()
