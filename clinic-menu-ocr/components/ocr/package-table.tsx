"use client"

import { useState, useMemo, useCallback } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Trash2, Plus, Settings2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { PackageRow, RowValidation } from "@/lib/types/ocr"
import { CURRENCY_OPTIONS } from "@/lib/types/ocr"
import { getFieldError, isFieldInvalid } from "@/lib/utils/validation"

interface PackageTableProps {
  packages: PackageRow[]
  validations: Map<string, RowValidation>
  warningsFilter: "all" | "warnings" | "invalid"
  onUpdate: (id: string, field: keyof PackageRow, value: unknown) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onAddRow: () => void
}

type ColumnKey = keyof PackageRow

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  "title",
  "hospital_name",
  "treatment_name",
  "price",
  "original_price",
  "currency",
  "treatment_category",
  "duration",
  "status",
  "featured",
  "is_le_package",
]

const ALL_COLUMNS: { key: ColumnKey; label: string; width?: string }[] = [
  { key: "title", label: "Title", width: "200px" },
  { key: "description", label: "Description", width: "200px" },
  { key: "details", label: "Details", width: "200px" },
  { key: "hospital_name", label: "Hospital", width: "180px" },
  { key: "treatment_name", label: "Treatment", width: "180px" },
  { key: "sub_treatments", label: "Sub Treatments", width: "150px" },
  { key: "price", label: "Price", width: "100px" },
  { key: "original_price", label: "Orig. Price", width: "100px" },
  { key: "currency", label: "Currency", width: "100px" },
  { key: "duration", label: "Duration", width: "100px" },
  { key: "treatment_category", label: "Category", width: "150px" },
  { key: "anaesthesia", label: "Anaesthesia", width: "120px" },
  { key: "commission", label: "Commission %", width: "100px" },
  { key: "featured", label: "Featured", width: "80px" },
  { key: "status", label: "Status", width: "100px" },
  { key: "doctor_name", label: "Doctor", width: "150px" },
  { key: "is_le_package", label: "LE Package", width: "80px" },
  { key: "includes", label: "Includes", width: "200px" },
  { key: "hospital_location", label: "Location", width: "150px" },
  { key: "category", label: "Category", width: "120px" },
  { key: "hospital_country", label: "Country", width: "120px" },
]

const ITEMS_PER_PAGE = 20

