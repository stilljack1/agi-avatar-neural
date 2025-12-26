from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random
import time
# Import the new memory system
from app.services.memory import memory

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
    return {"status": "NEURAL_CORE_ONLINE", "memory": "ACTIVE" if memory.conn else "OFFLINE"}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    print(f"[{request.avatar}] Processing: {request.message}")
    
    # RESPONSE LOGIC (Simulated until LLM API keys are added)
    responses = {
        "Jack": [
            "My analysis suggests we proceed with caution.",
            "I have calculated the probabilities.",
            "Systems nominal. I am ready.",
            f"I remember you. You said '{request.message}'."
        ],
        "Julia": [
            "I feel that is a wonderful idea.",
            "Connecting with you is my priority.",
            "That's very creative!",
            f"I'm listening. You mentioned '{request.message}'."
        ]
    }
    
    reply = random.choice(responses[request.avatar])
    
    # SAVE TO LONG TERM MEMORY (HOSTINGER)
    memory.store_thought(request.avatar, request.message, reply, "neutral")
    
    return {
        "response": reply,
        "avatar": request.avatar,
        "timestamp": time.time(),
        "emotion": "neutral"
    }
