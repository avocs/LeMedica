"use client"

import { useState } from "react"
import { Code, Download, Edit3, Check, X, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { PackageRow } from "@/lib/types/ocr"

interface JsonPreviewPanelProps {
  packages: PackageRow[]
  batchId: string | null
  onApplyJson: (packages: PackageRow[]) => void
}

export function JsonPreviewPanel({ packages, batchId, onApplyJson }: JsonPreviewPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedJson, setEditedJson] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)

  const jsonString = JSON.stringify(packages, null, 2)

  const handleStartEdit = () => {
    setEditedJson(jsonString)
    setParseError(null)
    setIsEditing(true)
  }

  const handleApplyChanges = () => {
    try {
      const parsed = JSON.parse(editedJson)
      if (!Array.isArray(parsed)) {
        throw new Error("JSON must be an array of packages")
      }
      // Add IDs to packages that don't have them
      const packagesWithIds = parsed.map((pkg: PackageRow, index: number) => ({
        ...pkg,
        id: pkg.id || `pkg_edited_${Date.now()}_${index}`,
      }))
      onApplyJson(packagesWithIds)
      setIsEditing(false)
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

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">JSON Preview</CardTitle>
            </div>
            {batchId && (
              <Badge variant="outline" className="font-mono text-xs">
                {batchId}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <pre className="text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
              {packages.length > 0
                ? jsonString.substring(0, 2000) + (jsonString.length > 2000 ? "\n... (truncated)" : "")
                : "[]"}
            </pre>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={packages.length === 0}>
              <Edit3 className="h-4 w-4 mr-1" />
              Edit JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadJson} disabled={packages.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Download JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* JSON Editor Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit JSON</DialogTitle>
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
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleApplyChanges}>
              <Check className="h-4 w-4 mr-1" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