export function PackageTable({
  packages,
  validations,
  warningsFilter,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddRow,
}: PackageTableProps) {
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_VISIBLE_COLUMNS)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [selectedRow, setSelectedRow] = useState<PackageRow | null>(null)

  // Filter packages based on warningsFilter
  const filteredPackages = useMemo(() => {
    switch (warningsFilter) {
      case "warnings":
        return packages.filter((pkg) => pkg._meta?.warnings && pkg._meta.warnings.length > 0)
      case "invalid":
        return packages.filter((pkg) => {
          const validation = validations.get(pkg.id || "")
          return validation && !validation.isValid
        })
      default:
        return packages
    }
  }, [packages, warningsFilter, validations])

  // Sort packages
  const sortedPackages = useMemo(() => {
    if (!sortColumn) return filteredPackages
    return [...filteredPackages].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      const comparison = aVal < bVal ? -1 : 1
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [filteredPackages, sortColumn, sortDirection])

  // Paginate
  const totalPages = Math.ceil(sortedPackages.length / ITEMS_PER_PAGE)
  const paginatedPackages = sortedPackages.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const handleSort = (column: ColumnKey) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const toggleColumn = (column: ColumnKey) => {
    setVisibleColumns((prev) => (prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]))
  }

  const renderCell = useCallback(
    (pkg: PackageRow, column: ColumnKey) => {
      const value = pkg[column]
      const hasError = isFieldInvalid(validations, pkg.id || "", column)
      const errorMessage = getFieldError(validations, pkg.id || "", column)

      const cellClass = cn("h-9 px-2", hasError && "ring-1 ring-destructive bg-destructive/5")

      // Boolean fields
      if (column === "featured" || column === "is_le_package") {
        return (
          <Checkbox checked={value as boolean} onCheckedChange={(checked) => onUpdate(pkg.id || "", column, checked)} />
        )
      }

      // Status field
      if (column === "status") {
        return (
          <Select value={value as string} onValueChange={(v) => onUpdate(pkg.id || "", column, v)}>
            <SelectTrigger className={cn(cellClass, "w-24")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )
      }

      // Currency field
      if (column === "currency") {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={value as string} onValueChange={(v) => onUpdate(pkg.id || "", column, v)}>
                    <SelectTrigger className={cn(cellClass, "w-20")}>
                      <SelectValue placeholder="..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              {errorMessage && (
                <TooltipContent className="bg-destructive text-destructive-foreground">{errorMessage}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )
      }

      // Numeric fields
      if (column === "price" || column === "original_price" || column === "commission") {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Input
                  type="number"
                  value={value === null || value === undefined ? "" : value}
                  onChange={(e) => {
                    const numVal = e.target.value === "" ? null : Number.parseFloat(e.target.value)
                    onUpdate(pkg.id || "", column, numVal)
                  }}
                  className={cn(cellClass, "w-24")}
                  step={column === "commission" ? "0.1" : "1"}
                  min="0"
                />
              </TooltipTrigger>
              {errorMessage && (
                <TooltipContent className="bg-destructive text-destructive-foreground">{errorMessage}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )
      }

      // Text fields
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Input
                value={(value as string) || ""}
                onChange={(e) => onUpdate(pkg.id || "", column, e.target.value)}
                className={cellClass}
              />
            </TooltipTrigger>
            {errorMessage && (
              <TooltipContent className="bg-destructive text-destructive-foreground">{errorMessage}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )
    },
    [onUpdate, validations],
  )

  const getRowStatus = (pkg: PackageRow) => {
    const validation = validations.get(pkg.id || "")
    const hasWarnings = pkg._meta?.warnings && pkg._meta.warnings.length > 0
    const isLowConfidence = pkg._meta?.confidence_score !== undefined && pkg._meta.confidence_score < 0.7

    return { validation, hasWarnings, isLowConfidence }
  }

  if (packages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No packages to display. Upload and process menu files first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add Row
          </Button>
          <span className="text-sm text-muted-foreground">
            Showing {paginatedPackages.length} of {filteredPackages.length} rows
          </span>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4 mr-1" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Toggle Columns</p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {ALL_COLUMNS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={visibleColumns.includes(key)} onCheckedChange={() => toggleColumn(key)} />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 sticky left-0 bg-background z-10">
                  <span className="sr-only">Status</span>
                </TableHead>
                {visibleColumns.map((column) => {
                  const colDef = ALL_COLUMNS.find((c) => c.key === column)
                  return (
                    <TableHead
                      key={column}
                      style={{ minWidth: colDef?.width }}
                      className="cursor-pointer select-none"
                      onClick={() => handleSort(column)}
                    >
                      <div className="flex items-center gap-1">
                        {colDef?.label || column}
                        {sortColumn === column &&
                          (sortDirection === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          ))}
                      </div>
                    </TableHead>
                  )
                })}
                <TableHead className="w-24 sticky right-0 bg-background z-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPackages.map((pkg) => {
                const { hasWarnings, isLowConfidence, validation } = getRowStatus(pkg)
                const isInvalid = validation && !validation.isValid

                return (
                  <TableRow
                    key={pkg.id}
                    className={cn(isInvalid && "bg-destructive/5", hasWarnings && !isInvalid && "bg-amber-500/5")}
                  >
                    <TableCell className="sticky left-0 bg-inherit z-10">
                      <div className="flex items-center gap-1">
                        {hasWarnings && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <ul className="text-sm space-y-1">
                                  {pkg._meta?.warnings?.map((w, i) => (
                                    <li key={i}>• {w}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {isLowConfidence && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  variant="outline"
                                  className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-amber-100 border-amber-300 text-amber-700"
                                >
                                  ?
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Low confidence: {((pkg._meta?.confidence_score || 0) * 100).toFixed(0)}%
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedRow(pkg)}>
                          <Info className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column} className="p-1">
                        {renderCell(pkg, column)}
                      </TableCell>
                    ))}
                    <TableCell className="sticky right-0 bg-inherit z-10">
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onDuplicate(pkg.id || "")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate row</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => onDelete(pkg.id || "")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete row</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Row detail sheet */}
      <Sheet open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Package Details</SheetTitle>
            <SheetDescription>View and edit all fields including translations</SheetDescription>
          </SheetHeader>
          {selectedRow && (
            <div className="mt-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Basic Information</h4>
                <div className="grid gap-3">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={selectedRow.title || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "title", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={selectedRow.description || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "description", e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Details</Label>
                    <Textarea
                      value={selectedRow.details || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "details", e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Translations */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Translations</h4>
                <div className="grid gap-3">
                  <div>
                    <Label>Language Code</Label>
                    <Input
                      value={selectedRow.translation || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "translation", e.target.value)}
                      placeholder="e.g. TH, ZH, EN"
                    />
                  </div>
                  <div>
                    <Label>Translated Title</Label>
                    <Input
                      value={selectedRow.translation_title || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "translation_title", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Translated Description</Label>
                    <Textarea
                      value={selectedRow.translation_description || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "translation_description", e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Translated Details</Label>
                    <Textarea
                      value={selectedRow.translation_details || ""}
                      onChange={(e) => onUpdate(selectedRow.id || "", "translation_details", e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Meta info */}
              {selectedRow._meta && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">Extraction Metadata</h4>
                  <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                    {selectedRow._meta.source_file && (
                      <p>
                        <span className="text-muted-foreground">Source:</span> {selectedRow._meta.source_file}
                        {selectedRow._meta.source_page !== undefined && ` (page ${selectedRow._meta.source_page})`}
                      </p>
                    )}
                    {selectedRow._meta.confidence_score !== undefined && (
                      <p>
                        <span className="text-muted-foreground">Confidence:</span>{" "}
                        {(selectedRow._meta.confidence_score * 100).toFixed(1)}%
                      </p>
                    )}
                    {selectedRow._meta.warnings && selectedRow._meta.warnings.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Warnings:</span>
                        <ul className="mt-1 list-disc list-inside text-amber-600">
                          {selectedRow._meta.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
