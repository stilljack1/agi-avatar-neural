import mysql.connector
import os
from datetime import datetime

class MemorySystem:
    def __init__(self):
        # We catch connection errors so the brain doesn't crash if DB is offline
        try:
            self.conn = mysql.connector.connect(
                host="92.112.187.33",  # Hostinger IP
                user="u160069997_careers", # Database User
                password=os.getenv("DB_PASSWORD"), # Secure Env Variable
                database="u160069997_FairGroupAI"
            )
            self.cursor = self.conn.cursor()
            self.create_cortex()
            print("✅ [MEMORY] Connected to Hostinger MySQL Neural Bank.")
        except Exception as e:
            print(f"⚠️ [MEMORY] Offline Mode: {e}")
            self.conn = None

    def create_cortex(self):
        """Creates the table to store conversations if it doesn't exist."""
        if self.conn:
            query = """
            CREATE TABLE IF NOT EXISTS agi_memories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                avatar VARCHAR(50),
                user_input TEXT,
                ai_response TEXT,
                emotion VARCHAR(50),
                timestamp DATETIME
            )
            """
            self.cursor.execute(query)
            self.conn.commit()

    def store_thought(self, avatar, user_input, response, emotion="neutral"):
        """Saves a conversation turn to long-term storage."""
        if self.conn:
            try:
                sql = "INSERT INTO agi_memories (avatar, user_input, ai_response, emotion, timestamp) VALUES (%s, %s, %s, %s, %s)"
                val = (avatar, user_input, response, emotion, datetime.now())
                self.cursor.execute(sql, val)
                self.conn.commit()
                print("💾 [MEMORY] Thought saved.")
            except Exception as e:
                print(f"❌ [MEMORY] Save failed: {e}")

memory = MemorySystem()
