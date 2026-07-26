"""Deep dive: compare matching vs mismatching 4:3 edit generations."""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "posterforge.db"
conn = sqlite3.connect(str(DB))
c = conn.cursor()

# Get all 4:3 edit generations with file dimensions
c.execute("""
    SELECT g.id, g.params, g.reference_file_ids, g.output_file_ids, 
           g.prompt, g.created_at,
           f.width, f.height, f.size_bytes
    FROM generations g
    LEFT JOIN files f ON f.id = json_extract(g.output_file_ids, '$[0]')
    WHERE g.action = 'edit' 
    AND g.status = 'completed'
    AND json_extract(g.params, '$.size') = '4:3'
    ORDER BY g.created_at DESC
""")
rows = c.fetchall()

# Get reference file info
c.execute("SELECT id, path, mime_type, width, height, size_bytes FROM files")
file_info = {r[0]: {"path": r[1], "mime": r[2], "w": r[3], "h": r[4], "size": r[5]} for r in c.fetchall()}

print("=== ALL Completed 4:3 Edit Generations ===")
print(f"{'Gen ID':20s} | {'Actual Size':14s} | {'Ratio':6s} | {'Ref File Info':60s} | {'Prompt Length':>12s} | {'Created'}")
print("-" * 160)

for r in rows:
    gen_id, params_str, ref_ids_str, out_ids_str, prompt, created, w, h, fsize = r
    params = json.loads(params_str) if params_str else {}
    ref_ids = json.loads(ref_ids_str) if ref_ids_str else []
    out_ids = json.loads(out_ids_str) if out_ids_str else []
    
    actual_size = f"{w}x{h}" if w and h else "N/A"
    actual_ratio = f"{w/h:.3f}" if w and h else "?"
    is_match = "OK" if w and h and abs(w/h - 4/3) < 0.15 else "MISMATCH"
    
    ref_info_parts = []
    for ref_id in ref_ids:
        fi = file_info.get(ref_id, {})
        ref_info_parts.append(f"{fi.get('mime','?')} {fi.get('w','?')}x{fi.get('h','?')} {fi.get('size','?')}B")
    ref_info = " | ".join(ref_info_parts) if ref_info_parts else "NO REFS"
    
    prompt_len = len(prompt) if prompt else 0
    
    print(f"{gen_id[:18]:20s} | {actual_size:14s} | {actual_ratio:6s} | {ref_info[:60]:60s} | {prompt_len:12d} | {created}")

# Focus on the mismatched ones
print("\n=== MISMATCH Generations (4:3 → 1:1) ===")
for r in rows:
    gen_id, params_str, ref_ids_str, out_ids_str, prompt, created, w, h, fsize = r
    if not w or not h:
        continue
    if abs(w/h - 4/3) < 0.15:
        continue
    
    ref_ids = json.loads(ref_ids_str) if ref_ids_str else []
    out_ids = json.loads(out_ids_str) if out_ids_str else []
    
    print(f"\n--- Gen {gen_id} ---")
    print(f"  Actual: {w}x{h} (ratio {w/h:.3f})")
    print(f"  Created: {created}")
    print(f"  Prompt length: {len(prompt) if prompt else 0}")
    
    # Check reference image info
    for ref_id in ref_ids:
        fi = file_info.get(ref_id, {})
        print(f"  Ref file: {ref_id[:16]}.. | mime={fi.get('mime')} | dims={fi.get('w')}x{fi.get('h')} | size={fi.get('size')}B | path={fi.get('path','')[:60]}")

conn.close()
