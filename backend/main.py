from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random
import time

app = FastAPI(title="AGI Avatar Neural Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    avatar: str
    message: str

@app.get("/")
def health_check():
    return {"status": "NEURAL_CORE_ONLINE", "system": "AGI-1"}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    # SIMULATED INTELLIGENCE (Until API Keys are connected)
    print(f"[{request.avatar}] Processing: {request.message}")
    
    responses = {
        "Jack": [
            "My analysis suggests we proceed with caution.",
            "I have calculated the probabilities. The outcome looks favorable.",
            "Systems nominal. I am ready to execute your command.",
            f"I heard '{request.message}'. Expanding data parameters."
        ],
        "Julia": [
            "I feel that is a wonderful idea.",
            "Connecting with you is my priority. Tell me more.",
            "That's very creative! I'd love to explore that angle.",
            f"I'm listening. You said '{request.message}' - how does that make you feel?"
        ]
    }
    
    reply = random.choice(responses[request.avatar])
    
    return {
        "response": reply,
        "avatar": request.avatar,
        "timestamp": time.time(),
        "emotion": "neutral"
    }
