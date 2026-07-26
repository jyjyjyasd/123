import sqlite3
import json

db_path = r"D:\ai\agent\agent合并\PosterForge-main\backend\data\posterforge.db"

def main():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- 1. Checking generations table for 9:32 ---")
    cursor.execute("SELECT id, action, status, params, error_message, created_at FROM generations WHERE params LIKE '%9:32%' LIMIT 10")
    rows = cursor.fetchall()
    for row in rows:
        print(f"Gen ID: {row[0]}, Action: {row[1]}, Status: {row[2]}, Params: {row[3]}, Error: {row[4]}, Created: {row[5]}")
        
    print("\n--- 2. Checking agent_sessions table for 9:32 ---")
    cursor.execute("SELECT id, status, aspect_ratio, final_prompt, generation_id, created_at FROM agent_sessions WHERE aspect_ratio = '9:32' OR clarify_messages LIKE '%9:32%' LIMIT 10")
    rows = cursor.fetchall()
    for row in rows:
        print(f"Session ID: {row[0]}, Status: {row[1]}, AspectRatio: {row[2]}, GenID: {row[4]}, Created: {row[5]}")
        
    conn.close()

if __name__ == '__main__':
    main()
