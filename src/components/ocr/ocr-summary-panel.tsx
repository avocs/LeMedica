"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { PackageRow, FileInfo, RowValidation } from "@/lib/types/ocr"

interface OcrSummaryPanelProps {
  summary: {
    total: number
    valid: number
    withWarnings: number
    invalid: number
  } | null
  packages: PackageRow[]
  files: FileInfo[]
  batchId: string | null
  warningsFilter: "all" | "warnings" | "invalid"
  onFilterChange: (filter: "all" | "warnings" | "invalid") => void
  validations: Map<string, RowValidation>
}

export function OcrSummaryPanel({
  summary,
  packages,
  files,
  batchId,
  warningsFilter,
  onFilterChange,
  validations,
}: OcrSummaryPanelProps) {
  const [isWarningsOpen, setIsWarningsOpen] = useState(true)
  const [isFilesOpen, setIsFilesOpen] = useState(false)

  if (!summary) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Upload and process files to see the extraction summary.</p>
        </CardContent>
      </Card>
    )
  }

  // Aggregate warnings with invalid flag
  const warningStats = new Map<string, { count: number; invalidCount: number }>()

  for (const pkg of packages) {
    const validation = validations.get(pkg.id || "")
    const isInvalid = Boolean(validation && !validation.isValid)
    const warnings = pkg._meta?.warnings || []
    for (const w of warnings) {
      const existing = warningStats.get(w) || { count: 0, invalidCount: 0 }
      existing.count += 1
      if (isInvalid) existing.invalidCount += 1
      warningStats.set(w, existing)
    }
  }
  // Count packages per source file
  const packagesPerFile = packages.reduce((acc, pkg) => {
    const source = pkg._meta?.source_file || "Unknown source"
    acc.set(source, (acc.get(source) || 0) + 1)
    return acc
  }, new Map<string, number>())

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Summary</CardTitle>
          {batchId && (
            <Badge variant="outline" className="font-mono text-xs">
              Batch: {batchId}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{summary.total}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">Valid</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{summary.valid}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Warnings</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">{summary.withWarnings}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Invalid</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-destructive">{summary.invalid}</p>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2">
          <Button
            variant={warningsFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("all")}
          >
            All rows
          </Button>
          <Button
            variant={warningsFilter === "warnings" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("warnings")}
            disabled={summary.withWarnings === 0}
          >
            With warnings ({summary.withWarnings})
          </Button>
          <Button
            variant={warningsFilter === "invalid" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("invalid")}
            disabled={summary.invalid === 0}
          >
            Invalid ({summary.invalid})
          </Button>
        </div>

        {/* Warnings list */}
        {warningStats.size > 0 && (
          <Collapsible open={isWarningsOpen} onOpenChange={setIsWarningsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-3 h-9">
                <span className="text-sm font-medium">Warnings ({warningStats.size} unique)</span>
                {isWarningsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto rounded-md border bg-amber-500/5 p-2">
                {Array.from(warningStats.entries()).map(([warning, { count, invalidCount }]) => {
                  const isInvalidWarning = invalidCount > 0
                  return (
                    <div key={warning} className="flex items-start gap-2 text-sm px-2 py-1.5 rounded bg-background">
                      {isInvalidWarning ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <span className="flex-1">{warning}</span>
                      <Badge
                        variant={isInvalidWarning ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        ×{count}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Files breakdown */}
        {files.length > 0 && (
          <Collapsible open={isFilesOpen} onOpenChange={setIsFilesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-3 h-9">
                <span className="text-sm font-medium">Source Files ({files.length})</span>
                {isFilesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {Array.from(packagesPerFile.entries()).map(([filename, count]) => (
                  <div key={filename} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-background">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{filename}</span>
                    <Badge variant="outline" className="text-xs">
                      {count} pkg{count !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

