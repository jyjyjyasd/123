"""Compare prompts between matching and mismatching 4:3 edit generations."""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "posterforge.db"
conn = sqlite3.connect(str(DB))
c = conn.cursor()

# Get the mismatched and matching generations with prompts
targets = [
    # Mismatched (4:3 → 1:1)
    "57466cfc-2597-4d9e-932a-4ab84a4149c9",
    "513d6deb-0caa-4efe-bdcb-9408e77914be",
    # Matching (4:3 → 4:3)
    "9869bcca-6c41-4ca1-a00a-843a004a27d0",
    "edac1f50-a58c-4b45-820d-2f9e0be5bb9c",
]

for gen_id in targets:
    c.execute("SELECT id, params, prompt, reference_file_ids FROM generations WHERE id = ?", (gen_id,))
    r = c.fetchone()
    if not r:
        print(f"Gen {gen_id} not found")
        continue
    
    params = json.loads(r[1]) if r[1] else {}
    ref_ids = json.loads(r[3]) if r[3] else []
    
    print(f"\n{'='*80}")
    print(f"Gen: {gen_id[:16]}.. | Size: {params.get('size')} | Refs: {len(ref_ids)}")
    print(f"Prompt ({len(r[2])} chars):")
    print(r[2][:500])
    print("...")
    print(r[2][-300:])
    print()

conn.close()
