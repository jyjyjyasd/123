"""Quick diagnostic: check extend generations and their actual output images."""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "posterforge.db"
conn = sqlite3.connect(str(DB))
c = conn.cursor()

# 1. Recent agent sessions
print("=== Recent Agent Sessions ===")
c.execute("""
    SELECT id, status, aspect_ratio, resolution, generation_id, 
           primary_ratio, extended_images, updated_at
    FROM agent_sessions 
    WHERE deleted_at IS NULL 
    ORDER BY updated_at DESC LIMIT 5
""")
for r in c.fetchall():
    ext = json.loads(r[6]) if r[6] else []
    ext_summary = []
    for e in ext:
        ext_summary.append(f"{e.get('ratio')}:{e.get('status')}")
    print(f"  Session {r[0][:12]}.. | status={r[1]} | ratio={r[2]} | gen={str(r[4])[:12] if r[4] else 'None'} | prim_ratio={r[5]} | extended=[{', '.join(ext_summary)}] | updated={r[7]}")

# 2. Recent edit generations (the ones sent to apimart)
print("\n=== Recent Edit Generations (the actual API calls) ===")
c.execute("""
    SELECT id, action, status, params, reference_file_ids, output_file_ids, 
           error_message, created_at, completed_at
    FROM generations 
    WHERE action = 'edit'
    ORDER BY created_at DESC LIMIT 15
""")
for r in c.fetchall():
    params = json.loads(r[3]) if r[3] else {}
    ref_ids = json.loads(r[4]) if r[4] else []
    out_ids = json.loads(r[5]) if r[5] else []
    print(f"  Gen {r[0][:16]}.. | status={r[2]} | size={params.get('size')} | res={params.get('resolution')} | refs={len(ref_ids)} | outs={len(out_ids)} | err={str(r[6])[:50] if r[6] else None} | created={r[7]}")

# 3. Check actual output file dimensions by looking at file records
print("\n=== Output File Details (for completed edit generations) ===")
c.execute("""
    SELECT g.id, g.params, g.output_file_ids, f.id, f.mime_type
    FROM generations g
    JOIN files f ON f.id = json_extract(g.output_file_ids, '$[0]')
    WHERE g.action = 'edit' AND g.status = 'completed'
    ORDER BY g.created_at DESC LIMIT 10
""")
for r in c.fetchall():
    params = json.loads(r[1]) if r[1] else {}
    print(f"  Gen {r[0][:16]}.. | requested_size={params.get('size')} | file_id={r[3][:16]}.. | mime={r[4]}")

# 4. Check if there's a pattern: all edits return 1:1 regardless of requested size
print("\n=== Size Distribution in Completed Edit Generations ===")
c.execute("""
    SELECT json_extract(params, '$.size') as req_size, COUNT(*) as cnt
    FROM generations 
    WHERE action = 'edit' AND status = 'completed'
    GROUP BY req_size
""")
for r in c.fetchall():
    print(f"  Requested size={r[0]}: {r[1]} generations")

conn.close()
