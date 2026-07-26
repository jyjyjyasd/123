"""Check actual output image dimensions from DB width/height columns."""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "posterforge.db"
conn = sqlite3.connect(str(DB))
c = conn.cursor()

# Get recent completed edit generations with their output file dimensions
c.execute("""
    SELECT g.id, g.params, g.output_file_ids, g.created_at,
           f.width, f.height, f.path
    FROM generations g
    JOIN files f ON f.id = json_extract(g.output_file_ids, '$[0]')
    WHERE g.action = 'edit' AND g.status = 'completed'
    ORDER BY g.created_at DESC LIMIT 20
""")
rows = c.fetchall()

print("=== Output Image Dimensions (edit generations, from DB) ===")
for r in rows:
    gen_id, params_str, output_ids_str, created, w, h, path = r
    params = json.loads(params_str) if params_str else {}
    req_size = params.get('size', '?')
    actual_ratio = f"{w/h:.3f}" if w and h else "?"
    
    if ':' in req_size:
        rw, rh = req_size.split(':')
        expected_ratio = f"{int(rw)/int(rh):.3f}"
    else:
        expected_ratio = "?"
    
    match = "OK" if w and h and expected_ratio != "?" and abs(w/h - int(req_size.split(':')[0])/int(req_size.split(':')[1])) < 0.15 else "MISMATCH?"
    print(f"  {gen_id[:16]}.. | req={req_size} | actual={w}x{h} (ratio={actual_ratio}) | expected={expected_ratio} | {match}")

# Also check ALL generations (including generate action)
print("\n=== ALL Recent Generations Dimensions ===")
c.execute("""
    SELECT g.id, g.action, g.params, g.output_file_ids,
           f.width, f.height
    FROM generations g
    JOIN files f ON f.id = json_extract(g.output_file_ids, '$[0]')
    WHERE g.status = 'completed'
    ORDER BY g.created_at DESC LIMIT 20
""")
rows = c.fetchall()
for r in rows:
    gen_id, action, params_str, output_ids_str, w, h = r
    params = json.loads(params_str) if params_str else {}
    req_size = params.get('size', '?')
    actual_ratio = f"{w/h:.3f}" if w and h else "?"
    
    if ':' in req_size and ':' in req_size:
        rw, rh = req_size.split(':')
        expected_ratio_val = int(rw)/int(rh)
        match = "OK" if w and h and abs(w/h - expected_ratio_val) < 0.15 else "MISMATCH"
    else:
        match = "N/A"
    
    print(f"  {gen_id[:16]}.. | {action:6s} | req={req_size:5s} | actual={w}x{h} (ratio={actual_ratio}) | {match}")

conn.close()
