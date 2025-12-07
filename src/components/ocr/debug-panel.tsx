// "use client"

// import { useState } from "react"
// import { Bug, ChevronDown, ChevronUp, Copy, Check } from "lucide-react"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
// import { Badge } from "@/components/ui/badge"
// import type { OcrMenusResponse } from "@/lib/types/ocr"

// interface DebugPanelProps {
//   lastResponse: OcrMenusResponse | null
//   lastError: { message: string; status?: number; data?: unknown } | null
//   requestDuration: number | null
// }

// export function DebugPanel({ lastResponse, lastError, requestDuration }: DebugPanelProps) {
//   const [isOpen, setIsOpen] = useState(false)
//   const [copied, setCopied] = useState(false)

//   const handleCopy = () => {
//     const data = lastError || lastResponse
//     if (data) {
//       navigator.clipboard.writeText(JSON.stringify(data, null, 2))
//       setCopied(true)
//       setTimeout(() => setCopied(false), 2000)
//     }
//   }

//   return (
//     <Card className="border-border">
//       <Collapsible open={isOpen} onOpenChange={setIsOpen}>
//         <CardHeader className="pb-3">
//           <CollapsibleTrigger asChild>
//             <Button variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent">
//               <div className="flex items-center gap-2">
//                 <Bug className="h-4 w-4 text-muted-foreground" />
//                 <CardTitle className="text-lg font-semibold">Debug Info</CardTitle>
//                 {lastError && (
//                   <Badge variant="destructive" className="text-xs">
//                     Error
//                   </Badge>
//                 )}
//                 {requestDuration !== null && (
//                   <Badge variant="outline" className="text-xs">
//                     {(requestDuration / 1000).toFixed(2)}s
//                   </Badge>
//                 )}
//               </div>
//               {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
//             </Button>
//           </CollapsibleTrigger>
//         </CardHeader>
//         <CollapsibleContent>
//           <CardContent className="space-y-3">
//             {/* Status badges */}
//             <div className="flex flex-wrap gap-2">
//               {lastResponse && (
//                 <>
//                   <Badge variant="outline">Status: {lastResponse.success ? "Success" : "Failed"}</Badge>
//                   <Badge variant="outline" className="font-mono">
//                     Batch: {lastResponse.batch_id}
//                   </Badge>
//                   <Badge variant="outline">Files: {lastResponse.files.length}</Badge>
//                   <Badge variant="outline">Packages: {lastResponse.packages.length}</Badge>
//                 </>
//               )}
//               {lastError && <Badge variant="destructive">HTTP {lastError.status || "Error"}</Badge>}
//             </div>

//             {/* Raw response/error */}
//             <div className="space-y-2">
//               <div className="flex items-center justify-between">
//                 <p className="text-sm font-medium">{lastError ? "Error Response" : "Last API Response"}</p>
//                 <Button variant="ghost" size="sm" onClick={handleCopy}>
//                   {copied ? (
//                     <>
//                       <Check className="h-3 w-3 mr-1" />
//                       Copied
//                     </>
//                   ) : (
//                     <>
//                       <Copy className="h-3 w-3 mr-1" />
//                       Copy
//                     </>
//                   )}
//                 </Button>
//               </div>
//               <div className="rounded-md border bg-muted/30 p-3">
//                 <pre className="text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap break-all">
//                   {lastError
//                     ? JSON.stringify(lastError, null, 2)
//                     : lastResponse
//                       ? JSON.stringify(
//                           {
//                             success: lastResponse.success,
//                             batch_id: lastResponse.batch_id,
//                             files_count: lastResponse.files.length,
//                             packages_count: lastResponse.packages.length,
//                             summary: lastResponse.summary,
//                           },
//                           null,
//                           2,
//                         )
//                       : "No response yet"}
//                 </pre>
//               </div>
//             </div>
//           </CardContent>
//         </CollapsibleContent>
//       </Collapsible>
//     </Card>
//   )
// }

// src/components/ocr/debug-panel.tsx
"use client"

