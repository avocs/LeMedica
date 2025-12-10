// ============================================================================
// bedrock-config.ts
// HIPAA-Compliant Claude 3 Medical Processing (AWS Bedrock Runtime)
// ============================================================================

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// ---------------------------------------------------------------------------
// AWS Bedrock Client
// ---------------------------------------------------------------------------
export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || process.env.AWS_BEDROCK_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------
export const CLAUDE_SONNET_PROFILE_ARN = process.env.BEDROCK_PROFILE_ARN || "";
export const CLAUDE_OPUS_PROFILE_ARN = process.env.BEDROCK_OPUS_PROFILE_ARN || "";
export const CLAUDE_SONNET_MODEL_ID = "anthropic.claude-sonnet-4-5-20250929-v1:0";
export const CLAUDE_OPUS_MODEL_ID = "anthropic.claude-opus-4-20250514-v1:0";

// ---------------------------------------------------------------------------
// Request + Response Interfaces (Claude-level)
// ---------------------------------------------------------------------------
export interface MedicalRecordProcessingRequest {
  medicalRecord: string;
  recordType: "lab_report";
  deidentifiedData?: boolean;
  modelId?: string;
}

export interface MedicalRecordProcessingResponse {
  reportDate: string | null;
  confidence: number;
  categories: Array<{
    categoryName: string;
    confidence: number;
    tests: Array<{
      testName: string;
      value: string;
      unit: string;
      referenceLow: string;
      referenceHigh: string;
      status: string;
      confidence: number;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Final Unified Format for UI (post-processing)
// ---------------------------------------------------------------------------
export interface LabReportData {
  reportDate: string | null;
  confidence: number;
  categories: Array<{
    categoryName: string;
    confidence: number;
    tests: Array<{
      testName: string;
      value: string;
      unit: string;
      referenceLow: string;
      referenceHigh: string;
      status: "normal" | "high" | "low" | "critical";
      confidence: number;
    }>;
  }>;
}
// ---------------------------------------------------------------------------
// 🔒 De-identification function (HIPAA compliant)
// ---------------------------------------------------------------------------
export function deidentifyMedicalRecord(record: string): string {
  let deidentified = record;

  const phiPatterns = [
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,                                  // names
    /\b\d{3}-\d{2}-\d{4}\b/g,                                        // SSN
    /\b\d{3}-\d{3}-\d{4}\b/g,                                        // phone
    /\b\(\d{3}\)\s*\d{3}-\d{4}\b/g,                                  // phone alt
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,          // email
    /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/g,
    /\bMRN\s*:?\s*\d+/gi,                                            // MRN
    /\bPatient\s*ID\s*:?\s*\d+/gi,                                   // ID
    /\b(?:DOB|Date of Birth|Birth Date|Patient.*Birth)\s*:?\s*\d{1,2}\/\d{1,2}\/\d{4}\b/gi // DOB
  ];

  phiPatterns.forEach(pattern => {
    deidentified = deidentified.replace(pattern, "[REDACTED]");
  });

  return deidentified;
}

// ---------------------------------------------------------------------------
// PROMPT BUILDER (Lab reports only)
// ---------------------------------------------------------------------------
export function createMedicalProcessingPrompt(record: string): string {
  // Lab report: strict JSON with reportDate + categories
  return `You are a medical lab data processor. Extract lab test results from the medical report and return a clean JSON object with categorized tests.

IMPORTANT GUIDELINES:
1. Maintain HIPAA compliance - do not extract or infer any personally identifiable information
2. Focus on medical data, test results, and clinical information
3. Be precise with numerical values and units
4. Flag any abnormal or critical values clearly
5. Provide confidence scores for your extractions
6. If information is not available, use null or empty arrays/objects
7. Ensure all extracted data is medically accurate and clinically relevant

CRITICAL: Return ONLY the JSON object. No markdown, no backticks, no explanations. Start with { and end with }.

REQUIRED JSON STRUCTURE:
{
  "reportDate": "YYYY-MM-DD format if found, otherwise null",
  "confidence": 0.95,
  "categories": [
    {
      "categoryName": "Complete Blood Count",
      "confidence": 0.9,
      "tests": [
        {
          "testName": "White Blood Cells",
          "value": "7.2",
          "unit": "K/uL",
          "referenceLow": "4.5",
          "referenceHigh": "11.0",
          "status": "normal",
          "confidence": 0.9
        }
      ]
    }
  ]
}
RULES:
DATE EXTRACTION RULES:
- Look for lab report date, test date, collection date, reported date, specimen date, received date
- Common date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD, YYYY, DD-MMM-YYYY, YYYY/MM/DD
- If multiple dates found, use the most recent test/collection/specimen date
- Return null if no date found
- Format as YYYY-MM-DD (e.g., "2024-01-15")

CATEGORY RULES:
- Create categories dynamically as needed (CBC, Lipid Panel, Liver Function, Kidney Function, Blood Sugar, Thyroid Function, Electrolytes, Vitamins & Minerals, Hormones, CRP/ESR, Autoimmune markers, Urinalysis, Infection panels, Tumor markers, Cardiac markers, Coagulation studies, Toxicology, Genetic tests, others)
- Do not place unrelated tests together
- Always categorize every test

STATUS RULES:
- Status must be one of: normal, high, low, critical
- If above referenceHigh → "high"
- If below referenceLow → "low"
- If extremely abnormal → "critical"
- Otherwise → "normal"

VALUE RULES:
- Use exact numeric values from the report
- Use standardized units (K/uL instead of X10^9/L, mg/dL instead of complex notation)
- Common unit conversions:
  * White Blood Cells: "K/uL"
  * Red Blood Cells: "M/uL"
  * Hemoglobin: "g/dL"
  * Platelets: "K/uL"
  * Cholesterol: mg/dL or mmol/L
  * Glucose: mg/dL or mmol/L
  * Liver enzymes: U/L
  * Creatinine: mg/dL or μmol/L
- Use "N/A" for missing values
- Round numeric values to 1 decimal place

STATUS RULES:
- Status MUST be: normal, high, low, critical
- If above referenceHigh → "high"
- If below referenceLow → "low"
- If extremely abnormal → "critical"
- Otherwise → "normal"

Lab Report Text:
${record}

CRITICAL: Return ONLY the JSON object. No markdown, no backticks, no explanations. Start with { and end with }.`;
}

// ---------------------------------------------------------------------------
// CLAUDE INVOCATION
// ---------------------------------------------------------------------------
// Main processing function using Claude Sonnet 4.5 (with Opus 4 fallback for complex cases)
export async function processMedicalRecordWithClaude(
  request: MedicalRecordProcessingRequest
): Promise<MedicalRecordProcessingResponse> {
  try {
    // 🔒 ALWAYS de-identify if requested
    const safeRecord = request.deidentifiedData
      ? deidentifyMedicalRecord(request.medicalRecord)
      : request.medicalRecord;

    // 🔍 Complexity detection MUST use the deidentified version
    const recordForDetection = safeRecord.toLowerCase();

    // Create the prompt
    const prompt = createMedicalProcessingPrompt(safeRecord);

    // Decide model
    let modelId = request.modelId || CLAUDE_SONNET_MODEL_ID;
    let maxTokens = 4000;
    let temperature = 0.1;

    // Detect complex mode based on SAFE text (HIPAA-safe)
    const isComplexCase =
      !request.modelId &&
      (
        safeRecord.length > 10000 ||
        recordForDetection.includes("complex") ||
        recordForDetection.includes("multiple") ||
        recordForDetection.includes("abnormal")
      );

    if (isComplexCase) {
      modelId = CLAUDE_OPUS_MODEL_ID;
      maxTokens = 8000;
      temperature = 0.05;
      console.log("🏥 Using Claude Opus 4 for complex medical case");
    } else {
      console.log("🏥 Using model for medical processing:", modelId);
    }

    // Resolve inference profile ARN
    const resolvedModelId =
      modelId === CLAUDE_SONNET_MODEL_ID && CLAUDE_SONNET_PROFILE_ARN
        ? CLAUDE_SONNET_PROFILE_ARN
        : modelId === CLAUDE_OPUS_MODEL_ID && CLAUDE_OPUS_PROFILE_ARN
          ? CLAUDE_OPUS_PROFILE_ARN
          : modelId;

    const input = {
      modelId: resolvedModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [{ role: "user", content: prompt }]
      })
    };

    // Invoke model
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);

    // Convert raw response into text
    const rawText = await (async () => {
      const body: any = (response as any).body;
      if (typeof body?.transformToByteArray === "function") {
        return new TextDecoder().decode(await body.transformToByteArray());
      }
      if (body instanceof Uint8Array) {
        return new TextDecoder().decode(body);
      }
      return String(body ?? "");
    })();

    const responseBody = JSON.parse(rawText || "{}");
    const claudeResponse = responseBody?.content?.[0]?.text || "";

    // Strip markdown
    let cleaned = claudeResponse.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();


    // Parse JSON (lab_report must provide categories JSON)
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("Failed JSON:", cleaned.substring(0, 500));
      throw new Error("Invalid JSON response from Claude");
    }

    // Lab report required structure
    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      throw new Error("Invalid lab report JSON: missing categories");
    }
    return {
      reportDate: parsed.reportDate ?? null,
      confidence: parsed.confidence ?? 0.95,
      categories: parsed.categories
    };
  } catch (error) {
    console.error("Error processing medical record with Claude:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (msg.includes("UnrecognizedClientException") || msg.includes("InvalidSignatureException")) {
      throw new Error("AWS Bedrock authentication failed.");
    }
    if (msg.includes("ValidationException")) {
      throw new Error("AWS Bedrock validation error: " + msg);
    }
    if (msg.includes("ModelNotReadyException") || msg.includes("ThrottlingException")) {
      throw new Error("AWS Bedrock temporarily unavailable.");
    }
    if (msg.includes("AccessDeniedException")) {
      throw new Error("Permission denied for AWS Bedrock.");
    }

    throw new Error("Medical record processing failed: " + msg);
  }
}
