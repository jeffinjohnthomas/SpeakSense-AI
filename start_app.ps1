Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      Starting Sent-AI Environment       " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Checking/Installing Backend Dependencies..." -ForegroundColor Green
Push-Location backend
# Use the python executable that is currently active, or default to python
python -m pip install -r requirements.txt
Pop-Location

Write-Host "[2/4] Checking/Installing Frontend Dependencies..." -ForegroundColor Blue
Push-Location frontend
npm install
Pop-Location

Write-Host "[3/4] Starting FastAPI Backend (Port 8000)..." -ForegroundColor Green
Start-Process -FilePath "python" -ArgumentList "-m uvicorn main:app --reload --host 0.0.0.0 --port 8000" -WorkingDirectory ".\backend"

Write-Host "[4/4] Starting Next.js Frontend (Port 3000)..." -ForegroundColor Blue
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory ".\frontend"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🚀 All services launched in separate windows!" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend API: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan
