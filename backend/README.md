# Face Recognition System — ML + Backend

Full pipeline: Google Drive photos → InsightFace ArcFace embeddings → Qdrant → FastAPI on Render.

---

## Quick Start

```bash
pip install -r requirements.txt
```

---

## Phase 1 — Get the Model Working Locally

### Step 2 — Sanity check (single image)
```bash
python step2_sanity_check.py --image /path/to/photo.jpg
```
**Pass criteria:** 512-dim embedding printed, norm ≈ 1.0

---

### Step 3 — Similarity test (folder of photos)
```bash
python step3_similarity_test.py --folder /path/to/photos --threshold 0.5
```
**Pass criteria:**
- Same-person pairs: cosine similarity **> 0.4**
- Different-person pairs: cosine similarity **< 0.3**

Tune `--threshold` (detection confidence) if too many/few faces are detected.

---

### Step 4 — Clustering
```bash
python step4_clustering.py \
    --folder /path/to/photos \
    --det_threshold 0.5 \
    --sim_threshold 0.40 \
    --output_json clusters.json
```
Results are printed and saved to `clusters.json`.

---

## Phase 2 — Connect to Google Drive

### Prerequisites
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Drive API**
3. Create a **Service Account** → download JSON key → save as `service_account.json`
4. Share your Drive folder with the service account email (Viewer permission)

### Step 5 — Drive integration test
```bash
python step5_drive_test.py \
    --sa_key service_account.json \
    --folder_id YOUR_FOLDER_ID
```
Folder ID = the part after `/folders/` in your Drive URL.

---

### Step 6 — Full batch pipeline → Qdrant
Start Qdrant locally first:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

Then run:
```bash
python step6_batch_pipeline.py \
    --sa_key service_account.json \
    --folder_id YOUR_FOLDER_ID \
    --qdrant_url http://localhost:6333 \
    --collection faces
```

---

### Step 7 — Retrieval test
```bash
python step7_retrieval_test.py \
    --selfie /path/to/selfie.jpg \
    --qdrant_url http://localhost:6333 \
    --collection faces \
    --top_k 5
```
Confirm the correct person's photos appear in the top results.

---

## Phase 3 — FastAPI + Render

### Step 8–9 — Run locally
```bash
uvicorn app:app --reload --port 8000
```

Test endpoints:
```bash
# Health check
curl http://localhost:8000/health

# Trigger ingestion (runs in background)
curl -X POST http://localhost:8000/ingest

# Identify a selfie
curl -X POST http://localhost:8000/identify \
     -F "file=@selfie.jpg" \
     -F "top_k=5"
```

---

### Step 10 — Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service → connect repo
3. Render auto-detects `render.yaml`
4. In the **Environment** tab, set:
   - `QDRANT_URL` → your Qdrant Cloud URL
   - `QDRANT_API_KEY` → your Qdrant API key
   - `GOOGLE_SA_JSON` → paste the **entire contents** of `service_account.json`
   - `DRIVE_FOLDER_ID` → your Drive folder ID
5. Deploy → wait for `/health` to return 200

> ⚠️ Use at least the **Starter** plan — InsightFace needs ~1GB RAM.
> For faster inference, upgrade to Standard and set `CUDAExecutionProvider`.

---

### Step 11 — Set up Drive webhook

Register the webhook (run once):
```bash
python setup_drive_webhook.py \
    --sa_key service_account.json \
    --folder_id YOUR_FOLDER_ID \
    --webhook_url https://your-app.onrender.com/webhook/drive
```

Then upload a photo to Drive and check:
- Render logs show the file being processed
- Qdrant dashboard shows new vectors

---

## Qdrant Point Schema

```json
{
  "id": "uuid-v4",
  "vector": [... 512 floats ...],
  "payload": {
    "drive_file_id": "1xABC...",
    "subfolder_name": "Rahul_phone",
    "photo_url": "https://drive.google.com/uc?id=1xABC...",
    "cluster_id": "face_042",
    "filename": "IMG_0042.jpg"
  }
}
```

---

## Tuning Guide

| Parameter | Default | Effect |
|-----------|---------|--------|
| `DET_THRESHOLD` | 0.5 | Higher = fewer false detections. Lower = catches harder faces. |
| `SIM_THRESHOLD` | 0.40 | Higher = stricter identity matching. Lower = more merging. |
| `top_k` | 5 | Number of results returned by `/identify`. |

---

## File Structure

```
face_recognition_system/
├── step2_sanity_check.py      # Phase 1: single image test
├── step3_similarity_test.py   # Phase 1: folder similarity analysis
├── step4_clustering.py        # Phase 1: identity clustering
├── step5_drive_test.py        # Phase 2: Drive auth + download test
├── step6_batch_pipeline.py    # Phase 2: full Drive → Qdrant batch
├── step7_retrieval_test.py    # Phase 2: selfie → Qdrant query test
├── app.py                     # Phase 3: FastAPI app (all routes)
├── render.yaml                # Phase 3: Render deployment config
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```
