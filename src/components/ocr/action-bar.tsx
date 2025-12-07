"use client"

import { useState } from "react"
import { Download, Upload, RefreshCw, AlertTriangle, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { PackageRow, RowValidation } from "@/lib/types/ocr"
import { CSV_COLUMNS } from "@/lib/types/ocr"

interface ActionBarProps {
  packages: PackageRow[]
  validations: Map<string, RowValidation>
  batchId: string | null
  csvBlob: Blob | null
  isRegenerating: boolean
  isImporting: boolean
  onRegenerateCsv: (options: { confirmAutoCreate: boolean; clearExisting: boolean }) => void
  onDownloadCsv: () => void
  onUploadToAdmin: (options: { confirmAutoCreate: boolean; clearExisting: boolean }) => void
  timestamps: {
    lastOcr: Date | null
    lastCsvRegeneration: Date | null
    lastImport: Date | null
  }
}

export function ActionBar({
  packages,
  validations,
  batchId,
  csvBlob,
  isRegenerating,
  isImporting,
  onRegenerateCsv,
  onDownloadCsv,
  onUploadToAdmin,
  timestamps,
}: ActionBarProps) {
  // disabling these two flags here, dont see a use for them
  // const [confirmAutoCreate, setConfirmAutoCreate] = useState(false)
  // const [clearExisting, setClearExisting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showHeadersTooltip, setShowHeadersTooltip] = useState(false)

  const invalidCount = Array.from(validations.values()).filter((v) => !v.isValid).length
  const hasNoRows = packages.length === 0
  const allInvalid = packages.length > 0 && invalidCount === packages.length

  const handleRegenerateCsv = () => {
    if (allInvalid) {
      setShowConfirmDialog(true)
    } else {
      onRegenerateCsv({ confirmAutoCreate: false, clearExisting: false })
    }
  }
  
  const handleConfirmRegenerate = () => {
    setShowConfirmDialog(false)
    onRegenerateCsv({ confirmAutoCreate: false, clearExisting: false })
  }

  const formatTime = (date: Date | null) => {
    if (!date) return "—"
    return date.toLocaleTimeString()
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left side: CSV actions */}
            <div className="flex items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button onClick={handleRegenerateCsv} disabled={hasNoRows || isRegenerating}>
                        {isRegenerating ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Generate CSV
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {hasNoRows && <TooltipContent>No rows to export</TooltipContent>}
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button variant="outline" onClick={onDownloadCsv} disabled={!csvBlob}>
                        <Download className="h-4 w-4 mr-2" />
                        Download CSV
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!csvBlob && <TooltipContent>Generate CSV first</TooltipContent>}
                </Tooltip>
              </TooltipProvider>

              {/* Debug: view CSV headers */}
              <TooltipProvider>
                <Tooltip open={showHeadersTooltip} onOpenChange={setShowHeadersTooltip}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowHeadersTooltip(!showHeadersTooltip)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md" side="top">
                    <p className="text-xs font-mono break-all">{CSV_COLUMNS.join(",")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Right side: Import controls */}
            <div className="flex items-center gap-4">
              {/* <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Switch id="confirmAutoCreate" checked={confirmAutoCreate} onCheckedChange={setConfirmAutoCreate} />
                  <Label htmlFor="confirmAutoCreate" className="text-xs">
                    Auto-create
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="clearExisting" checked={clearExisting} onCheckedChange={setClearExisting} />
                  <Label htmlFor="clearExisting" className="text-xs">
                    Clear existing
                  </Label>
                </div>
              </div> */}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        variant="secondary"
                        onClick={() => onUploadToAdmin({ confirmAutoCreate:false, clearExisting:false })}
                        disabled={!csvBlob || isImporting}
                      >
                        {isImporting ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload CSV to Admin
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!csvBlob && <TooltipContent>Generate CSV first</TooltipContent>}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Debug timestamps */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Last OCR: {formatTime(timestamps.lastOcr)}</span>
            <span>Last CSV: {formatTime(timestamps.lastCsvRegeneration)}</span>
            <span>Last Import: {formatTime(timestamps.lastImport)}</span>
            {batchId && <span className="font-mono">Batch: {batchId}</span>}
          </div>
        </div>
      </div>

      {/* Confirm dialog for all-invalid rows */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              All Rows Have Validation Errors
            </AlertDialogTitle>
            <AlertDialogDescription>
              All {packages.length} rows have validation errors. The generated CSV may not import correctly. Are you
              sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRegenerate}>Generate Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
