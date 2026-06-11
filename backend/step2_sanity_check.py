"""
Step 2: Sanity Check — Load ArcFace model and extract 512-dim embedding from a single image.
Run: python step2_sanity_check.py --image /path/to/your/photo.jpg
"""

import argparse
import numpy as np
import cv2
from insightface.app import FaceAnalysis


def load_model():
    """Load InsightFace ArcFace model (downloads automatically on first run)."""
    print("Loading InsightFace ArcFace model (first run downloads ~500MB)...")
    app = FaceAnalysis(
        name="buffalo_l",          # ArcFace R100 — best accuracy
        providers=["CPUExecutionProvider"]   # swap to CUDAExecutionProvider if GPU available
    )
    app.prepare(ctx_id=0, det_size=(640, 640))
    print("✅ Model loaded successfully")
    return app


def extract_embedding(app, image_path: str):
    """Detect faces and return embeddings for each detected face."""
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    faces = app.get(img)

    if not faces:
        print("❌ No faces detected in the image.")
        return []

    results = []
    for i, face in enumerate(faces):
        embedding = face.embedding          # shape: (512,)
        bbox = face.bbox.astype(int)        # [x1, y1, x2, y2]
        det_score = float(face.det_score)   # detection confidence

        results.append({
            "face_index": i,
            "embedding": embedding,
            "bbox": bbox.tolist(),
            "det_score": det_score,
        })

        print(f"\n👤 Face {i + 1}:")
        print(f"   Detection confidence : {det_score:.4f}")
        print(f"   Bounding box         : {bbox.tolist()}")
        print(f"   Embedding shape      : {embedding.shape}   ← must be (512,)")
        print(f"   Embedding norm       : {np.linalg.norm(embedding):.4f}  ← should be ~1.0")
        print(f"   First 5 values       : {embedding[:5]}")

    return results


def main():
    parser = argparse.ArgumentParser(description="ArcFace sanity check")
    parser.add_argument("--image", required=True, help="Path to a test image")
    args = parser.parse_args()

    app = load_model()
    results = extract_embedding(app, args.image)

    if results:
        print(f"\n✅ PASS — {len(results)} face(s) detected, 512-dim embeddings extracted.")
    else:
        print("\n❌ FAIL — No faces detected. Try a clearer/larger photo.")


if __name__ == "__main__":
    main()
