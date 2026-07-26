import sqlite3
import json

db_path = r"D:\ai\agent\agent合并\PosterForge-main\backend\data\posterforge.db"

def main():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, action, status, params, reference_file_ids, output_file_ids FROM generations WHERE id = 'c9183a49-9ec8-4a1c-97e1-7eda6f2dc5f3'")
    row = cursor.fetchone()
    if row:
        print(f"ID: {row[0]}")
        print(f"Action: {row[1]}")
        print(f"Status: {row[2]}")
        print(f"Params: {row[3]}")
        print(f"Ref Files: {row[4]}")
        print(f"Out Files: {row[5]}")
        
    conn.close()

if __name__ == '__main__':
    main()
