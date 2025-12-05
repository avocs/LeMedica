# ============================================
# Clinic Menu OCR → CSV Test Runner (Batch-ID)
# Uses backend-generated batch IDs for file names
# ============================================

$ROOT    = "C:\Users\User\Documents\side quest\LeMedica"
$MENU    = "$ROOT\test_menu_1"
$OCR_OUT = "$ROOT\ocr_outputs"
$CSV_OUT = "$ROOT\csv_outputs"

Write-Host "Preparing folders..."
mkdir $OCR_OUT -ErrorAction SilentlyContinue
mkdir $CSV_OUT -ErrorAction SilentlyContinue

# 1) Run OCR for each file – backend will write batch_*.json
Write-Host "Running OCR for each menu file..."
Get-ChildItem -Path $MENU -File | ForEach-Object {
    $file = $_.FullName
    Write-Host ">>> OCR: $file"

    # No -o here – let the backend save its own JSON snapshot
    curl.exe -X POST http://localhost:3000/api/ocr-menus `
        -F "file=@$file" | Out-Null
}

# 2) For each batch_*.json produced, regenerate CSV with matching name
Write-Host "Regenerating CSVs from OCR snapshots..."
Get-ChildItem -Path $OCR_OUT -Filter "b_*.json" | ForEach-Object {
    $batchJson  = $_.FullName
    $batchName  = $_.BaseName   # e.g. b_20251205_111900_amgv
    $csvTarget  = "$CSV_OUT\$batchName.csv"

    Write-Host ">>> CSV for $batchName → $csvTarget"

    curl.exe -X POST http://localhost:3000/api/ocr-menus/regenerate-csv `
        -H "Content-Type: application/json" `
        -d "@$batchJson" `
        -o "$csvTarget"
}

Write-Host "[!! NOTICE] ALL TESTS DONE"
