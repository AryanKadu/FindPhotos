"""
Bonus helper: Register a Google Drive push notification channel.
Run ONCE after deploying to Render.

Run:
    python setup_drive_webhook.py \
        --sa_key service_account.json \
        --folder_id YOUR_FOLDER_ID \
        --webhook_url https://your-app.onrender.com/webhook/drive

The channel expires after 7 days (max allowed by Drive API). Re-run to renew.
"""

import argparse
import json
import uuid

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sa_key", default="service_account.json")
    parser.add_argument("--folder_id", required=True)
    parser.add_argument("--webhook_url", required=True,
                        help="Public HTTPS URL of your /webhook/drive endpoint")
    args = parser.parse_args()

    creds = service_account.Credentials.from_service_account_file(args.sa_key, scopes=SCOPES)
    service = build("drive", "v3", credentials=creds)

    channel_id = str(uuid.uuid4())

    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": args.webhook_url,
        "expiration": str(int(__import__("time").time() * 1000) + 7 * 24 * 3600 * 1000),  # 7 days
    }

    print(f"Registering webhook for folder {args.folder_id}...")
    print(f"  Channel ID : {channel_id}")
    print(f"  Webhook URL: {args.webhook_url}")

    response = service.files().watch(fileId=args.folder_id, body=body).execute()

    print("\n✅ Webhook registered:")
    print(json.dumps(response, indent=2))
    print("\nSave the 'resourceId' — you'll need it to stop the channel later.")
    print(f"Channel expires: {response.get('expiration')} ms since epoch (7 days)")


if __name__ == "__main__":
    main()
