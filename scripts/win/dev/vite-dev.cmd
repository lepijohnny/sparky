@echo off
set PATH=%~dp0..\..\..\.node\aliases\default;%PATH%
cd /d %~dp0..\..\..\app
pnpm run dev
