"use client"

import { useState } from "react"
import { Bug, ChevronDown, ChevronUp, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import type { OcrMenusResponse } from "@/lib/types/ocr"

interface DebugPanelProps {
  lastResponse: OcrMenusResponse | null
  lastError: { message: string; status?: number; data?: unknown } | null
  requestDuration: number | null
}

export function DebugPanel({ lastResponse, lastError, requestDuration }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const data = lastError || lastResponse
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className="border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-lg font-semibold">Debug Info</CardTitle>
                {lastError && (
                  <Badge variant="destructive" className="text-xs">
                    Error
                  </Badge>
                )}
                {requestDuration !== null && (
                  <Badge variant="outline" className="text-xs">
                    {(requestDuration / 1000).toFixed(2)}s
                  </Badge>
                )}
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {lastResponse && (
                <>
                  <Badge variant="outline">Status: {lastResponse.success ? "Success" : "Failed"}</Badge>
                  <Badge variant="outline" className="font-mono">
                    Batch: {lastResponse.batch_id}
                  </Badge>
                  <Badge variant="outline">Files: {lastResponse.files.length}</Badge>
                  <Badge variant="outline">Packages: {lastResponse.packages.length}</Badge>
                </>
              )}
              {lastError && <Badge variant="destructive">HTTP {lastError.status || "Error"}</Badge>}
            </div>

            {/* Raw response/error */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{lastError ? "Error Response" : "Last API Response"}</p>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <pre className="text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap break-all">
                  {lastError
                    ? JSON.stringify(lastError, null, 2)
                    : lastResponse
                      ? JSON.stringify(
                          {
                            success: lastResponse.success,
                            batch_id: lastResponse.batch_id,
                            files_count: lastResponse.files.length,
                            packages_count: lastResponse.packages.length,
                            summary: lastResponse.summary,
                          },
                          null,
                          2,
                        )
                      : "No response yet"}
                </pre>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
