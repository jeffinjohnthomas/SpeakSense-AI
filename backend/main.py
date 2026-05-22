from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from twilio.rest import Client
import requests
import time
import os
import joblib
from datetime import datetime
import pandas as pd
import numpy as np
import neattext.functions as nfx

from dotenv import load_dotenv
load_dotenv()

# ---------------- CONFIGURATION & CREDENTIALS ----------------
# Twilio
account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
client = Client(account_sid, auth_token)
twilio_number = "+18782905611"

# AssemblyAI
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
BASE_URL = "https://api.assemblyai.com/v2"
HEADERS = {"authorization": ASSEMBLYAI_API_KEY}

# Model
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "text_emotion.pkl")

app = FastAPI(title="SpeakSense AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- IN-MEMORY DB ----------------
call_logs = []

class CallRequest(BaseModel):
    target_number: str

class CallLog(BaseModel):
    sid: str
    phone: str
    time: str
    duration: int
    sentiment: str
    transcription: str
    audio_url: Optional[str] = None
    status: str

# ---------------- HELPER FUNCTIONS ----------------
def transcribe_audio(file_path):
    with open(file_path, "rb") as f:
        upload_resp = requests.post(f"{BASE_URL}/upload", headers=HEADERS, data=f)
        upload_resp.raise_for_status()
    audio_url = upload_resp.json()["upload_url"]

    transcript_data = {"audio_url": audio_url, "speech_model": "universal"}
    transcript_resp = requests.post(f"{BASE_URL}/transcript", headers=HEADERS, json=transcript_data)
    transcript_resp.raise_for_status()

    transcript_id = transcript_resp.json()["id"]
    polling_endpoint = f"{BASE_URL}/transcript/{transcript_id}"

    while True:
        res = requests.get(polling_endpoint, headers=HEADERS)
        res.raise_for_status()
        res_json = res.json()
        if res_json.get("status") == "completed":
            return res_json.get("text", "")
        elif res_json.get("status") == "error":
            raise RuntimeError(res_json.get("error"))
        time.sleep(2)

def process_completed_call(sid: str):
    log = next((item for item in call_logs if item["sid"] == sid), None)
    if not log:
        return

    try:
        updated_call = client.calls(sid).fetch()
        log["duration"] = int(updated_call.duration) if updated_call.duration else 0
        
        recordings = client.calls(sid).recordings.list()
        if not recordings:
            log["sentiment"] = "No Audio"
            log["status"] = "failed"
            return
            
        recording = recordings[0]
        
        # Wait for the recording to be fully processed by Twilio
        max_retries = 30
        retries = 0
        while recording.status not in ["completed", "absent", "deleted"]:
            if retries >= max_retries:
                log["sentiment"] = "Recording Timeout"
                log["status"] = "failed"
                return
            time.sleep(2)
            recording = client.recordings(recording.sid).fetch()
            retries += 1
            
        if recording.status != "completed":
            log["sentiment"] = f"Recording {recording.status}"
            log["status"] = "failed"
            return

        recording_url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Recordings/{recording.sid}.wav"
        
        # Download locally to transcribe
        audio_folder = os.path.join(BASE_DIR, "audio")
        os.makedirs(audio_folder, exist_ok=True)
        audio_file_path = os.path.join(audio_folder, f"{sid}_recording.wav")
        
        response = requests.get(recording_url, auth=(account_sid, auth_token))
        if response.status_code != 200:
            log["status"] = "failed"
            log["sentiment"] = f"Twilio returned {response.status_code} for recording"
            return

        with open(audio_file_path, "wb") as f:
            f.write(response.content)
            
        log["audio_url"] = f"/api/audio/{sid}" # Use local backend endpoint for playback
        
        # Transcribe
        log["status"] = "analyzing"
        transcription = transcribe_audio(audio_file_path)
        log["transcription"] = transcription
        
        # Predict Sentiment
        if os.path.exists(MODEL_PATH):
            if transcription and transcription.strip():
                model = joblib.load(MODEL_PATH)
                sentiment = model.predict([transcription])[0]
                log["sentiment"] = sentiment
            else:
                log["sentiment"] = "No Speech Detected"
        
        log["status"] = "completed"
        
    except Exception as e:
        log["status"] = "failed"
        log["sentiment"] = f"Error: {str(e)}"

# ---------------- ENDPOINTS ----------------
@app.post("/api/calls", response_model=CallLog)
def initiate_call(req: CallRequest):
    try:
        call = client.calls.create(
            to=req.target_number,
            from_=twilio_number,
            twiml="""<Response><Pause length="600"/></Response>""",
            record=True
        )
        
        log_entry = {
            "sid": call.sid,
            "phone": req.target_number,
            "time": datetime.now().strftime("%I:%M %p"),
            "duration": 0,
            "sentiment": "Pending",
            "transcription": "",
            "audio_url": None,
            "status": "in-progress"
        }
        call_logs.append(log_entry)
        return log_entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calls/{sid}", response_model=CallLog)
def get_call_status(sid: str, background_tasks: BackgroundTasks):
    log = next((item for item in call_logs if item["sid"] == sid), None)
    if not log:
        raise HTTPException(status_code=404, detail="Call not found")
        
    if log["status"] == "in-progress":
        updated_call = client.calls(sid).fetch()
        if updated_call.status == 'completed':
            log["status"] = "processing" # Move to processing
            background_tasks.add_task(process_completed_call, sid)
        elif updated_call.status in ['busy', 'no-answer', 'canceled', 'failed']:
            log["status"] = "failed"
            log["sentiment"] = "Call Failed/Rejected"
            
    return log

@app.get("/api/logs", response_model=List[CallLog])
def get_all_logs(background_tasks: BackgroundTasks):
    for log in call_logs:
        if log["status"] == "in-progress":
            try:
                updated_call = client.calls(log["sid"]).fetch()
                if updated_call.status == 'completed':
                    log["status"] = "processing"
                    background_tasks.add_task(process_completed_call, log["sid"])
                elif updated_call.status in ['busy', 'no-answer', 'canceled', 'failed']:
                    log["status"] = "failed"
                    log["sentiment"] = "Call Failed/Rejected"
            except Exception:
                pass
    return list(reversed(call_logs))

@app.get("/api/audio/{sid}")
def get_audio(sid: str):
    audio_file_path = os.path.join(BASE_DIR, "audio", f"{sid}_recording.wav")
    if os.path.exists(audio_file_path):
        return FileResponse(audio_file_path, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Audio not found")
