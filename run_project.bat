@echo off
chcp 65001 > nul
set PATH=D:\ai\aiclawopen\node;%PATH%
title PosterForge 一键启动脚本

echo ==================================================
echo 正在启动 PosterForge 后端服务 (FastAPI)...
echo ==================================================
start "PosterForge-Backend" cmd /k "set PATH=D:\ai\aiclawopen\node;%%PATH%% && cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo.
echo ==================================================
echo 正在启动 PosterForge 前端网页 (Vite)...
echo ==================================================
start "PosterForge-Frontend" cmd /k "set PATH=D:\ai\aiclawopen\node;%%PATH%% && cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173"

echo.
echo ==================================================
echo 启动完成！请访问以下链接：
echo 后端服务: http://127.0.0.1:8000/api/health
echo 前端网页: http://localhost:5173
echo ==================================================
pause
