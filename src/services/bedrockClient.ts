import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  bedrockClient,
  CLAUDE_OPUS_MODEL_ID,
  CLAUDE_SONNET_MODEL_ID,
  CLAUDE_OPUS_PROFILE_ARN,
  CLAUDE_SONNET_PROFILE_ARN,
} from "../../data/references/bedrock-config/bedrock-config";

/**
 * Default model ID resolution (matches bedrock-config.ts pattern)
 * Falls back to CLAUDE_SONNET_MODEL_ID if no env var is set
 */
const DEFAULT_MODEL_ID =
  process.env.BEDROCK_LIGHT_MODEL_ID ||
  process.env.BEDROCK_MODEL_ID ||
  CLAUDE_SONNET_MODEL_ID;

/**
 * Extracts region from an AWS ARN or returns the configured region
 */
function getRegionFromArn(arn: string): string | null {
  const match = arn.match(/arn:aws:bedrock:([^:]+):/);
  return match ? match[1] : null;
}


/**
 * resolveModelId
 * --------------
 * Resolves the model identifier, applying inference profile ARN mapping
 * when appropriate. Matches the pattern used in processMedicalRecordWithClaude.
 * 
 * If DEFAULT_MODEL_ID is already an ARN, it will be used directly.
 * If it's a plain model ID, it will be mapped to a profile ARN if available.
 */
function resolveModelId(preferred?: string): string {
  const configuredRegion = process.env.AWS_REGION || process.env.AWS_BEDROCK_REGION || "us-east-1";
  let modelId = preferred || DEFAULT_MODEL_ID;

  // If DEFAULT_MODEL_ID is already an ARN (starts with "arn:aws:bedrock:"), use it directly
  if (modelId.startsWith("arn:aws:bedrock:")) {
    const arnRegion = getRegionFromArn(modelId);
    if (arnRegion && arnRegion !== configuredRegion) {
      console.error(
        `[Bedrock OCR] REGION MISMATCH: AWS_REGION=${configuredRegion}, ARN region=${arnRegion}`
      );
    }
    console.log("[Bedrock OCR] Using model:", modelId);
    return modelId;
  }

  // Map plain model ID → inference profile ARN when appropriate (same logic as bedrock-config.ts)
  const resolvedModelId =
    modelId === CLAUDE_SONNET_MODEL_ID && CLAUDE_SONNET_PROFILE_ARN
      ? CLAUDE_SONNET_PROFILE_ARN
      : modelId === CLAUDE_OPUS_MODEL_ID && CLAUDE_OPUS_PROFILE_ARN
      ? CLAUDE_OPUS_PROFILE_ARN
      : modelId;

  // If resolved to an ARN, check region match
  if (resolvedModelId.startsWith("arn:aws:bedrock:")) {
    const arnRegion = getRegionFromArn(resolvedModelId);
    if (arnRegion && arnRegion !== configuredRegion) {
      console.error(
        `\n[Bedrock OCR] ❌ REGION MISMATCH DETECTED:\n` +
        `  • Your AWS_REGION is set to: ${configuredRegion}\n` +
        `  • But your profile ARN (from BEDROCK_PROFILE_ARN) is for region: ${arnRegion}\n` +
        `  • This WILL cause "model identifier invalid" errors.\n\n` +
        `SOLUTION: Change AWS_REGION in .env.local to match the ARN region:\n` +
        `  AWS_REGION=${arnRegion}\n\n` +
        `Or create new inference profiles in ${configuredRegion} and update your ARNs.\n`
      );
    }
  }

  if (!resolvedModelId || resolvedModelId.trim() === "") {
    throw new Error(
      "No Bedrock model configured. Set BEDROCK_LIGHT_MODEL_ID or BEDROCK_MODEL_ID in .env.local."
    );
  }

  console.log("[Bedrock OCR] Using model:", resolvedModelId);
  return resolvedModelId;
}

/**
 * callBedrockForExtraction
 * ------------------------
 * Invokes Claude on AWS Bedrock with the provided prompt and returns
 * the plain-text response body. Uses the shared bedrockClient from
 * bedrock-config.ts to ensure region and credentials match the working
 * medical records processing code.
 *
 * Matches the Anthropic payload format and model resolution pattern
 * from processMedicalRecordWithClaude.
 */
export async function callBedrockForExtraction(
  prompt: string,
  options?: { modelId?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const resolvedModelId = resolveModelId(options?.modelId);
  const maxTokens = options?.maxTokens ?? 3000;
  const temperature = options?.temperature ?? 0.1;
  const isNova = resolvedModelId.toLowerCase().includes("nova");

  const bodyPayload = isNova
    ? {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }], // ✅ correct format
          },
        ],
        inferenceConfig: { maxTokens, temperature },
      }
    : {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "user", content: [{ type: "text", text: prompt }] },
        ],
      };

  const command = new InvokeModelCommand({
    modelId: resolvedModelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(bodyPayload),
  });

  const response = await bedrockClient.send(command);

  // ---- Log full SDK metadata for debugging ----
  console.log("[Bedrock OCR] Full SDK Response Metadata:", response.$metadata);

  // ---- Decode the body ----
  const rawText = await (async () => {
    const body: any = response.body;
    if (typeof body?.transformToByteArray === "function") {
      return new TextDecoder().decode(await body.transformToByteArray());
    }
    if (body instanceof Uint8Array) {
      return new TextDecoder().decode(body);
    }
    return String(body ?? "");
  })();

  // ---- Parse model output JSON ----
  const responseBody = JSON.parse(rawText || "{}");

  // ---- Extract text from Nova message content ----
  const extractedText =
    responseBody?.output?.message?.content
      ?.map((c: any) => c.text || "")
      .filter(Boolean)
      .join("\n") || "";

  // ---- Log diagnostic info ----
  const stopReason = responseBody?.stopReason ?? "unknown";
  const usage = responseBody?.usage ?? {};
  const inTok = usage?.inputTokens ?? null;
  const outTok = usage?.outputTokens ?? null;

  console.log(
    `[Bedrock OCR] stop_reason=${stopReason}` +
      (inTok != null ? ` input_tokens=${inTok}` : "") +
      (outTok != null ? ` output_tokens=${outTok}` : "") +
      ` output_chars=${extractedText.length}`
  );

  return extractedText;
}
