// src/app/api/admin/clinic-menus/bulk-import-packages/route.ts
// MOCK ENDPOINT 

import { NextResponse } from "next/server";

/**
 * Mock bulk import route
 * ----------------------
 * Accepts a CSV upload via FormData
 * Confirms receipt without processing
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // Try reading the uploaded file
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, message: "No file uploaded. Expected 'file' field." },
        { status: 400 }
      );
    }

    // Convert to buffer just to verify it's readable
    const buffer = Buffer.from(await file.arrayBuffer());

    console.log("\n[Mock Bulk Import] Received CSV upload:");
    console.log("  filename:", file.name);
    console.log("  type:", file.type);
    console.log("  size:", buffer.length, "bytes\n");

    return NextResponse.json({
      ok: true,
      message: "CSV successfully received by mock importer.",
      fileName: file.name,
      size: buffer.length,
      mimeType: file.type
    });
  } catch (err) {
    console.error("[Mock Bulk Import Error]", err);
    return NextResponse.json(
      { ok: false, message: "Failed to receive CSV file." },
      { status: 500 }
    );
  }
}
