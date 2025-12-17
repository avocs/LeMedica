# Clinic Menu OCR-to-CSV Admin Tool
## Introduction 
This project is a Next.js 14 + TypeScript app using Tailwind CSS, shadcn/ui, and a custom Clinic Menu OCR → CSV admin tool.

## Quick Links 
[Architecture](#Architecture) \
[Local Start Guide](#Local-Start-Guide) \
[UI/UX Preview](#UIUX) \
[Pending Issues](#Pending-Issues) 

## Architecture
Refer to `ARCHITECTURE.md`
Prompt to Claude called in `src\services\aiExtractor.ts`

### Prerequisites
- **Node.js** ≥ 18 (20.x recommended)
- **npm** ≥ 9  
- **git**

## Local Start Guide 
### 1. Clone the repository

```bash
git clone <REPO-URL> lemedica
cd lemedica
```
### 2. Install dependencies
`npm install`

This pulls in:
- next, react, react-dom
- tailwindcss, @tailwindcss/postcss, postcss, autoprefixer
- lucide-react, class-variance-authority, tailwind-merge
- Radix primitives (e.g. @radix-ui/react-toast, @radix-ui/react-dialog, etc.)
- Any other UI / OCR / AWS / Bedrock dependencies defined in package.json
- If you’ve just pulled the repo and something is missing, run npm install again after updating package.json.

### 3. Environment variables
- Create file at project root `cp .env.local`
```bash

    # Optional override for forwarding CSV to the existing bulk importer.
    # If not set, the app will fall back to:
    #   http://localhost:3000/api/admin/bulk-import-packages
    BULK_IMPORT_ENDPOINT=

    # Any AWS / Bedrock credentials your backend needs.
    # (Adjust names to match your existing backend code.)
    AWS_REGION=ap-southeast-1
    AWS_ACCESS_KEY_ID=your-key
    AWS_SECRET_ACCESS_KEY=your-secret
    BEDROCK_MODEL_ID=your-model-id

    # current setting limits 
    OCR_MAX_FILE_MB=25
    APP_BASE_URL=http://localhost:3000
    OCR_LANGS=eng+chi_sim
    OCR_TESS_TIMEOUT_MS=150000
    OCR_DEBUG=1

``` 
### 4. Start the dev server
From project root: `npm run dev`
By default, Next.js runs on:
http://localhost:3000
The OCR admin page lives at:
http://localhost:3000/admin/clinic-menus/ocr

## UI/UX
As of now, the preview of UI/UX is as the pictures below: 
![upload](data/images/upld-panel.png)
![summary](data/images/summary-panel.png)
![extracted](data/images/extr-pkg-panel.png)
![debug](data/images/debug-act-panel.png)
Saves to a csv: 
![csvout](data/images/csv-output.png)


## Pending Issues: 
1. Dense Menu Recognition:
    - **Current Scenario**: (see Wellness-Clinic-Menu-1 under `tests/test_menus`) OCR manages to extract all text from the clear pdf, however descriptions are very dense with ingredients+details, no clear border on when a package starts and stops, so extraction doesn't see it as a package.   
    - **What has been tried**: Specified to prompt to extract "n packages if n currency signs are available", did not work, plus will cause conflicts if the menu uses characters like 万/W without a currency sign preceding the price label.
    - **Potential solutions**: Pre-processing the extracted text to split via currency/number tags? but can get confusing as filtering by raw text ignores context of the number (eg. the number could mean "duration" or "phone number", not just "price")

2. Chinese Recognition: 
    - **Current Scenario**: (see the various chinese menus) OCR gives bad extracted results when aesthetic/small fonts are used in the menu. Sometimes gives pure gibberish and thus unable to infer any packages from the text. 
    - **What has been tried**: Preprocessing the image before sending to OCR, ie. setting to grayscale, only slightly helped. tried changing `TESS_OEM` (variable under `src/services/ocrProcessor.ts`) to change page segmentation modes, to not much improvement, could try fine tuning in this direction.

3. Fuzzy Text Recognition:
    - **Current Scenario**: Like point 2, OCR gives bad extracted results when blurry input is given. can still infer relatively better, but quality of extraction suffers.
    - **What has been tried**: Preprocessing image as explained above.

