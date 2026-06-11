"""
Step 7: Retrieval test.

Take a local selfie, extract its embedding, query Qdrant, confirm right photos come back.

Run:
    python step7_retrieval_test.py \
        --selfie /path/to/selfie.jpg \
        --qdrant_url http://localhost:6333 \
        --qdrant_api_key "" \
        --collection faces \
        --top_k 5
"""

import argparse

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from qdrant_client import QdrantClient


def load_model():
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def extract_query_embedding(app, image_path: str) -> np.ndarray | None:
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read: {image_path}")

    faces = app.get(img)
    if not faces:
        print("❌ No faces detected in the selfie.")
        return None

    # Use the highest-confidence face as the query
    best = max(faces, key=lambda f: f.det_score)
    print(f"✅ Query face detected  det_score={best.det_score:.4f}")
    return best.embedding


def query_qdrant(client: QdrantClient, collection: str, embedding: np.ndarray, top_k: int):
    results = client.search(
        collection_name=collection,
        query_vector=embedding.tolist(),
        limit=top_k,
        with_payload=True,
    )
    return results


def main():
    parser = argparse.ArgumentParser(description="Step 7: selfie → Qdrant retrieval test")
    parser.add_argument("--selfie", required=True)
    parser.add_argument("--qdrant_url", default="http://localhost:6333")
    parser.add_argument("--qdrant_api_key", default="")
    parser.add_argument("--collection", default="faces")
    parser.add_argument("--top_k", type=int, default=5)
    args = parser.parse_args()

    print("Loading model...")
    app = load_model()

    print(f"\nExtracting embedding from selfie: {args.selfie}")
    embedding = extract_query_embedding(app, args.selfie)
    if embedding is None:
        return

    print(f"\nQuerying Qdrant (top {args.top_k})...")
    client = QdrantClient(url=args.qdrant_url, api_key=args.qdrant_api_key or None)

    results = query_qdrant(client, args.collection, embedding, args.top_k)

    if not results:
        print("❌ No results returned from Qdrant.")
        return

    print(f"\n{'─'*70}")
    print(f"{'Rank':<5} {'Score':>6}  {'Cluster':>10}  {'Subfolder':>15}  URL")
    print(f"{'─'*70}")
    for rank, hit in enumerate(results, 1):
        p = hit.payload
        print(
            f"{rank:<5} {hit.score:>6.4f}  "
            f"{p.get('cluster_id','?'):>10}  "
            f"{p.get('subfolder_name','?'):>15}  "
            f"{p.get('photo_url','?')}"
        )

    print(f"\n{'─'*70}")
    print("✅ Top match:", results[0].payload.get("photo_url"))
    print(f"   Similarity score: {results[0].score:.4f}  (>0.4 = confident match)")


if __name__ == "__main__":
    main()
