---
name: typescript-check
description: Run TypeScript type checking on a project and report errors
---

# TypeScript Type Checking Skill

## Purpose
Run TypeScript compilation checks on a project and provide clear error reporting. This skill automates the repeated pattern of running `npx tsc --noEmit` and interpreting the results.

## When to Use
- After making TypeScript code changes
- Before committing to ensure type safety
- When debugging type errors
- As part of code review process

## Inputs
- **project_path** (required): Path to the TypeScript project directory
- **tsconfig_path** (optional): Path to tsconfig.json (defaults to project root)
- **max_errors** (optional): Maximum number of errors to display (default: 30)

## Procedure

1. **Navigate to project directory**
   ```powershell
   cd <project_path>
   ```

2. **Run TypeScript compiler**
   ```powershell
   npx tsc --noEmit 2>&1
   ```

3. **Check exit code**
   ```powershell
   if ($LASTEXITCODE -eq 0) { 
       Write-Host "✓ TypeScript check passed" 
   } else { 
       Write-Host "✗ TypeScript check failed with exit code $LASTEXITCODE" 
   }
   ```

4. **Parse and format errors**
   - Extract error messages from compiler output
   - Group by file and error type
   - Provide actionable suggestions when possible

## Output Format
```
TypeScript Check Results:
✓ OR ✗ Status
📁 Project: <project_path>
📊 Errors: <count>
📝 Files with errors: <list>

Error Details:
1. <file>:<line> - <error_message>
2. ...
```

## Error Handling
- If `npx` is not found: suggest installing Node.js
- If `tsconfig.json` is missing: suggest creating one or specifying path
- If project directory doesn't exist: report clear error

## Examples

### Basic usage
```powershell
# Check PosterForge frontend
cd D:\ai\agent\agent合并\PosterForge-main\frontend
npx tsc --noEmit 2>&1
```

### With error limiting
```powershell
# Check with max 10 errors
npx tsc --noEmit 2>&1 | Select-Object -First 10
```

## Integration with PosterForge
This skill is particularly useful for PosterForge project which uses:
- Vite 5 + React 18 + TypeScript
- Strict TypeScript mode
- Multiple tsconfig files (frontend/backend)

## Related Commands
- `pnpm typecheck` (PosterForge frontend)
- `pnpm lint` (ESLint checking)
- `pnpm build` (Production build with type checking)