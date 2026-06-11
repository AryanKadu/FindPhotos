"""
Step 3: Test on a folder of mixed photos.
- Detects all faces in every image
- Prints cosine similarity between all face pairs
- Goal: same-person > 0.4, different-person < 0.3

Run:
    python step3_similarity_test.py --folder /path/to/photos --threshold 0.5

Optional: supply a CSV of known pairs for automatic evaluation:
    --pairs_csv known_pairs.csv   (columns: img1, img2, same_person)
"""

import argparse
import os
import itertools
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ── helpers ──────────────────────────────────────────────────────────────────

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two L2-normalised embeddings."""
    a = a / (np.linalg.norm(a) + 1e-8)
    b = b / (np.linalg.norm(b) + 1e-8)
    return float(np.dot(a, b))


def load_model(det_threshold: float = 0.5):
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def process_folder(app, folder: str, det_threshold: float):
    """Return {filename: [embedding, ...]} for every image in folder."""
    folder = Path(folder)
    results = {}

    image_paths = [p for p in folder.iterdir() if p.suffix.lower() in SUPPORTED_EXTS]
    if not image_paths:
        print(f"❌ No images found in {folder}")
        return results

    print(f"\nProcessing {len(image_paths)} images from {folder}...\n")

    for path in sorted(image_paths):
        img = cv2.imread(str(path))
        if img is None:
            print(f"  ⚠️  Cannot read {path.name}, skipping.")
            continue

        faces = app.get(img)
        # filter by detection confidence
        valid = [f for f in faces if f.det_score >= det_threshold]

        print(f"  {path.name:40s}  →  {len(valid)} face(s) detected "
              f"(det_threshold={det_threshold})")

        results[path.name] = [f.embedding for f in valid]

    return results


# ── similarity analysis ───────────────────────────────────────────────────────

def print_pairwise_similarities(embeddings_map: dict):
    """
    Print cosine similarity between the *primary* (first) face in each image.
    For group shots you'll need to pick specific face indices manually.
    """
    items = [(name, embs[0]) for name, embs in embeddings_map.items() if embs]
    if len(items) < 2:
        print("Need at least 2 images with detected faces.")
        return

    print("\n" + "=" * 70)
    print(f"{'Image A':30s}  {'Image B':30s}  {'Similarity':>10}")
    print("=" * 70)

    for (name_a, emb_a), (name_b, emb_b) in itertools.combinations(items, 2):
        sim = cosine_similarity(emb_a, emb_b)
        flag = ""
        if sim > 0.4:
            flag = "✅ likely SAME"
        elif sim < 0.3:
            flag = "❌ likely DIFFERENT"
        else:
            flag = "⚠️  ambiguous"

        print(f"{name_a:30s}  {name_b:30s}  {sim:10.4f}  {flag}")

    print("=" * 70)
    print("\nGuideline: same-person similarity > 0.4  |  different-person < 0.3")


def evaluate_pairs_csv(embeddings_map: dict, pairs_csv: str):
    """
    Optional: evaluate using a CSV with columns: img1, img2, same_person (0/1).
    Prints TP/FP/FN/FP stats for a 0.35 threshold.
    """
    import csv

    threshold = 0.35
    tp = fp = tn = fn = 0

    with open(pairs_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            img1, img2 = row["img1"], row["img2"]
            label = int(row["same_person"])

            embs1 = embeddings_map.get(img1, [])
            embs2 = embeddings_map.get(img2, [])
            if not embs1 or not embs2:
                continue

            sim = cosine_similarity(embs1[0], embs2[0])
            pred = 1 if sim >= threshold else 0

            if pred == 1 and label == 1:
                tp += 1
            elif pred == 1 and label == 0:
                fp += 1
            elif pred == 0 and label == 1:
                fn += 1
            else:
                tn += 1

    total = tp + fp + tn + fn
    accuracy = (tp + tn) / total if total else 0
    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0

    print(f"\n📊 Evaluation (threshold={threshold}):")
    print(f"   TP={tp}  FP={fp}  TN={tn}  FN={fn}")
    print(f"   Accuracy={accuracy:.2%}  Precision={precision:.2%}  Recall={recall:.2%}")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Step 3: similarity test on photo folder")
    parser.add_argument("--folder", required=True, help="Folder containing test images")
    parser.add_argument("--threshold", type=float, default=0.5,
                        help="Detection confidence threshold (default: 0.5)")
    parser.add_argument("--pairs_csv", default=None,
                        help="Optional CSV with known same/different pairs")
    args = parser.parse_args()

    app = load_model(args.threshold)
    embeddings_map = process_folder(app, args.folder, args.threshold)

    print_pairwise_similarities(embeddings_map)

    if args.pairs_csv:
        evaluate_pairs_csv(embeddings_map, args.pairs_csv)


if __name__ == "__main__":
    main()
