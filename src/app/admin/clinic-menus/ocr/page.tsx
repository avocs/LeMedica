// page.tsx
// all that goes in this folder are UI routes, ie. URLs that render UI, admin-facing
// includes: server componens, client components, layouts, loading UI, error UI, data fetching logic

"use client"

import { useState, useCallback, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { FileUploadPanel } from "../../../../components/ocr/file-upload-panel"
import { OcrSummaryPanel } from "@/components/ocr/ocr-summary-panel"
import { PackageTable } from "@/components/ocr/package-table"
import { ActionBar } from "@/components/ocr/action-bar"
import { DebugPanel } from "@/components/ocr/debug-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { PackageRow, UploadedFile, OcrMenusResponse, RowValidation, FileInfo } from "@/lib/types/ocr"
import { uploadMenus, regenerateCsv, uploadCsvToAdmin, OcrApiError } from "@/lib/api/ocr-client"
import { validateAllRows } from "@/lib/validation"

export default function ClinicMenuOcrPage() {
  const { toast } = useToast()

  // File upload state
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // OCR response state
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [summary, setSummary] = useState<OcrMenusResponse["summary"] | null>(null)
  const [fileInfos, setFileInfos] = useState<FileInfo[]>([])
  const [batchId, setBatchId] = useState<string | null>(null)

  // Validation state
  const [validations, setValidations] = useState<Map<string, RowValidation>>(new Map())
  const [warningsFilter, setWarningsFilter] = useState<"all" | "warnings" | "invalid">("all")

  // CSV state
  const [csvBlob, setCsvBlob] = useState<Blob | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Debug state
  const [lastResponse, setLastResponse] = useState<OcrMenusResponse | null>(null)
  const [lastError, setLastError] = useState<{ message: string; status?: number; data?: unknown } | null>(null)
  const [requestDuration, setRequestDuration] = useState<number | null>(null)
  const [timestamps, setTimestamps] = useState({
    lastOcr: null as Date | null,
    lastCsvRegeneration: null as Date | null,
    lastImport: null as Date | null,
  })

  // Revalidate packages whenever they change
  useEffect(() => {
    if (packages.length > 0) {
      const { validations: newValidations, summary: validationSummary } = validateAllRows(packages)
      setValidations(newValidations)
  
      setSummary((prev) => {
        const base = prev ?? { total: 0, valid: 0, invalid: 0, withWarnings: 0 }
        return {
          ...base,
          total: packages.length,
          valid: validationSummary.valid,
          invalid: validationSummary.invalid,
          withWarnings: validationSummary.withWarnings,
        }
      })
    } else {
      setValidations(new Map())
      setSummary((prev) =>
        prev
          ? { ...prev, total: 0, valid: 0, invalid: 0, withWarnings: 0 }
          : null,
      )
    }
  }, [packages])

  // Process uploaded files
  const handleProcess = useCallback(async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    setLastError(null)
    const startTime = Date.now()

    // Update file statuses to processing
    setFiles((prev) => prev.map((f) => ({ ...f, status: "processing" as const })))

    try {
      const filesToUpload = files.map((f) => f.file)
      const response = await uploadMenus(filesToUpload)

      // Ensure every package has a stable id so the table & validation work immediately
      const packagesWithIds: PackageRow[] = response.packages.map((pkg, index) => ({
        ...pkg,
        id: pkg.id || `pkg_${response.batch_id || "local"}_${index}`,
      }))
      
      setLastResponse(response)
      setRequestDuration(Date.now() - startTime)
      setTimestamps((prev) => ({ ...prev, lastOcr: new Date() }))
      
      // Update state with normalized packages
      setPackages(packagesWithIds)
      setSummary(response.summary)
      setFileInfos(response.files)
      setBatchId(response.batch_id)
      setCsvBlob(null)

      // Update file statuses
      setFiles((prev) =>
        prev.map((f) => {
          const matchingFile = response.files.find((rf) => rf.original_name === f.name)
          return {
            ...f,
            status: "processed" as const,
            pageCount: matchingFile?.page_count,
          }
        }),
      )

      toast({
        title: "OCR Complete",
        description: `Extracted ${response.packages.length} packages from ${response.files.length} file(s).`,
      })
    } catch (error) {
      setRequestDuration(Date.now() - startTime)

      const apiError = error instanceof OcrApiError ? error : null
      setLastError({
        message: error instanceof Error ? error.message : "Unknown error",
        status: apiError?.status,
        data: apiError?.data,
      })

      // Update file statuses to error
      setFiles((prev) => prev.map((f) => ({ ...f, status: "error" as const })))

      toast({
        title: "OCR Failed",
        description: error instanceof Error ? error.message : "An error occurred during processing.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }, [files, toast])

  // Update a single package field
  const handleUpdatePackage = useCallback((id: string, field: keyof PackageRow, value: unknown) => {
    setPackages((prev) => prev.map((pkg) => (pkg.id === id ? { ...pkg, [field]: value } : pkg)))
  }, [])

  // Delete a package
  const handleDeletePackage = useCallback(
    (id: string) => {
      setPackages((prev) => prev.filter((pkg) => pkg.id !== id))
      toast({
        title: "Row Deleted",
        description: "The package row has been removed.",
      })
    },
    [toast],
  )

  // Duplicate a package
  const handleDuplicatePackage = useCallback(
    (id: string) => {
      setPackages((prev) => {
        const packageToDupe = prev.find((pkg) => pkg.id === id)
        if (!packageToDupe) return prev

        const newPackage: PackageRow = {
          ...packageToDupe,
          id: `pkg_dup_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        }

        const index = prev.findIndex((pkg) => pkg.id === id)
        const newPackages = [...prev]
        newPackages.splice(index + 1, 0, newPackage)
        return newPackages
      })

      toast({
        title: "Row Duplicated",
        description: "A copy of the row has been added below.",
      })
    },
    [toast],
  )

  // Add a new blank row
  const handleAddRow = useCallback(() => {
    const newPackage: PackageRow = {
      id: `pkg_new_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      title: "",
      hospital_name: "",
      treatment_name: "",
      price: null,
      currency: "USD",
      featured: false,
      status: "active",
      is_le_package: false,
    }

    setPackages((prev) => [...prev, newPackage])

    toast({
      title: "Row Added",
      description: "A new blank row has been added to the table.",
    })
  }, [toast])

  // Apply edited JSON
  const handleApplyJson = useCallback(
    (newPackages: PackageRow[]) => {
      setPackages(newPackages)
      setCsvBlob(null) // Reset CSV when data changes

      toast({
        title: "JSON Applied",
        description: `Updated ${newPackages.length} packages from JSON.`,
      })
    },
    [toast],
  )

  // Regenerate CSV
  const handleRegenerateCsv = useCallback(
    async (options: { confirmAutoCreate: boolean; clearExisting: boolean }) => {
      if (!batchId || packages.length === 0) return

      setIsRegenerating(true)

      try {
        const blob = await regenerateCsv({
          batch_id: batchId,
          packages,
          ...options,
        })

        setCsvBlob(blob)
        setTimestamps((prev) => ({ ...prev, lastCsvRegeneration: new Date() }))

        toast({
          title: "CSV Generated",
          description: "The CSV has been regenerated and is ready for download.",
        })
      } catch (error) {
        toast({
          title: "CSV Generation Failed",
          description: error instanceof Error ? error.message : "An error occurred.",
          variant: "destructive",
        })
      } finally {
        setIsRegenerating(false)
      }
    },
    [batchId, packages, toast],
  )

  // Download CSV
  const handleDownloadCsv = useCallback(() => {
    if (!csvBlob || !batchId) return

    const url = URL.createObjectURL(csvBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `clinic-menu-packages-${batchId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [csvBlob, batchId])

  // Upload CSV to admin
  const handleUploadToAdmin = useCallback(
    async (options: { confirmAutoCreate: boolean; clearExisting: boolean }) => {
      if (!csvBlob || !batchId) return

      setIsImporting(true)

      try {
        const result = await uploadCsvToAdmin(csvBlob, batchId, options)
        setTimestamps((prev) => ({ ...prev, lastImport: new Date() }))

        toast({
          title: "Import Successful",
          description: result.message,
        })
      } catch (error) {
        toast({
          title: "Import Failed",
          description: error instanceof Error ? error.message : "An error occurred during import.",
          variant: "destructive",
        })
      } finally {
        setIsImporting(false)
      }
    },
    [csvBlob, batchId, toast],
  )

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight">Clinic Menu OCR → CSV</h1>
          <p className="text-muted-foreground mt-1">
            Upload clinic menus (PDF or images) and convert them into a CSV ready for bulk import.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Compatibility warning */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Compatibility Note</AlertTitle>
          <AlertDescription>
            CSV format requirements depend on backend importer rules, which may differ from OCR output. Confirm
            compatibility before importing.
          </AlertDescription>
        </Alert>

        {/* Top section: Upload + Summary */}
        <div className="grid gap-6 lg:grid-cols-2">
          <FileUploadPanel
            files={files}
            onFilesChange={setFiles}
            onProcess={handleProcess}
            isProcessing={isProcessing}
          />
          <OcrSummaryPanel
            summary={summary}
            packages={packages}
            files={fileInfos}
            batchId={batchId}
            warningsFilter={warningsFilter}
            onFilterChange={setWarningsFilter}
            validations={validations}
          />
        </div>

        {/* Package table */}
        {packages.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Extracted Packages</h2>
            <PackageTable
              packages={packages}
              validations={validations}
              warningsFilter={warningsFilter}
              onUpdate={handleUpdatePackage}
              onDelete={handleDeletePackage}
              onDuplicate={handleDuplicatePackage}
              onAddRow={handleAddRow}
            />
          </div>
        )}


        {/* Debug & JSON tools */}
        <DebugPanel
          packages={packages}
          batchId={batchId}
          lastResponse={lastResponse}
          lastError={lastError}
          requestDuration={requestDuration}
          onApplyJson={handleApplyJson}
        />
      </div>

      {/* Fixed action bar */}
      <ActionBar
        packages={packages}
        validations={validations}
        batchId={batchId}
        csvBlob={csvBlob}
        isRegenerating={isRegenerating}
        isImporting={isImporting}
        onRegenerateCsv={handleRegenerateCsv}
        onDownloadCsv={handleDownloadCsv}
        onUploadToAdmin={handleUploadToAdmin}
        timestamps={timestamps}
      />

   
      <Toaster />
    </div>
  )
}

