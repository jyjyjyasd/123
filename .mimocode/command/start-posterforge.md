---
description: Start PosterForge development environment (frontend + backend)
---

# Start PosterForge Development Environment

## Purpose
Start both frontend and backend development servers for PosterForge project. This command automates the repeated pattern of starting two separate processes.

## When to Use
- Starting development session
- After pulling new changes
- When backend or frontend needs restart
- For LAN demonstration

## Inputs
- **mode** (optional): "full" (default) or "frontend-only" or "backend-only"
- **port_frontend** (optional): Frontend port (default: 5173)
- **port_backend** (optional): Backend port (default: 8000)

## Procedure

### Option 1: Full Start (Recommended)
```powershell
# Start backend in new terminal
Start-Process -FilePath powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'D:\ai\agent\agent合并\PosterForge-main\backend'; & 'C:\Users\Fu\.local\bin\uv.exe' run alembic upgrade head; & 'C:\Users\Fu\.local\bin\uv.exe' run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# Start frontend in new terminal
Start-Process -FilePath powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'D:\ai\agent\agent合并\PosterForge-main\frontend'; npx pnpm dev --host 0.0.0.0 --port 5173"
```

### Option 2: Frontend Only
```powershell
Start-Process -FilePath powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'D:\ai\agent\agent合并\PosterForge-main\frontend'; npx pnpm dev --host 0.0.0.0 --port 5173"
```

### Option 3: Backend Only
```powershell
Start-Process -FilePath powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'D:\ai\agent\agent合并\PosterForge-main\backend'; & 'C:\Users\Fu\.local\bin\uv.exe' run alembic upgrade head; & 'C:\Users\Fu\.local\bin\uv.exe' run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
```

## Output Format
```
Starting PosterForge Development Environment:
✓ Backend starting on http://127.0.0.1:8000
✓ Frontend starting on http://0.0.0.0:5173
🌐 LAN URL: http://<your-ip>:5173
📡 API Proxy: /api → http://127.0.0.1:8000
```

## Verification Steps
1. Check if processes are running:
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*python*"}
   ```

2. Test backend health:
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing
   ```

3. Test frontend:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing
   ```

## Error Handling
- If port already in use: suggest killing existing process
- If uv not found: suggest installing with `pip install uv`
- If pnpm not found: suggest installing with `npm install -g pnpm`

## Integration with PosterForge
This command follows PosterForge architecture:
- Backend: FastAPI on 127.0.0.1:8000 (LAN inaccessible)
- Frontend: Vite on 0.0.0.0:5173 (LAN accessible)
- API proxy: Vite dev server proxies /api to backend
- Database: SQLite with WAL mode

## Related Skills
- `typescript-check`: For type checking after changes
- `run-tests`: For running pytest and other tests