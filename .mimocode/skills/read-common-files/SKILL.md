---
name: read-common-files
description: Read frequently accessed project files with caching awareness
---

# Read Common Files Skill

## Purpose
Read frequently accessed project files efficiently, avoiding redundant reads of the same content. This skill helps identify and read commonly needed files in a project.

## When to Use
- Starting work on a new feature
- Debugging issues that involve multiple files
- Code review across related files
- Understanding project structure

## Inputs
- **project_path** (required): Root directory of the project
- **file_pattern** (optional): Specific files to read (e.g., "config", "routes")
- **max_files** (optional): Maximum files to read (default: 10)

## Procedure

1. **Identify common file types**
   - Configuration files: `*.json`, `*.yaml`, `*.env*`
   - Entry points: `index.ts`, `main.py`, `app.py`
   - Routes/API: `route.ts`, `routes.py`, `api/`
   - Types/Models: `types.ts`, `models.py`, `schemas.py`
   - Tests: `*.test.ts`, `test_*.py`

2. **Check file modification times**
   - Read files modified recently first
   - Skip files unchanged since last read

3. **Read files with context**
   - Include surrounding lines for context
   - Highlight important sections

4. **Cache results**
   - Store file hashes to avoid re-reading unchanged files
   - Provide quick access to previously read content

## Output Format
```
Project Files Summary:
📁 Project: <project_path>
📊 Files read: <count>
📝 Key files:

1. <filename> (<lines> lines)
   - Purpose: <brief description>
   - Key exports: <list>

2. ...
```

## PosterForge Common Files
For PosterForge project, these files are frequently accessed:

### Frontend
- `frontend/src/app/layout.tsx` - Root layout
- `frontend/src/app/page.tsx` - Main page
- `frontend/src/features/generation/*` - Generation feature
- `frontend/src/lib/api.ts` - API client
- `frontend/src/components/ui/*` - UI components

### Backend
- `backend/app/main.py` - FastAPI app
- `backend/app/config.py` - Configuration
- `backend/app/models.py` - Database models
- `backend/app/schemas.py` - Pydantic schemas
- `backend/app/routers/*` - API routes

### Configuration
- `package.json` - Frontend dependencies
- `pyproject.toml` - Backend dependencies
- `tsconfig.json` - TypeScript config
- `.env.example` - Environment variables

## Error Handling
- If file doesn't exist: suggest checking path
- If file is too large: read only key sections
- If permission denied: report clear error

## Optimization Tips
1. **Use grep for specific content** instead of reading entire files
2. **Check file size** before reading large files
3. **Read only necessary sections** using offset/limit
4. **Cache frequently accessed files** in memory

## Integration with Other Skills
- Use with `typescript-check` to read error locations
- Use with `start-posterforge` to understand project structure
- Use with debugging workflows to trace issues

## Examples

### Read all config files
```powershell
Get-ChildItem -Path "D:\ai\agent\agent合并\PosterForge-main" -Filter "*.json" -Recurse | Select-Object -First 5
```

### Read recent changes
```powershell
Get-ChildItem -Path "D:\ai\agent\agent合并\PosterForge-main" -Recurse | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-1) } | Select-Object -First 10
```

### Read specific feature files
```powershell
Get-ChildItem -Path "D:\ai\agent\agent合并\PosterForge-main\frontend\src\features\generation" -Filter "*.tsx" | Select-Object -First 5
```