import { useState, useMemo } from "react"
import {
  Bug,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Code,
  Download,
  Edit3,
  AlertCircle,
  FileText,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { OcrMenusResponse, PackageRow } from "@/lib/types/ocr"

interface DebugPanelProps {
  packages: PackageRow[]
  batchId: string | null
  lastResponse: OcrMenusResponse | null
  lastError: { message: string; status?: number; data?: unknown } | null
  requestDuration: number | null
  onApplyJson: (packages: PackageRow[]) => void
}

type DebugTextFile = {
  name: string
  content: string
}

export function DebugPanel({
  packages,
  batchId,
  lastResponse,
  lastError,
  requestDuration,
  onApplyJson,
}: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // JSON editor state
  const [isJsonEditing, setIsJsonEditing] = useState(false)
  const [editedJson, setEditedJson] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)

  // Raw OCR debug text state
  const [debugFiles, setDebugFiles] = useState<DebugTextFile[]>([])
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugError, setDebugError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const jsonString = useMemo(() => JSON.stringify(packages, null, 2), [packages])

  const handleCopy = () => {
    const data = lastError || lastResponse
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleStartEditJson = () => {
    setEditedJson(jsonString)
    setParseError(null)
    setIsJsonEditing(true)
  }

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(editedJson)
      if (!Array.isArray(parsed)) {
        throw new Error("JSON must be an array of packages")
      }
      const packagesWithIds = parsed.map((pkg: PackageRow, index: number) => ({
        ...pkg,
        id: pkg.id || `pkg_edited_${Date.now()}_${index}`,
      }))
      onApplyJson(packagesWithIds)
      setIsJsonEditing(false)
      setParseError(null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON")
    }
  }

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `clinic-menu-packages-${batchId || "export"}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleLoadRawDebug = async () => {
    if (!batchId) {
      setDebugError("No batch ID available yet")
      return
    }

    setDebugLoading(true)
    setDebugError(null)

    try {
      const res = await fetch(`/api/ocr-menus/debug-text?batchId=${encodeURIComponent(batchId)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || `Failed to load debug text (${res.status})`)
      }
      const data = (await res.json()) as { files: DebugTextFile[] }
      setDebugFiles(data.files || [])
      if (data.files && data.files.length > 0) {
        setSelectedFileName(data.files[0].name)
      } else {
        setSelectedFileName(null)
      }
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : "Failed to load OCR debug text")
      setDebugFiles([])
      setSelectedFileName(null)
    } finally {
      setDebugLoading(false)
    }
  }

  const selectedFile = useMemo(
    () => debugFiles.find((f) => f.name === selectedFileName) || null,
    [debugFiles, selectedFileName],
  )

  return (
    <>
      <Card className="border-border">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Debug Tools</CardTitle>
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
                  {batchId && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {batchId}
                    </Badge>
                  )}
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                {lastResponse && (
                  <>
                    <Badge variant="outline">Status: {lastResponse.success ? "Success" : "Failed"}</Badge>
                    <Badge variant="outline" className="font-mono">
                      Files: {lastResponse.files.length}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      Packages: {lastResponse.packages.length}
                    </Badge>
                  </>
                )}
                {lastError && <Badge variant="destructive">HTTP {lastError.status || "Error"}</Badge>}
                {packages.length > 0 && (
                  <Badge variant="outline" className="font-mono">
                    Local rows: {packages.length}
                  </Badge>
                )}
              </div>

              {/* Response / Error summary */}
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
                        Copy JSON
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

              {/* JSON Tools (no big preview until user clicks) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4 text-muted-foreground" />
                    Packages JSON
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartEditJson}
                      disabled={packages.length === 0}
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadJson}
                      disabled={packages.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download JSON
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Edit and export the current in-memory packages used by the table and CSV generator.
                </p>
              </div>

              {/* Raw OCR text viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Raw OCR Text (tmp/ocr-debug)
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadRawDebug}
                    disabled={!batchId || debugLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {debugLoading ? "Loading..." : "Load Debug Text"}
                  </Button>
                </div>

                {!batchId && (
                  <p className="text-xs text-muted-foreground">
                    No batch ID yet. Run OCR at least once to generate debug outputs.
                  </p>
                )}

                {debugError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{debugError}</AlertDescription>
                  </Alert>
                )}

                {debugFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {debugFiles.length} debug file{debugFiles.length !== 1 ? "s" : ""} found
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {debugFiles.map((file) => (
                          <Button
                            key={file.name}
                            variant={file.name === selectedFileName ? "default" : "outline"}
                            size="sm"
                            className="text-xs font-mono"
                            onClick={() => setSelectedFileName(file.name)}
                          >
                            {file.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3">
                      <pre className="text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
                        {selectedFile
                          ? selectedFile.content
                          : "Select a debug file above to view the raw OCR text."}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* JSON Editor Dialog */}
      <Dialog open={isJsonEditing} onOpenChange={setIsJsonEditing}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Packages JSON</DialogTitle>
            <DialogDescription>
              Manually edit the packages JSON. Changes will be validated before applying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Invalid JSON:</strong> {parseError}
                </AlertDescription>
              </Alert>
            )}
            <Textarea
              value={editedJson}
              onChange={(e) => {
                setEditedJson(e.target.value)
                setParseError(null)
              }}
              className="font-mono text-sm h-[400px] resize-none"
              placeholder="[]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsJsonEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyJson}>Apply Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}