"""Check actual output image dimensions for completed edit generations."""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "posterforge.db"
conn = sqlite3.connect(str(DB))
c = conn.cursor()

# Get recent completed edit generations with their output file paths
c.execute("""
    SELECT g.id, g.params, g.output_file_ids, g.created_at
    FROM generations g
    WHERE g.action = 'edit' AND g.status = 'completed'
    ORDER BY g.created_at DESC LIMIT 15
""")
generations = c.fetchall()

# Get file storage paths
c.execute("SELECT id, storage_path FROM files")
file_paths = {r[0]: r[1] for r in c.fetchall()}

conn.close()

try:
    from PIL import Image
    
    print("=== Output Image Dimensions (recent edit generations) ===")
    for gen_id, params_str, output_ids_str, created in generations:
        params = json.loads(params_str) if params_str else {}
        output_ids = json.loads(output_ids_str) if output_ids_str else []
        
        if not output_ids:
            continue
            
        file_id = output_ids[0]
        storage_path = file_paths.get(file_id)
        
        if not storage_path or not Path(storage_path).exists():
            print(f"  Gen {gen_id[:16]}.. | req_size={params.get('size')} | FILE NOT FOUND: {storage_path}")
            continue
            
        try:
            img = Image.open(storage_path)
            w, h = img.size
            ratio_actual = w / h
            req_size = params.get('size', '?')
            
            # Parse requested ratio
            if ':' in req_size:
                rw, rh = req_size.split(':')
                expected_ratio = int(rw) / int(rh)
            else:
                expected_ratio = None
            
            match = "OK" if expected_ratio and abs(ratio_actual - expected_ratio) < 0.15 else "MISMATCH"
            print(f"  Gen {gen_id[:16]}.. | req={req_size} | actual={w}x{h} (ratio={ratio_actual:.3f}) | expected_ratio={expected_ratio:.3f if expected_ratio else '?'} | {match}")
        except Exception as e:
            print(f"  Gen {gen_id[:16]}.. | req_size={params.get('size')} | ERROR: {e}")

except ImportError:
    print("Pillow not available. Checking file sizes instead.")
    for gen_id, params_str, output_ids_str, created in generations:
        params = json.loads(params_str) if params_str else {}
        output_ids = json.loads(output_ids_str) if output_ids_str else []
        
        if not output_ids:
            continue
            
        file_id = output_ids[0]
        storage_path = file_paths.get(file_id)
        
        if not storage_path or not Path(storage_path).exists():
            print(f"  Gen {gen_id[:16]}.. | req_size={params.get('size')} | FILE NOT FOUND")
            continue
            
        fsize = Path(storage_path).stat().st_size
        print(f"  Gen {gen_id[:16]}.. | req_size={params.get('size')} | file_size={fsize} | path={storage_path}")
