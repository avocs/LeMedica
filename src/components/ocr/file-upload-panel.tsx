"use client"

import type React from "react"

import { useCallback, useRef, useState, useEffect } from "react"
import { Upload, X, File, Folder, AlertCircle, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { UploadedFile } from "@/lib/types/ocr"
import { ACCEPTED_FILE_EXTENSIONS, ACCEPTED_FILE_TYPES } from "@/lib/types/ocr"

interface FileUploadPanelProps {
  files: UploadedFile[]
  onFilesChange: (files: UploadedFile[]) => void
  onProcess: () => void
  isProcessing: boolean
  maxFileSizeMB?: number
}

export function FileUploadPanel({
  files,
  onFilesChange,
  onProcess,
  isProcessing,
  maxFileSizeMB = 50,
}: FileUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // 🔹 NEW: detect folder support only on the client, after hydration
  const [supportsFolder, setSupportsFolder] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const supported =
          typeof HTMLInputElement !== "undefined" &&
          "webkitdirectory" in (HTMLInputElement.prototype as unknown as Record<string, unknown>)

        setSupportsFolder(Boolean(supported))
      } catch {
        setSupportsFolder(false)
      }
    }
  }, [])

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_FILE_TYPES.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|heic)$/i)) {
        return `Unsupported file type: ${file.name}`
      }
      if (file.size > maxFileSizeMB * 1024 * 1024) {
        return `File too large: ${file.name} (max ${maxFileSizeMB}MB)`
      }
      return null
    },
    [maxFileSizeMB],
  )

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const newFiles: UploadedFile[] = []
      const newErrors: string[] = []

      Array.from(fileList).forEach((file) => {
        const error = validateFile(file)
        if (error) {
          newErrors.push(error)
        } else {
          const exists = files.some((f) => f.name === file.name && f.size === file.size)
          if (!exists) {
            newFiles.push({
              id: `file_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              file,
              name: file.name,
              size: file.size,
              type: file.type || file.name.split(".").pop() || "unknown",
              status: "pending",
            })
          }
        }
      })

      if (newErrors.length > 0) {
        setErrors(newErrors)
        setTimeout(() => setErrors([]), 5000)
      }

      if (newFiles.length > 0) {
        onFilesChange([...files, ...newFiles])
      }
    },
    [files, onFilesChange, validateFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const items = e.dataTransfer.items
      const allFiles: File[] = []

      const processEntry = async (entry: FileSystemEntry): Promise<void> => {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry
          return new Promise((resolve) => {
            fileEntry.file((file) => {
              allFiles.push(file)
              resolve()
            })
          })
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry
          const reader = dirEntry.createReader()
          return new Promise((resolve) => {
            reader.readEntries(async (entries) => {
              for (const entry of entries) {
                await processEntry(entry)
              }
              resolve()
            })
          })
        }
      }

      const processItems = async () => {
        for (const item of Array.from(items)) {
          const entry = item.webkitGetAsEntry?.()
          if (entry) {
            await processEntry(entry)
          } else if (item.kind === "file") {
            const file = item.getAsFile()
            if (file) allFiles.push(file)
          }
        }
        processFiles(allFiles)
      }

      processItems()
    },
    [processFiles],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files)
      }
    },
    [processFiles],
  )

  const removeFile = useCallback(
    (id: string) => {
      onFilesChange(files.filter((f) => f.id !== id))
    },
    [files, onFilesChange],
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />
    if (type.includes("image") || type.match(/(jpg|jpeg|png|heic)/i)) {
      return <ImageIcon className="h-4 w-4 text-blue-500" />
    }
    return <File className="h-4 w-4 text-muted-foreground" />
  }

  const getStatusBadge = (status: UploadedFile["status"]) => {
    const variants: Record<
      UploadedFile["status"],
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      pending: { variant: "secondary", label: "Pending" },
      processing: { variant: "default", label: "Processing" },
      processed: { variant: "outline", label: "Processed" },
      error: { variant: "destructive", label: "Error" },
    }
    const { variant, label } = variants[status]
    return <Badge variant={variant}>{label}</Badge>
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Upload Files</CardTitle>
        <CardDescription>Upload clinic menus (PDF, JPG, PNG, HEIC) for OCR processing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error messages */}
        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="space-y-1">
                {errors.map((error, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {error}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative rounded-lg border-2 border-dashed p-8 transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
          )}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Drag and drop files or folders here</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports PDF, JPG, PNG, HEIC • Max {maxFileSizeMB}MB per file
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                <File className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
              {supportsFolder && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <Folder className="h-4 w-4 mr-2" />
                  Browse Folder
                </Button>
              )}
            </div>
            {!supportsFolder && (
              <p className="text-xs text-muted-foreground">Folder upload not supported in this browser</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_EXTENSIONS}
            onChange={handleFileInput}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in the standard types
            webkitdirectory=""
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </p>
              <Button variant="ghost" size="sm" onClick={() => onFilesChange([])} disabled={isProcessing}>
                Clear all
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border bg-muted/30 p-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 rounded-md bg-background px-3 py-2">
                  {getFileIcon(file.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                      {file.pageCount && ` • ${file.pageCount} pages`}
                    </p>
                  </div>
                  {getStatusBadge(file.status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeFile(file.id)}
                    disabled={isProcessing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Process button */}
        <Button onClick={onProcess} disabled={files.length === 0 || isProcessing} className="w-full">
          {isProcessing ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Process Menus
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
