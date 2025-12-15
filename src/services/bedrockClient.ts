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
  const isAlreadyArn = modelId.startsWith("arn:aws:bedrock:");

  if (isAlreadyArn) {
    // Validate that ARN region matches configured region
    const arnRegion = getRegionFromArn(modelId);
    if (arnRegion && arnRegion !== configuredRegion) {
      console.error(
        `\n[Bedrock OCR] ❌ REGION MISMATCH DETECTED:\n` +
        `  • Your AWS_REGION is set to: ${configuredRegion}\n` +
        `  • But your inference profile ARN is for region: ${arnRegion}\n` +
        `  • This WILL cause "model identifier invalid" errors.\n\n` +
        `SOLUTION: Change AWS_REGION in .env.local to match the ARN region:\n` +
        `  AWS_REGION=${arnRegion}\n\n` +
        `Or create new inference profiles in ${configuredRegion} and update your ARNs.\n`
      );
    }
    console.log("[Bedrock OCR] Using inference profile ARN:", modelId.substring(0, 80) + "...");
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
  let resolvedModelId: string | undefined;
  
  try {
    // Resolve model ID first (throws if missing)
    resolvedModelId = resolveModelId(options?.modelId);
    const maxTokens = options?.maxTokens ?? 6000;
    const temperature = options?.temperature ?? 0.2;

    const input = {
      modelId: resolvedModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);

    // Convert raw response into text (same pattern as bedrock-config.ts)
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
    const claudeText = responseBody?.content?.[0]?.text || "";
    
    // ---- Bedrock response diagnostics (safe to keep in dev) ----
    try {
      const stopReason =
        responseBody?.stop_reason ??
        responseBody?.stopReason ??
        responseBody?.stop_reason?.reason ??
        "unknown";
    
      const usage = responseBody?.usage ?? null;
    
      // Anthropic responses often have usage like:
      // { input_tokens, output_tokens } (names can vary)
      const inTok =
        usage?.input_tokens ??
        usage?.inputTokens ??
        usage?.input_token_count ??
        usage?.prompt_tokens ??
        null;
    
      const outTok =
        usage?.output_tokens ??
        usage?.outputTokens ??
        usage?.output_token_count ??
        usage?.completion_tokens ??
        null;
    
      const likelyTruncated =
        stopReason === "max_tokens" ||
        stopReason === "max_tokens_reached" ||
        // If token counts exist, being very close to your maxTokens is suspicious:
        (typeof outTok === "number" && typeof options?.maxTokens === "number"
          ? outTok >= Math.floor(options.maxTokens * 0.98)
          : false);
    
      console.log(
        `[Bedrock OCR] stop_reason=${stopReason}` +
          (inTok != null ? ` input_tokens=${inTok}` : "") +
          (outTok != null ? ` output_tokens=${outTok}` : "") +
          ` output_chars=${claudeText.length}` +
          (likelyTruncated ? " ⚠ likely_truncated" : "")
      );
    } catch {
      // do nothing; diagnostics should never break the request
    }
    
    return claudeText;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    
    // Include resolved model ID in validation error logs for debugging
    if (msg.includes("ValidationException")) {
      console.error("[Bedrock OCR] Validation error for model:", resolvedModelId || "unknown", error);
    }

    // Re-throw with context (matches bedrock-config.ts error handling)
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

    throw new Error("Bedrock extraction failed: " + msg);
  }
}

