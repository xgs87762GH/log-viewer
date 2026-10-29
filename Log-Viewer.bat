@echo off
cd /d "%~dp0"
title Log Viewer
python manage.py
if errorlevel 1 pause
