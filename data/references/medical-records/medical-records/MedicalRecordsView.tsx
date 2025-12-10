'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import LoadingIcon from '@/components/LoadingIcon';
import { auth } from '@/lib/firebase/config';
import { getImageUrl } from '@/lib/utils/image-url';
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  FileText,
  Upload,
  Download,
  Eye,
  Plus,
  Search,
  Filter,
  Calendar,
  User,
  Activity,
  Heart,
  Brain,
  Stethoscope,
  Save,
  X,
  Edit,
  Trash2,
  AlertCircle,
  Image as ImageIcon,
  File,
  TestTube,
  X as XRayIcon,
  Pill,
  Shield,
  Camera,
  FileQuestion,
  Zap,
  Scan,
  ShieldCheck,
  ImageIcon as CameraIcon,
  HelpCircle,
  History,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Remove direct imports to avoid SSR issues
// import Tesseract from 'tesseract.js'
// import { pdfjs } from 'react-pdf'

// Add interface for server-side AI response
interface LabReportData {
  reportDate?: string | null
  confidence?: number
  categories: Array<{
    categoryName: string
    confidence?: number
    tests: Array<{
      testName: string
      value: string
      unit: string
      referenceLow: string
      referenceHigh: string
      status: 'normal' | 'high' | 'low' | 'critical'
      confidence?: number
    }>
  }>
}

export default function MedicalRecordsView() {
  const { toast } = useToast()
  const [ready, setReady] = useState(false);
  const [Tesseract, setTesseract] = useState<any>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);

  // All your existing state variables
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [labUploadDialogOpen, setLabUploadDialogOpen] = useState(false)
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractedText, setExtractedText] = useState("")
  const [ocrProgress, setOcrProgress] = useState(0)
  const [imageFileIds, setImageFileIds] = useState<string[]>([])
  const [numOfPages, setNumOfPages] = useState(0)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [labReport, setLabReport] = useState({
    testDate: "",
    bloodCount: "",
    hemoglobin: "",
    whiteBloodCells: "",
    platelets: "",
    cholesterol: "",
    bloodSugar: "",
    notes: ""
  })

  // Categorized Lab Results State
  const [labResults, setLabResults] = useState<Array<{
    id: string
    categoryName: string
    tests: Array<{
      id: string
      testName: string
      value: string
      unit: string
      referenceLow: string
      referenceHigh: string
      status: 'normal' | 'high' | 'low' | 'critical'
      isEditing: boolean
    }>
  }>>([])
  const [newResultsAdded, setNewResultsAdded] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  // Grouped Lab Results by Test Type (for deduplication)
  const [groupedLabResults, setGroupedLabResults] = useState<Array<{
    testType: string
    latestReport: {
      id: string
      reportDate: string | null
      uploadedAt: string
      categories: Array<{
        id: string
        categoryName: string
        tests: Array<{
          id: string
          testName: string
          value: string
          unit: string
          referenceLow: string
          referenceHigh: string
          status: 'normal' | 'high' | 'low' | 'critical'
          isEditing: boolean
        }>
      }>
    }
    history: Array<{
      id: string
      reportDate: string | null
      uploadedAt: string
      categories: Array<{
        id: string
        categoryName: string
        tests: Array<{
          id: string
          testName: string
          value: string
          unit: string
          referenceLow: string
          referenceHigh: string
          status: 'normal' | 'high' | 'low' | 'critical'
          isEditing: boolean
        }>
      }>
    }>
    showHistory: boolean
  }>>([])

  // Edit mode state for individual test results
  const [editingResult, setEditingResult] = useState<{
    testType: string
    categoryName: string
    testName: string
    currentValues: any
  } | null>(null)

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    id: string
    name: string
    size: number
    type: string
    uploadDate: string
    url: string
    category: string
    status?: string
    processed?: boolean
  }>>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [aiLabReportOnly, setAiLabReportOnly] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // File categories
  const fileCategories = [
    { value: 'ai-lab-report', label: 'AI Lab Report', icon: Zap, color: 'bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-medium text-wellness-blue-primary', fullWidth: true },
    { value: 'lab-reports', label: 'Lab Reports', icon: TestTube, color: 'bg-red-100 text-red-700' },
    { value: 'x-rays', label: 'X-Rays', icon: Scan, color: 'bg-blue-100 text-blue-700' },
    { value: 'prescriptions', label: 'Prescriptions', icon: Pill, color: 'bg-green-100 text-green-700' },
    { value: 'insurance', label: 'Insurance', icon: ShieldCheck, color: 'bg-purple-100 text-purple-700' },
    { value: 'images', label: 'Images', icon: Camera, color: 'bg-orange-100 text-orange-700' },
    { value: 'other', label: 'Other', icon: HelpCircle, color: 'bg-gray-100 text-gray-700' }
  ]

  // Add missing getFileSize function
  const getFileSize = (file: File): string => {
    if (file.size === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(file.size) / Math.log(k))
    return parseFloat((file.size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Helper function to get authenticated headers
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    const user = auth.currentUser
    if (user) {
      try {
        const idToken = await user.getIdToken()
        headers['Authorization'] = `Bearer ${idToken}`
      } catch (error) {
        console.warn('Failed to get ID token:', error)
      }
    }
    
    return headers
  }

  // HIPAA-compliant AI processing function with Claude 3 (no Firebase Functions)
  const processLabReportWithAI = async (text: string): Promise<LabReportData> => {
    try {
      // Direct call to our PostgreSQL API (no Firebase Functions)
      const headers = await getAuthHeaders()
      console.log('🧪 [AI] POST /api/medical-records text length:', text?.length ?? 0)
      const response = await fetch('/api/medical-records', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      const result = await response.json()
      console.log('🧪 [AI] response.ok:', response.ok, 'has categories:', Array.isArray(result?.data?.categories))
      if (Array.isArray(result?.data?.categories)) {
        console.log('🧪 [AI] categories count:', result.data.categories.length)
      }
      
      if (!result.success) {
        console.error('❌ API returned success: false:', result.error);
        throw new Error(result.error || 'AI processing failed');
      }

      return result.data
    } catch (error) {
      console.error('❌ HIPAA-compliant AI processing error:', error)
      
      // Fallback to client-side processing if server is unavailable
      try {
        const { processLabReportWithAI: clientSideAI } = await import('@/lib/aws/medical-processing')
        return await clientSideAI(text)
      } catch (fallbackError) {
        console.error('❌ Client-side HIPAA-compliant fallback also failed:', fallbackError)
        throw new Error('HIPAA-compliant AI processing unavailable. Please try again later.')
      }
    }
  }

  // Load browser-only libraries safely
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    (async () => {
      try {
        // Load Tesseract.js dynamically
        const tesseractModule = await import('tesseract.js');
        setTesseract(tesseractModule.default);

        // Load pdfjs using the working approach from the GitHub diff
        try {
          const { pdfjs } = await import('react-pdf');
          setPdfjs(pdfjs);
          
          // Set up PDF.js worker using the working approach
          pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        } catch (pdfError) {
          console.warn('PDF.js failed to load, PDF processing will be disabled:', pdfError);
          setPdfjs(null);
        }

        setReady(true);
      } catch (error) {
        console.error('Failed to load OCR libraries:', error);
        setReady(true); // Still set ready so UI shows
      }
    })();
  }, []);

  // All your existing helper functions
  const getHealthStatus = (value: number, low: number | null, high: number): 'normal' | 'high' | 'low' | 'critical' => {
    if (low === null || low === 0 || isNaN(low)) {
      if (value <= high) return 'normal'
      if (value > high * 1.5) return 'critical'
      return 'high'
    }
    
    if (high === null || high === 0 || isNaN(high)) {
      if (value >= low) return 'normal'
      if (value < low * 0.5) return 'critical'
      return 'low'
    }
    
    if (value >= low && value <= high) return 'normal'
    if (value < low) return value < low * 0.5 ? 'critical' : 'low'
    if (value > high) return value > high * 1.5 ? 'critical' : 'high'
    return 'normal'
  }

  const getStatusColor = (status: 'normal' | 'high' | 'low' | 'critical') => {
    switch (status) {
      case 'normal': return 'text-green-600 bg-gray-50 border-green-200'
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'low': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: 'normal' | 'high' | 'low' | 'critical') => {
    switch (status) {
      case 'normal': return '✓'
      case 'high': return '↑'
      case 'low': return '↓'
      case 'critical': return '⚠'
      default: return '•'
    }
  }

  // Update lab result and recalculate status
  const updateLabResult = (testId: string, field: string, value: string) => {
    setLabResults(prev => {
      const updatedResults = prev.map(category => ({
        ...category,
        tests: category.tests.map(test => {
          if (test.id === testId) {
            const updatedTest = { ...test, [field]: value }
            
            if (field === 'value' || field === 'referenceLow' || field === 'referenceHigh') {
              const numValue = parseFloat(updatedTest.value)
              const numLow = updatedTest.referenceLow === 'N/A' ? null : parseFloat(updatedTest.referenceLow)
              const numHigh = updatedTest.referenceHigh === 'N/A' ? null : parseFloat(updatedTest.referenceHigh)
              
              if (!isNaN(numValue) && (numLow !== null || numHigh !== null)) {
                updatedTest.status = getHealthStatus(numValue, numLow, numHigh || 0)
              }
            }
            
            return updatedTest
          }
          return test
        })
      }))
      
      // Data is now persisted in PostgreSQL, no localStorage needed
      
      return updatedResults
    })
  }

  // Toggle edit mode for lab result
  const toggleEditMode = (testId: string) => {
    setLabResults(prev => prev.map(category => ({
      ...category,
      tests: category.tests.map(test => 
        test.id === testId ? { ...test, isEditing: !test.isEditing } : test
      )
    })))
  }

  // Group lab results by test type and show only latest
  const groupLabResultsByTestType = (files: any[]) => {
    const groupedResults: Array<{
      testType: string
      latestReport: {
        id: string
        reportDate: string | null
        uploadedAt: string
        categories: any[]
      }
      history: Array<{
        id: string
        reportDate: string | null
        uploadedAt: string
        categories: any[]
      }>
      showHistory: boolean
    }> = []

    // Collect all lab reports with their metadata
    const labReports: Array<{
      id: string
      reportDate: string | null
      uploadedAt: string
      categories: any[]
    }> = []

    files.forEach((file: any) => {
      if (file.aiCategories && Array.isArray(file.aiCategories) && file.aiCategories.length > 0) {
        // Extract report date from AI results or use uploaded date
        let reportDate: string | null = null
        if (file.notes) {
          try {
            const parsedNotes = JSON.parse(file.notes)
            if (parsedNotes.reportDate) {
              reportDate = parsedNotes.reportDate
            }
          } catch (e) {
            console.warn('Failed to parse report date from notes:', e)
          }
        }

        labReports.push({
          id: file.id,
          reportDate: reportDate,
          uploadedAt: file.uploadDate,
          categories: file.aiCategories.map((category: any, categoryIndex: number) => ({
            id: `${file.id}-category-${categoryIndex}`,
            categoryName: category.categoryName || 'Unknown Category',
            tests: (category.tests || []).map((test: any, testIndex: number) => ({
              id: `${category.id || `${file.id}-category-${categoryIndex}`}-test-${testIndex}`,
              testName: test.testName || 'Unknown Test',
              value: test.value || 'N/A',
              unit: test.unit || '',
              referenceLow: test.referenceLow || 'N/A',
              referenceHigh: test.referenceHigh || 'N/A',
              status: test.status || 'normal',
              isEditing: false
            }))
          }))
        })
      }
    })

    // Group by test type (category name)
    const testTypeGroups: { [key: string]: typeof labReports } = {}

    labReports.forEach(report => {
      report.categories.forEach(category => {
        const testType = category.categoryName
        if (!testTypeGroups[testType]) {
          testTypeGroups[testType] = []
        }
        testTypeGroups[testType].push({
          ...report,
          categories: [category] // Each group entry contains only this category
        })
      })
    })

    // For each test type, sort by date and create latest + history
    Object.entries(testTypeGroups).forEach(([testType, reports]) => {
      // Sort reports by report date (newest first), fallback to uploaded date
      reports.sort((a, b) => {
        const dateA = a.reportDate ? new Date(a.reportDate).getTime() : new Date(a.uploadedAt).getTime()
        const dateB = b.reportDate ? new Date(b.reportDate).getTime() : new Date(b.uploadedAt).getTime()
        return dateB - dateA
      })

      const latestReport = reports[0]
      const history = reports.slice(1)

      groupedResults.push({
        testType,
        latestReport,
        history,
        showHistory: false
      })
    })

    // Sort grouped results by test type name
    groupedResults.sort((a, b) => a.testType.localeCompare(b.testType))

    setGroupedLabResults(groupedResults)
  }

  // Toggle history visibility for a test type
  const toggleHistory = (testType: string) => {
    setGroupedLabResults(prev =>
      prev.map(group =>
        group.testType === testType
          ? { ...group, showHistory: !group.showHistory }
          : group
      )
    )
  }

  // Open edit dialog for a specific test result
  const openEditDialog = (testType: string, categoryName: string, testName: string, currentValues: any) => {
    setEditingResult({
      testType,
      categoryName,
      testName,
      currentValues
    })
  }

  // Close edit dialog
  const closeEditDialog = () => {
    setEditingResult(null)
  }

  // Save edited test result
  const saveEditedResult = (updatedValues: any) => {
    if (!editingResult) return

    setGroupedLabResults(prev =>
      prev.map(group => {
        if (group.testType === editingResult.testType) {
          const updatedLatest = {
            ...group.latestReport,
            categories: group.latestReport.categories.map(category => {
              if (category.categoryName === editingResult.categoryName) {
                return {
                  ...category,
                  tests: category.tests.map(test => {
                    if (test.testName === editingResult.testName) {
                      // Merge user edits
                      const merged = { ...test, ...updatedValues }
                      // Recalculate status if numeric fields changed
                      const numValue = parseFloat(String(merged.value))
                      const numLow = merged.referenceLow === 'N/A' ? null : parseFloat(String(merged.referenceLow))
                      const numHigh = merged.referenceHigh === 'N/A' ? null : parseFloat(String(merged.referenceHigh))
                      if (!isNaN(numValue) && (numLow !== null || (numHigh !== null && !isNaN(numHigh)))) {
                        merged.status = getHealthStatus(
                          numValue,
                          numLow === null || isNaN(Number(numLow)) ? null : Number(numLow),
                          numHigh === null || isNaN(Number(numHigh)) ? 0 : Number(numHigh)
                        )
                      }
                      return { ...merged, isEditing: false }
                    }
                    return test
                  })
                }
              }
              return category
            })
          }
          return {
            ...group,
            latestReport: updatedLatest
          }
        }
        return group
      })
    )

    closeEditDialog()
  }

  // Remove lab result
  const removeLabResult = (testId: string) => {
    setLabResults(prev => {
      const updatedResults = prev.map(category => ({
        ...category,
        tests: category.tests.filter(test => test.id !== testId)
      })).filter(category => category.tests.length > 0)
      
      // Data is now persisted in PostgreSQL, no localStorage needed
      
      return updatedResults
    })
  }

  // Clear all lab results
  const clearAllLabResults = () => {
    if (window.confirm('Are you sure you want to clear all AI-generated lab results? This action cannot be undone.')) {
      setLabResults([])
      setNewResultsAdded(false)
      
      // Data is now persisted in PostgreSQL, no localStorage needed
    }
  }

  // Handle file download
  const handleFileDownload = (file: any) => {
    try {
      // Create a temporary link to download the file
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file. Please try again.');
    }
  }

  // Handle file viewing (for images and PDFs)
  const handleFileView = (file: any) => {
    try {
      if (file.type.startsWith('image/')) {
        // Show image preview in modal
        setPreviewFile({ url: file.url, name: file.name, type: file.type });
      } else {
        // Open PDF or other files in new tab
        window.open(file.url, '_blank');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      alert('Error viewing file. Please try again.');
    }
  }

  // Medical records data - now empty, will be populated from database
  const medicalRecords: any[] = []

  const labReports: any[] = []

  // Helper function to convert database format (lab_report) to frontend format (lab-reports)
  const normalizeCategoryForDisplay = (category: string): string => {
    if (!category) return category
    // Convert database format (underscores) to frontend format (hyphens)
    const normalized = category.replace(/_/g, '-')
    // Handle special case: lab_report -> lab-reports (with 's')
    if (normalized === 'lab-report') {
      return 'lab-reports'
    }
    return normalized
  }

  const getCategoryIcon = (category: string) => {
    // Normalize category from database format to frontend format
    const normalizedCategory = normalizeCategoryForDisplay(category)
    
    // Find the category in fileCategories array
    const categoryData = fileCategories.find(cat => cat.value === normalizedCategory)
    if (categoryData) {
      const IconComponent = categoryData.icon
      return <IconComponent className="w-4 h-4" />
    }
    
    // Fallback for legacy categories
    switch (category) {
      case "cardiology":
        return <Heart className="w-4 h-4" />
      case "neurology":
        return <Brain className="w-4 h-4" />
      case "dental":
        return <Stethoscope className="w-4 h-4" />
      default:
        return <Activity className="w-4 h-4" />
    }
  }

  const getRecordStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "normal":
        return "bg-green-100 text-green-700"
      case "attention":
        return "bg-yellow-100 text-yellow-700"
      case "critical":
        return "bg-red-100 text-red-700"
      case "completed":
        return "bg-blue-100 text-blue-700"
      default:
        return "bg-gray-100 text-gray-700"
    }
  }

  const handleAddLabReport = async () => {
    const healthMetrics = {
      bloodCount: labReport.bloodCount,
      hemoglobin: labReport.hemoglobin,
      heartRate: "72",
      lastUpdated: new Date().toISOString()
    }
      // Data is now persisted in PostgreSQL, no localStorage needed
    
    setLabReport({
      testDate: "",
      bloodCount: "",
      hemoglobin: "",
      whiteBloodCells: "",
      platelets: "",
      cholesterol: "",
      bloodSugar: "",
      notes: ""
    })
    setLabUploadDialogOpen(false)
    
    alert('Lab report uploaded successfully! Your dashboard metrics have been updated.')
  }

  // OCR Processing Functions (only run when libraries are loaded)
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && (file.type.match('image.*') || file.type === 'application/pdf')) {
      setOcrFile(file)
      setImageUrls([])
      setNumOfPages(0)
    } else {
      alert('Please upload image files (PNG, JPEG) or PDF files')
    }
  }

  const removeFile = () => {
    setOcrFile(null)
    setExtractedText("")
    setOcrProgress(0)
  }

  const processOCR = async () => {
    if (!ocrFile || !Tesseract) return

    setIsProcessing(true)
    setOcrProgress(0)

    try {
      const isImage = ocrFile?.type.match('image.*')
      
      if (isImage) {
        await processImageOCR(ocrFile)
      } else if (ocrFile?.type === 'application/pdf') {
        if (!pdfjs) {
          alert('PDF processing is currently unavailable. Please upload image files (PNG, JPEG) instead.')
          return
        }
        await processPDFOCR(ocrFile)
      } else {
        throw new Error('Unsupported file type')
      }
    } catch (error) {
      console.error('OCR processing error:', error)
      if (error instanceof Error && error.message.includes('PDF processing is currently unavailable')) {
        alert(error.message)
      } else {
        alert('Error processing file. Please try again.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const processImageOCR = async (imageFile: File) => {
    if (!Tesseract) {
      throw new Error('OCR library not loaded');
    }

    try {
      setOcrProgress(10)
      
      const result = await Tesseract.recognize(
        imageFile,
        'eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(10 + (m.progress * 80))
            }
          }
        }
      )

      setOcrProgress(90)
      
      const extractedText = result.data.text
      console.log('🧪 [OCR:image] file:', imageFile?.name, 'mime:', imageFile?.type, 'chars:', extractedText?.length ?? 0)
      if (extractedText) {
        console.log('🧪 [OCR:image] preview:', extractedText.slice(0, 300))
      }
      setExtractedText(extractedText)
      
      try {
        const aiData = await processLabReportWithAI(extractedText)
        await processExtractedText(aiData)
      } catch (aiError) {
        console.error('❌ AI processing failed, using fallback:', aiError)
        await processExtractedText(extractedText)
      }
      
      setOcrProgress(100)
    } catch (error) {
      console.error('Image OCR error:', error)
      throw error
    }
  }

  // PDF Processing Functions
  const readPdfPage = async (pdfPage: any) => {
    // Only run on client side
    if (typeof window === 'undefined') {
      throw new Error('Canvas not available on server side');
    }
    
    const canvas = document.createElement('canvas')
    canvas.setAttribute('className', 'canv')
    const viewport = pdfPage.getViewport({ scale: 1.5 })
    canvas.height = viewport.height
    canvas.width = viewport.width
    const renderContext = {
      canvasContext: canvas.getContext('2d'),
      viewport,
    }
    const { promise } = pdfPage.render(renderContext)
    await promise
    return canvas.toDataURL('image/png')
  }

  const convertPDFToImages = async (data: ArrayBuffer) => {
    // Only run on client side
    if (typeof window === 'undefined') {
      throw new Error('Canvas not available on server side');
    }
    
    if (!pdfjs) {
      throw new Error('PDF library not loaded');
    }

    const canvas = document.createElement('canvas')
    canvas.setAttribute('className', 'canv')
    const pdf = await pdfjs.getDocument({ data }).promise

    const pages = new Array(pdf.numPages).fill(0).map((_v, idx) => idx + 1)

    const imagesList = await Promise.all(
      pages.map(async (pageIndex) => {
        const page = await pdf.getPage(pageIndex)
        return readPdfPage(page)
      })
    )

    setNumOfPages(pdf.numPages)
    setImageUrls(imagesList)
    return imagesList
  }

  const processPDFOCR = async (pdfFile: File) => {
    if (!Tesseract) {
      throw new Error('OCR library not loaded');
    }

    if (!pdfjs) {
      throw new Error('PDF processing is currently unavailable. Please upload image files instead.');
    }

    try {
      setOcrProgress(10)
      
      const arrayBuffer = await pdfFile.arrayBuffer()
      setOcrProgress(20)
      
      try {
        const imagesList = await convertPDFToImages(arrayBuffer)
        console.log('🧪 [PDF] pages to OCR:', imagesList?.length ?? 0, 'file:', pdfFile?.name)
        setOcrProgress(50)
        
        let allText = ""
        const pageTexts: string[] = []
        for (let i = 0; i < imagesList.length; i++) {
          setOcrProgress(50 + (i / imagesList.length) * 40)
          
          try {
            const result = await Tesseract.recognize(imagesList[i], 'eng')
            allText += `\n--- Page ${i + 1} ---\n${result.data.text}\n`
            console.log(`🧪 [OCR:pdf] page ${i + 1}/${imagesList.length} chars:`, result?.data?.text?.length ?? 0)
            if (result?.data?.text) {
              console.log('🧪 [OCR:pdf] page preview:', result.data.text.slice(0, 200))
            }
            pageTexts.push(result?.data?.text || '')
          } catch (pageError) {
            console.error(`Error processing page ${i + 1}:`, pageError)
          }
        }
        
        setOcrProgress(90)
        setExtractedText(allText)
        console.log('🧪 [OCR:pdf] total chars:', allText?.length ?? 0)
        
        try {
          // Prefer per-page AI processing on server and merge there
          const headers = await getAuthHeaders()
          const aiResp = await fetch('/api/medical-records', {
            method: 'POST',
            headers,
            body: JSON.stringify({ pageTexts, recordType: 'lab_report', title: pdfFile.name })
          })
          if (!aiResp.ok) throw new Error(`AI server error: ${aiResp.status}`)
          const aiJson = await aiResp.json()
          await processExtractedText(aiJson.data)
        } catch (aiError) {
          console.error('❌ Claude 3 processing failed, using fallback:', aiError)
          await processExtractedText(allText)
        }
        
        setOcrProgress(100)
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError)
        throw new Error('Failed to process PDF. Please ensure the file is not corrupted.')
      }
    } catch (error) {
      console.error('PDF OCR error:', error)
      throw error
    }
  }

  const processExtractedText = async (textOrData: string | any) => {
    
    if (typeof textOrData === 'string') {
      const bloodCountMatch = textOrData.match(/White Blood Cell.*?(\d+\.?\d*)/i)
      const hemoglobinMatch = textOrData.match(/Hemoglobin.*?(\d+\.?\d*)/i)
      const plateletsMatch = textOrData.match(/Platelet.*?(\d+\.?\d*)/i)
      const cholesterolMatch = textOrData.match(/Cholesterol.*?(\d+\.?\d*)/i)
      const glucoseMatch = textOrData.match(/Glucose|Blood Sugar.*?(\d+\.?\d*)/i)

      if (bloodCountMatch || hemoglobinMatch || plateletsMatch) {
        setLabReport(prev => ({
          ...prev,
          testDate: new Date().toISOString().split('T')[0],
          bloodCount: bloodCountMatch ? bloodCountMatch[1] : prev.bloodCount,
          hemoglobin: hemoglobinMatch ? hemoglobinMatch[1] : prev.hemoglobin,
          platelets: plateletsMatch ? plateletsMatch[1] : prev.platelets,
          cholesterol: cholesterolMatch ? cholesterolMatch[1] : prev.cholesterol,
          bloodSugar: glucoseMatch ? glucoseMatch[1] : prev.bloodSugar,
          notes: "Extracted from OCR processing"
        }))
      } else {
      }
    } else {
      
      if (textOrData.categories && Array.isArray(textOrData.categories)) {
        processCategorizedLabData(textOrData.categories);
      } else {
        setLabReport(prev => ({
          ...prev,
          testDate: textOrData.testDate || new Date().toISOString().split('T')[0],
          bloodCount: textOrData.bloodCount || prev.bloodCount,
          hemoglobin: textOrData.hemoglobin || prev.hemoglobin,
          whiteBloodCells: textOrData.whiteBloodCells || prev.whiteBloodCells,
          platelets: textOrData.platelets || prev.platelets,
          cholesterol: textOrData.cholesterol || prev.cholesterol,
          bloodSugar: textOrData.bloodSugar || prev.bloodSugar,
          notes: textOrData.notes || "Extracted from AI processing"
        }))
      }
    }
  }

  const processCategorizedLabData = (categories: Array<{
    categoryName: string
    tests: Array<{
      testName: string
      value: string
      unit: string
      referenceLow: string
      referenceHigh: string
      status: 'normal' | 'high' | 'low' | 'critical'
    }>
  }>) => {
    
    const newLabResults = categories.map((category, categoryIndex) => {
      
      const tests = category.tests.map((test, testIndex) => {
        return {
          id: `test-${Date.now()}-${categoryIndex}-${testIndex}`,
          testName: test.testName,
          value: test.value,
          unit: test.unit,
          referenceLow: test.referenceLow,
          referenceHigh: test.referenceHigh,
          status: test.status,
          isEditing: false
        }
      })

      return {
        id: `category-${Date.now()}-${categoryIndex}`,
        categoryName: category.categoryName,
        tests
      }
    })

    setLabResults(prev => {
      const updatedResults = [...prev, ...newLabResults];
      
      // Data is now persisted in PostgreSQL, no localStorage needed
      
      return updatedResults;
    });
    setNewResultsAdded(true);
  }

  // File upload functions
  const handleFileUpload = async (files: FileList | null) => {
    
    if (!files || files.length === 0) {
      return
    }

    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      if (!file.type.match(/^(image\/|application\/pdf)/)) {
        alert(`File ${file.name} is not supported. Please upload PDF, JPG, or PNG files only.`)
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setPendingFiles(validFiles)
    setShowCategoryDialog(true)
  }

  // HIPAA compliant file upload
  const uploadFileToHIPAA = async (file: File, category: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'medical-records');
    formData.append('classification', 'phi'); // Medical records are PHI
    formData.append('makePublic', 'false'); // Keep private

    // Get Firebase ID token for authentication
    const user = auth.currentUser;
    let authHeader: Record<string, string> = {};
    
    if (user) {
      try {
        const idToken = await user.getIdToken();
        authHeader['Authorization'] = `Bearer ${idToken}`;
      } catch (tokenError) {
        console.warn('Failed to get ID token:', tokenError);
      }
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: authHeader,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data;
  }

  const processFilesWithCategory = async () => {
    if (!selectedCategory || pendingFiles.length === 0) return

    setIsUploading(true)
    setUploadProgress(0)

    // Get user information from Firebase auth
    const user = auth.currentUser
    const userName = user?.displayName || user?.email?.split('@')[0] || 'User'
    const userEmail = user?.email || ''

    try {
      const totalFiles = pendingFiles.length
      let processedFiles = 0
      const successfullyUploadedFiles: Array<{
        id: string
        name: string
        size: number
        type: string
        uploadDate: string
        url: string
        category: string
        status: string
        processed: boolean
        uploadResult: any
      }> = []

      for (let fileIndex = 0; fileIndex < pendingFiles.length; fileIndex++) {
        const file = pendingFiles[fileIndex]
        try {
          // Update progress: starting upload
          const baseProgress = (fileIndex / totalFiles) * 100
          setUploadProgress(baseProgress + 5)
          
          // Upload to HIPAA compliant system
          const uploadResult = await uploadFileToHIPAA(file, selectedCategory)
          
          // Update progress: file uploaded
          setUploadProgress(baseProgress + 30)
          
          // Extract text from file using OCR (for images) or PDF extraction
              // Only process with AI if "AI Lab Report" category is selected
          let extractedText = ''
          let pageTexts: string[] = []
          let aiProcessed = false
          let aiCategoriesFromResponse: any[] | null = null
          
          if (selectedCategory === 'ai-lab-report') {
            try {
              // Update progress: starting OCR/AI processing
              const baseProgress = (fileIndex / totalFiles) * 100
              setUploadProgress(baseProgress + 50)
              
              if (file.type.startsWith('image/')) {
                // Process image with OCR
                if (Tesseract) {
                  const ocrResult = await Tesseract.recognize(file, 'eng', {
                    logger: (m: any) => {
                      // OCR progress logging removed
                    }
                  })
                  extractedText = ocrResult.data.text
                  console.log('🧪 [Batch OCR:image] file:', file.name, 'chars:', extractedText?.length ?? 0)
                  if (extractedText) {
                    console.log('🧪 [Batch OCR:image] preview:', extractedText.slice(0, 200))
                  }
                }
              } else if (file.type === 'application/pdf') {
                // For PDF, convert pages to images and process with OCR - keep pages separate
                if (pdfjs && Tesseract) {
                  try {
                    const arrayBuffer = await file.arrayBuffer()
                    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
                    const numPages = pdf.numPages
                    console.log('🧪 [Batch PDF] pages to OCR:', numPages, 'file:', file.name)
                    
                    const pdfPageTexts: string[] = []
                    for (let i = 1; i <= numPages; i++) {
                      const page = await pdf.getPage(i)
                      const canvas = document.createElement('canvas')
                      const viewport = page.getViewport({ scale: 1.5 })
                      canvas.height = viewport.height
                      canvas.width = viewport.width
                      
                      const context = canvas.getContext('2d')
                      await page.render({ canvasContext: context!, viewport }).promise
                      
                      // Convert canvas to image data for OCR
                      const imageData = canvas.toDataURL('image/png')
                      const ocrResult = await Tesseract.recognize(imageData, 'eng')
                      const pageText = ocrResult.data.text
                      pdfPageTexts.push(pageText)
                    }
                    pageTexts = pdfPageTexts
                    extractedText = pdfPageTexts.join('\n--- Page Break ---\n')
                  } catch (pdfError) {
                    // Continue without text extraction
                  }
                }
              }

              // If we extracted text, process with AI (Bedrock Claude)
              if ((extractedText && extractedText.trim().length > 10) || (pageTexts.length > 0)) {
                // Update progress: AI processing
                const baseProgress = (fileIndex / totalFiles) * 100
                setUploadProgress(baseProgress + 80)
                console.log('🧪 [Batch AI] text length to POST:', extractedText.length)
                
                const authHeaders = await getAuthHeaders()
                const requestBody: any = {
                  fileId: uploadResult.fileId,
                  recordType: 'lab_report', // Use normalized recordType for AI processing
                  title: file.name
                }
                
                // Use pageTexts if available (for PDF), otherwise use text (for images)
                if (pageTexts.length > 0) {
                  requestBody.pageTexts = pageTexts
                } else {
                  requestBody.text = extractedText
                }
                
                const aiResponse = await fetch('/api/medical-records', {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify(requestBody),
                })

                if (aiResponse.ok) {
                  console.log('🧪 [Batch AI] OK for', file.name)
                  aiProcessed = true
                  try {
                    const aiJson = await aiResponse.json()
                    if (aiJson?.data?.categories && Array.isArray(aiJson.data.categories)) {
                      aiCategoriesFromResponse = aiJson.data.categories
                    }
                  } catch (e) {
                    console.warn('Could not parse AI JSON:', e)
                  }
                }
              }
            } catch (ocrError) {
              // Continue even if OCR/AI fails - file is still uploaded
            }
          }
          
          const newFile = {
            id: uploadResult.fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            uploadDate: new Date().toISOString(),
            url: getImageUrl({
              id: uploadResult.fileId!,
              objectKey: uploadResult.key,
              classification: 'phi'
            }),
            category: selectedCategory,
            status: 'uploaded',
            processed: aiProcessed,
            uploadResult: uploadResult,
            aiCategories: aiCategoriesFromResponse || undefined
          }

          successfullyUploadedFiles.push(newFile)
          setUploadedFiles(prev => {
            const next = [...prev, newFile]
            // If we already have categories for this file, update grouped view immediately
            try {
              if (newFile.aiCategories && Array.isArray(newFile.aiCategories) && newFile.aiCategories.length > 0) {
                groupLabResultsByTestType(next)
              }
            } catch (e) {
              console.warn('Incremental update failed:', e)
            }
            return next
          })
          // Also push AI categories into labResults immediately to keep the badge/count in sync
          if (aiCategoriesFromResponse && Array.isArray(aiCategoriesFromResponse) && aiCategoriesFromResponse.length > 0) {
            try {
              const mapped = aiCategoriesFromResponse.map((category: any, categoryIndex: number) => {
                const tests = (category.tests || []).map((test: any, testIndex: number) => ({
                  id: `${uploadResult.fileId}-category-${categoryIndex}-test-${testIndex}`,
                  testName: test.testName || 'Unknown Test',
                  value: test.value || 'N/A',
                  unit: test.unit || '',
                  referenceLow: test.referenceLow || 'N/A',
                  referenceHigh: test.referenceHigh || 'N/A',
                  status: test.status || 'normal',
                  isEditing: false
                }))
                return {
                  id: `${uploadResult.fileId}-category-${categoryIndex}`,
                  categoryName: category.categoryName || 'Unknown Category',
                  tests
                }
              })
              setLabResults(prev => [...prev, ...mapped])
            } catch (e) {
              console.warn('Failed to append categories:', e)
            }
          }

          processedFiles++
          // Update progress: file completed
          setUploadProgress((processedFiles / totalFiles) * 100)
        } catch (error) {
          toast({
            title: "Upload Failed",
            description: `Failed to upload ${file.name}. Please try again.`,
            variant: "destructive",
          })
        }
      }

      // Send medical record upload notification for successfully uploaded files
      for (const file of successfullyUploadedFiles) {
        try {
          const uploadData = {
            userName: userName,
            userEmail: userEmail,
            patientName: userName,
            patientEmail: userEmail,
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            uploadDate: file.uploadDate,
            fileId: file.id,
            file: { 
              objectKey: file.uploadResult.key, 
              fileName: file.name, 
              mimeType: file.type, 
              bucket: 'medical-tourism-images' 
            },
            referenceId: 'N/A',
            category: selectedCategory
          }

          const authHeaders = await getAuthHeaders()
          const response = await fetch('/api/notifications/medical-record', {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(uploadData),
          })

          // Notification is non-critical - always handle gracefully
          if (!response.ok) {
            try {
              const errorData = await response.json()
              // Silently handle notification errors - they're non-critical
              // Only log in development
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to send medical record upload notification:', errorData)
              }
            } catch (parseError) {
              // If JSON parsing fails, just ignore - notification is non-critical
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to parse notification error response:', parseError)
              }
            }
          }
        } catch (error) {
          // Silently handle notification errors - they're non-critical
          // Notification failures should NEVER affect medical record saving
          // Only log in development
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error sending medical record upload notification:', error)
          }
        }
      }

      // Reload medical records to show newly uploaded files
      try {
        const authHeaders = await getAuthHeaders()
        const response = await fetch('/api/medical-records', {
          headers: authHeaders
        })
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            // Convert PostgreSQL data to UI format (same logic as initial load)
            const files = result.data.map((record: any) => {
              // Parse AI results from notes if available
              let aiCategories = null
              if (record.notes) {
                try {
                  const parsedNotes = JSON.parse(record.notes)
                  if (parsedNotes.categories && Array.isArray(parsedNotes.categories)) {
                    aiCategories = parsedNotes.categories
                  }
                } catch (e) {
                  console.warn('Failed to parse AI results from notes:', e)
                }
              }
              
              // Normalize category from database format (lab_report) to frontend format (lab-reports)
              const normalizedCategory = normalizeCategoryForDisplay(record.recordType)
              
              const fileData = {
                id: record.file?.id || record.id,
                name: record.file?.fileName || record.title || 'Medical Record',
                size: record.file?.fileSize || 0,
                type: record.file?.mimeType || 'application/pdf',
                uploadDate: record.uploadedAt,
                url: record.file ? getImageUrl({
                  id: record.file.id,
                  objectKey: record.file.objectKey,
                  classification: record.file.classification || 'phi' // Use classification from API, default to 'phi'
                }) : '',
                category: normalizedCategory,
                status: 'uploaded',
                processed: !!record.notes,
                aiCategories: aiCategories // Store parsed categories for display
              }


              return fileData
            })
            setUploadedFiles(files)
            
            // Load AI categories into labResults state for Lab Reports tab display (legacy)
            const allLabResults: Array<{
              id: string
              categoryName: string
              tests: Array<{
                id: string
                testName: string
                value: string
                unit: string
                referenceLow: string
                referenceHigh: string
                status: 'normal' | 'high' | 'low' | 'critical'
                isEditing: boolean
              }>
            }> = []
            
            files.forEach((file: any) => {
              if (file.aiCategories && Array.isArray(file.aiCategories) && file.aiCategories.length > 0) {
                file.aiCategories.forEach((category: any, categoryIndex: number) => {
                  const categoryId = `${file.id}-category-${categoryIndex}`
                  const tests = (category.tests || []).map((test: any, testIndex: number) => ({
                    id: `${categoryId}-test-${testIndex}`,
                    testName: test.testName || 'Unknown Test',
                    value: test.value || 'N/A',
                    unit: test.unit || '',
                    referenceLow: test.referenceLow || 'N/A',
                    referenceHigh: test.referenceHigh || 'N/A',
                    status: test.status || 'normal',
                    isEditing: false
                  }))
                  
                  allLabResults.push({
                    id: categoryId,
                    categoryName: category.categoryName || 'Unknown Category',
                    tests: tests
                  })
                })
              }
            })
            
            // Update labResults state with all AI-processed categories
            setLabResults(allLabResults)
            // Also update groupedLabResults for the Lab Reports tab (latest + history view)
            try {
              groupLabResultsByTestType(files)
            } catch (e) {
              console.warn('Failed to group lab results:', e)
            }
          }
        }
      } catch (error) {
        console.error('Error reloading medical records:', error)
      }

      const categoryLabel = fileCategories.find(cat => cat.value === selectedCategory)?.label || selectedCategory
      
      // Only show AI processing message for AI Lab Report category
      const aiProcessedCount = selectedCategory === 'ai-lab-report' 
        ? successfullyUploadedFiles.filter(f => f.processed).length 
        : 0
      const aiMessage = aiProcessedCount > 0 
        ? ` ${aiProcessedCount} file(s) have been processed with AI for analysis.`
        : selectedCategory === 'ai-lab-report'
        ? ' Files uploaded. AI processing will analyze the content.'
        : ''
      
      toast({
        title: "Upload Successful",
        description: `Successfully uploaded ${processedFiles} file(s) to ${categoryLabel}! Files are now HIPAA compliant.${aiMessage}`,
        variant: "default",
      })
      
      setPendingFiles([])
      setSelectedCategory('')
      setShowCategoryDialog(false)
    } catch (error) {
      console.error('File upload error:', error)
      toast({
        title: "Upload Failed",
        description: 'Error uploading files. Please try again.',
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Only run on client side
      if (typeof window === 'undefined') {
        reject(new Error('FileReader not available on server side'));
        return;
      }
      
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }


  // Load medical records from PostgreSQL (no localStorage)
  useEffect(() => {
    const loadMedicalRecords = async () => {
      try {
        const authHeaders = await getAuthHeaders()
        const response = await fetch('/api/medical-records', {
          headers: authHeaders
        })
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            // Convert PostgreSQL data to UI format
            const files = result.data.map((record: any) => {
              // Parse AI results from notes if available
              let aiCategories = null
              if (record.notes) {
                try {
                  const parsedNotes = JSON.parse(record.notes)
                  if (parsedNotes.categories && Array.isArray(parsedNotes.categories)) {
                    aiCategories = parsedNotes.categories
                  }
                } catch (e) {
                  console.warn('Failed to parse AI results from notes:', e)
                }
              }
              
              // Normalize category from database format (lab_report) to frontend format (lab-reports)
              const normalizedCategory = normalizeCategoryForDisplay(record.recordType)
              
              const fileData = {
                id: record.file?.id || record.id,
                name: record.file?.fileName || record.title || 'Medical Record',
                size: record.file?.fileSize || 0,
                type: record.file?.mimeType || 'application/pdf',
                uploadDate: record.uploadedAt,
                url: record.file ? getImageUrl({
                  id: record.file.id,
                  objectKey: record.file.objectKey,
                  classification: record.file.classification || 'phi' // Use classification from API, default to 'phi'
                }) : '',
                category: normalizedCategory,
                status: 'uploaded',
                processed: !!record.notes,
                aiCategories: aiCategories // Store parsed categories for display
              }


              return fileData
            })
            setUploadedFiles(files)
            
            // Load AI categories into labResults state for Lab Reports tab display
            const allLabResults: Array<{
              id: string
              categoryName: string
              tests: Array<{
                id: string
                testName: string
                value: string
                unit: string
                referenceLow: string
                referenceHigh: string
                status: 'normal' | 'high' | 'low' | 'critical'
                isEditing: boolean
              }>
            }> = []
            
            files.forEach((file: any) => {
              if (file.aiCategories && Array.isArray(file.aiCategories) && file.aiCategories.length > 0) {
                file.aiCategories.forEach((category: any, categoryIndex: number) => {
                  const categoryId = `${file.id}-category-${categoryIndex}`
                  const tests = (category.tests || []).map((test: any, testIndex: number) => ({
                    id: `${categoryId}-test-${testIndex}`,
                    testName: test.testName || 'Unknown Test',
                    value: test.value || 'N/A',
                    unit: test.unit || '',
                    referenceLow: test.referenceLow || 'N/A',
                    referenceHigh: test.referenceHigh || 'N/A',
                    status: test.status || 'normal',
                    isEditing: false
                  }))
                  
                  allLabResults.push({
                    id: categoryId,
                    categoryName: category.categoryName || 'Unknown Category',
                    tests: tests
                  })
                })
              }
            })
            
            if (allLabResults.length > 0) {
              setLabResults(allLabResults)
              console.log(`✅ Loaded ${allLabResults.length} lab result categories from database`)
            }

            // Group lab results by test type for deduplication
            groupLabResultsByTestType(files)
          }
        }
      } catch (error) {
        console.error('Error loading medical records:', error)
      }
    }

    loadMedicalRecords()
  }, [])

  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ open: boolean; fileId: string | null; fileName: string }>({
    open: false,
    fileId: null,
    fileName: ''
  })

  const deleteFile = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId)
    if (!file) return

    // Show confirmation dialog
    setDeleteConfirmDialog({
      open: true,
      fileId: fileId,
      fileName: file.name
    })
  }

  const confirmDelete = async () => {
    const { fileId } = deleteConfirmDialog
    if (!fileId) return

    try {
      // Delete from database via API
      const authHeaders = await getAuthHeaders()
      const response = await fetch(`/api/medical-records?fileId=${fileId}`, {
        method: 'DELETE',
        headers: authHeaders
      })

      if (response.ok) {
        // Remove from UI state
        setUploadedFiles(prev => {
          const updatedFiles = prev.filter(file => file.id !== fileId)
          return updatedFiles
        })
        
        // Remove related lab results if this file had AI processing
        setLabResults(prev => {
          // Filter out lab results that match this fileId
          return prev.filter(category => {
            // Category ID format: `${file.id}-category-${categoryIndex}`
            const fileIdFromCategoryId = category.id.split('-category-')[0]
            return fileIdFromCategoryId !== fileId
          })
        })
        
        toast({
          title: "File Deleted",
          description: "Medical record has been deleted successfully.",
          variant: "default",
        })
      } else {
        const errorData = await response.json()
        toast({
          title: "Delete Failed",
          description: errorData.error || "Failed to delete medical record. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "An error occurred while deleting the file. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleteConfirmDialog({ open: false, fileId: null, fileName: '' })
    }
  }

  // Process uploaded file with AI
  const processFileWithAI = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId)
    if (!file) return

    try {
      setIsProcessing(true)
      
      // Convert base64 back to text if it's a text file, or use OCR for images/PDFs
      let extractedText = ""
      
      if (file.type.startsWith('text/') || file.type === 'application/pdf') {
        // For text files, decode base64
        if (file.type.startsWith('text/')) {
          extractedText = atob(file.url.split(',')[1])
        } else {
          // For PDFs, we need to process them with OCR first
          // This would require converting the base64 back to a file and processing
          alert('PDF processing requires OCR. Please use the Lab Report Upload feature for PDFs.')
          return
        }
      } else if (file.type.startsWith('image/')) {
        // For images, we need to process with OCR first, then AI
        try {
          // Convert base64 to blob for OCR processing
          const response = await fetch(file.url)
          const blob = await response.blob()
          const imageFile = Object.assign(blob, { name: file.name, type: file.type })
          
          // Process with OCR
          const result = await Tesseract.recognize(imageFile, 'eng')
          extractedText = result.data.text
          
          // Process extracted text with AI
          const aiData = await processLabReportWithAI(extractedText)
          await processExtractedText(aiData)
          
          // Update file status
          setUploadedFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, status: 'processed', processed: true } : f
          ))
          
          alert('File processed successfully with AI!')
        } catch (aiError) {
          console.error('AI processing failed:', aiError)
          alert('AI processing failed. Please try again.')
        }
      } else {
        alert('Unsupported file type for AI processing.')
        return
      }
    } catch (error) {
      console.error('File processing error:', error)
      alert('Error processing file. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Show loading state while libraries are loading
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingIcon size="medium" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading medical records...</p>
        </div>
      </div>
    );
  }

  // Your existing JSX - copy the entire return statement from your original file
  return (
    <div className="space-y-6">
            {/* Header */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Medical Records</h1>
          <p className="text-gray-600 mt-1">Access and manage your medical history and documents</p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-3">
          {/* Date Filter */}
          {uploadedFiles.length > 0 && (
            <Select value={selectedDate || "all"} onValueChange={(value) => setSelectedDate(value === "all" ? "" : value)}>
              <SelectTrigger className="w-[180px] sm:w-[200px]">
                <SelectValue placeholder="All Dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                {(() => {
                  // Extract unique dates from uploadedFiles
                  const uniqueDates = Array.from(
                    new Set(
                      uploadedFiles.map(file => {
                        const date = new Date(file.uploadDate)
                        return date.toISOString().split('T')[0] // YYYY-MM-DD format
                      })
                    )
                  )
                  // Sort dates from newest to oldest
                  uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                  
                  return uniqueDates.map(date => {
                    const formattedDate = new Date(date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                    return (
                      <SelectItem key={date} value={date}>
                        {formattedDate}
                      </SelectItem>
                    )
                  })
                })()}
              </SelectContent>
            </Select>
          )}
          <Button 
            className="bg-wellness-blue-light px-6 py-2 text-sm sm:text-base"
            onClick={() => {
              setAiLabReportOnly(false)
              setShowCategoryDialog(true)
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      <Tabs defaultValue="records" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="records" className="flex items-center space-x-2">
            <FileText className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">All Records</span>
            {uploadedFiles.length > 0 && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">
                {uploadedFiles.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="lab-reports" className="flex items-center space-x-2">
            <Activity className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Lab Reports</span>
            {labResults.length > 0 && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">
                {labResults.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center space-x-2">
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload Documents</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-4">
          {/* Summary Section */}
          <div className="bg-white/80 backdrop-blur-sm border-2 border-gray-200 rounded-xl p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Records Summary</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  {(() => {
                    // Filter files based on selected date
                    const filteredFiles = selectedDate 
                      ? uploadedFiles.filter(file => {
                          const fileDate = new Date(file.uploadDate).toISOString().split('T')[0]
                          return fileDate === selectedDate
                        })
                      : uploadedFiles
                    return `${filteredFiles.length} uploaded document${filteredFiles.length !== 1 ? 's' : ''} • ${medicalRecords.length} legacy record${medicalRecords.length !== 1 ? 's' : ''}`
                  })()}
                </p>
              </div>
              <div className="flex items-center space-x-3 sm:space-x-4 text-xs sm:text-sm text-gray-600">
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-500 rounded-full"></div>
                  <span>Uploaded ({(() => {
                    const filteredFiles = selectedDate 
                      ? uploadedFiles.filter(file => {
                          const fileDate = new Date(file.uploadDate).toISOString().split('T')[0]
                          return fileDate === selectedDate
                        })
                      : uploadedFiles
                    return filteredFiles.length
                  })()})</span>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-gray-500 rounded-full"></div>
                  <span>Legacy ({medicalRecords.length})</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Uploaded Documents */}
            {(() => {
              // Filter files based on selected date
              const filteredFiles = selectedDate 
                ? uploadedFiles.filter(file => {
                    const fileDate = new Date(file.uploadDate).toISOString().split('T')[0]
                    return fileDate === selectedDate
                  })
                : uploadedFiles
              
              if (filteredFiles.length === 0) {
                return (
                  <div className="col-span-full text-center py-12">
                    <FileQuestion className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">
                      {selectedDate ? 'No records found for the selected date.' : 'No records uploaded yet.'}
                    </p>
                  </div>
                )
              }
              
              return filteredFiles.map((file) => (
              <Card
                key={file.id}
                className="bg-white/80 rounded-lg backdrop-blur-sm border-2 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getCategoryIcon(file.category)}
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Uploaded</Badge>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileView(file);
                        }}
                        title="View file"
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileDownload(file);
                        }}
                        title="Download file"
                        className="h-8 w-8 p-0"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(file.id);
                        }}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base truncate">{file.name}</h3>
                  <p className="text-xs text-gray-600 mb-2">{file.type}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(file.uploadDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <File className="w-3 h-3" />
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">{fileCategories.find(cat => cat.value === file.category)?.label || 'Document'}</span>
                    <FileText className="w-3 h-3 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
              ))
            })()}
            
            {/* Legacy Medical Records */}
            {medicalRecords.map((record) => (
              <Card
                key={record.id}
                className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer rounded-lg"
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getCategoryIcon(record.category)}
                      <Badge className={`${getRecordStatusColor(record.status)} text-xs`}>{record.status}</Badge>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base truncate">{record.title}</h3>
                  <p className="text-xs text-gray-600 mb-2">{record.type}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(record.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span>{record.doctor}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">{record.file}</span>
                    <FileText className="w-3 h-3 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="lab-reports" className="space-y-4">
          {/* AI Lab Report Upload Card */}
          <Card className="bg-white  border-2 rounded-xl border-wellness-blue-medium">
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="w-24 h-24 rounded-xl flex items-center justify-center">
                  <Image
                    src="/meddyAi.jpeg"
                    alt="Meddy AI"
                    width={24}
                    height={24}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">AI Lab Report Analysis</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Upload your lab reports and get instant AI-powered analysis and insights about your health metrics.
                  </p>
                  <Button
                    variant="outline"
                    className="border-wellness-blue-medium text-wellness-blue-primary hover:bg-wellness-blue-pale bg-transparent"
                    onClick={() => {
                      setAiLabReportOnly(true)
                      setSelectedCategory('ai-lab-report')
                      setShowCategoryDialog(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Upload Lab Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grouped Lab Results by Test Type - Latest Only */}
          {groupedLabResults.length > 0 && (
            <div className="space-y-6">
              {groupedLabResults.map((group) => (
                <Card key={group.testType} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-light rounded-xl flex items-center justify-center">
                        <TestTube className="w-5 h-5 text-white" />
                      </div>
                    <div>
                        <CardTitle className="text-xl font-semibold text-gray-900">{group.testType}</CardTitle>
                        <div className="flex flex-col space-y-1 mt-1">
                          <p className="text-sm text-gray-600">
                            Report Date: {group.latestReport.reportDate
                              ? new Date(group.latestReport.reportDate).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : 'Not available'
                            }
                          </p>
                          <p className="text-xs text-gray-500">
                            Uploaded: {new Date(group.latestReport.uploadedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                          {group.history.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {group.history.length} previous report{group.history.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                    </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-light text-wellness-blue-primary border-wellness-blue-medium">
                        Latest Results
                      </Badge>
                      {group.history.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleHistory(group.testType)}
                          className="text-wellness-blue-primary hover:text-wellness-blue-dark border-wellness-blue-medium"
                        >
                          <History className="w-4 h-4 mr-2" />
                          {group.showHistory ? 'Hide History' : 'View History'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Latest Report Display */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4">
                      {group.latestReport.categories[0]?.tests.map((test) => (
                        <div 
                          key={test.id} 
                          className={`group relative p-2 sm:p-3 lg:p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                            test.status === 'critical' ? 'bg-red-50 border-red-200 hover:bg-red-100' :
                            test.status === 'high' ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' :
                            test.status === 'low' ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100' :
                            'bg-gray-50 border-green-200 hover:bg-green-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900 text-xs sm:text-sm truncate flex-1 mr-2">
                              {test.testName}
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(group.testType, group.latestReport.categories[0].categoryName, test.testName, test)}
                              className="h-6 w-6 p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                              <Edit className="w-3 h-3 text-gray-500" />
                            </Button>
                          </div>
                          <div className="text-center">
                            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">
                              {test.value} <span className="text-xs sm:text-sm font-normal text-gray-600">{test.unit}</span>
                            </p>
                            <p className="text-xs text-gray-600">
                              Normal: {test.referenceLow} - {test.referenceHigh}
                            </p>
                            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 ${
                              test.status === 'critical' ? 'bg-red-100 text-red-800' :
                              test.status === 'high' ? 'bg-orange-100 text-orange-800' :
                              test.status === 'low' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {getStatusIcon(test.status)} {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                        </div>
                    </div>
                    </div>
                      ))}
                        </div>
                        
                    {/* History Section */}
                    {group.showHistory && group.history.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                          <History className="w-4 h-4 mr-2" />
                          Previous Reports ({group.history.length})
                        </h4>
                        <div className="space-y-4">
                          {group.history.map((historicalReport, index) => (
                            <div key={historicalReport.id} className="bg-gray-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h5 className="font-medium text-gray-700">
                                  Report from {historicalReport.reportDate
                                    ? new Date(historicalReport.reportDate).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                      })
                                    : new Date(historicalReport.uploadedAt).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                      })
                                  }
                                </h5>
                                <Badge variant="secondary" className="text-xs">
                                  #{group.history.length - index}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                                {historicalReport.categories[0]?.tests.map((test) => (
                                  <div
                                    key={test.id}
                                    className={`text-center p-2 sm:p-3 rounded-lg border ${
                                      test.status === 'critical' ? 'bg-red-50 border-red-200' :
                                      test.status === 'high' ? 'bg-orange-50 border-orange-200' :
                                      test.status === 'low' ? 'bg-yellow-50 border-yellow-200' :
                                      'bg-gray-50 border-gray-200'
                                    }`}
                                  >
                                    <p className="text-xs text-gray-500 mb-1 truncate">{test.testName}</p>
                                    <p className="font-semibold text-gray-900 text-xs sm:text-sm">
                                      {test.value} {test.unit}
                                    </p>
                                    <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-1 ${
                                      test.status === 'critical' ? 'bg-red-100 text-red-800' :
                                      test.status === 'high' ? 'bg-orange-100 text-orange-800' :
                                      test.status === 'low' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-green-100 text-green-800'
                                    }`}>
                                      {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                              </div>
                              </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {groupedLabResults.length === 0 && (
            <div className="text-center py-12">
              <TestTube className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Lab Reports Yet</h3>
              <p className="text-gray-600 mb-6">
                Upload your lab reports to get AI-powered analysis and track your health metrics over time.
              </p>
             
            </div>
          )}

          {/* Legacy Lab Reports */}
          {labReports.map((report) => (
            <Card key={report.id} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">{report.name}</CardTitle>
                  <p className="text-sm text-gray-500">{new Date(report.date).toLocaleDateString()}</p>
                </div>
                <Badge className={getRecordStatusColor(report.status)}>{report.status}</Badge>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(report.values as Record<string, any>).map(([key, value]) => (
                    <div key={key} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">{key}</p>
                      <p className="font-semibold text-gray-900">{String(value)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-4 space-x-2">
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="upload" className="space-y-6">
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Upload Medical Documents</CardTitle>
              <p className="text-sm text-gray-500">
                Upload your medical records, lab reports, and other health documents
              </p>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-6">
                  <h4 className="font-medium text-gray-900">Uploaded Files ({uploadedFiles.length})</h4>
                  
                  {/* Group files by category */}
                  {fileCategories.map((category) => {
                    const categoryFiles = uploadedFiles.filter(file => file.category === category.value)
                    if (categoryFiles.length === 0) return null
                    
                    return (
                      <div key={category.value} className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <category.icon className="w-5 h-5 text-gray-600" />
                          <h5 className="font-medium text-gray-900">{category.label}</h5>
                          <Badge variant="secondary" className="text-xs">
                            {categoryFiles.length} file{categoryFiles.length > 1 ? 's' : ''}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          {categoryFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <File className="w-8 h-8 text-gray-400" />
                                <div>
                                  <p className="font-medium text-gray-900">{file.name}</p>
                                  <p className="text-sm text-gray-500">
                                    {formatFileSize(file.size)} • {new Date(file.uploadDate).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                               
                                
                                {!file.processed && (file.type.startsWith('image/') || file.type.startsWith('text/')) && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => processFileWithAI(file.id)}
                                    disabled={isProcessing}
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    {isProcessing ? <LoadingIcon size="small" /> : <Activity className="w-4 h-4" />}
                                  </Button>
                                )}
                                {file.processed && (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                    Processed
                                  </Badge>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => deleteFile(file.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* AI Lab Report Upload */}
              <Card className="bg-white  border-2 rounded-xl border-wellness-blue-medium">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center overflow-hidden">
                      <Image
                        src="/meddyAi.jpeg"
                        alt="Meddy AI"
                        width={24}
                        height={24}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                            </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">AI Lab Report Analysis</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Upload your lab reports and get instant AI-powered analysis and insights about your health
                        metrics.
                      </p>
                            <Button
                              variant="outline"
                        className="border-wellness-blue-medium text-wellness-blue-primary hover:bg-wellness-blue-pale bg-transparent"
                        onClick={() => {
                          setAiLabReportOnly(true)
                          setSelectedCategory('ai-lab-report')
                          setShowCategoryDialog(true)
                        }}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Upload Lab Report
                            </Button>
                          </div>
                        </div>
                </CardContent>
              </Card>

              {/* Upload Medical Documents */}
              <Card className="bg-white border-2 rounded-xl border-wellness-blue-medium">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center overflow-hidden">
                      <Image
                        src="/meddyAi.jpeg"
                        alt="Meddy AI"
                        width={24}
                        height={24}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">Upload Medical Documents</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Upload your medical records, lab reports, X-rays, prescriptions, insurance documents and other health documents with AI-powered organization.
                      </p>
                  <Button
                    variant="outline"
                        className="border-wellness-blue-medium text-wellness-blue-primary hover:bg-wellness-blue-pale bg-transparent"
                        onClick={() => {
                          setAiLabReportOnly(false)
                          setShowCategoryDialog(true)
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Upload Medical Documents
                  </Button>
                    </div>
                </div>
                </CardContent>
              </Card>
        </CardContent>
      </Card>
            </TabsContent>
          </Tabs>

      {/* Edit Test Result Dialog */}
      <Dialog open={!!editingResult} onOpenChange={() => closeEditDialog()}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Edit Test Result</DialogTitle>
            <p className="text-sm text-gray-600">
              Update the AI-detected values for {editingResult?.testName}
            </p>
          </DialogHeader>

          {editingResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-value">Value</Label>
                  <Input
                    id="edit-value"
                    type="text"
                    defaultValue={editingResult.currentValues.value}
                    onChange={(e) => {
                      const updated = { ...editingResult.currentValues, value: e.target.value }
                      setEditingResult({ ...editingResult, currentValues: updated })
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-unit">Unit</Label>
                  <Select
                    defaultValue={editingResult.currentValues.unit}
                    onValueChange={(value) => {
                      const updated = { ...editingResult.currentValues, unit: value }
                      setEditingResult({ ...editingResult, currentValues: updated })
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mg/dL">mg/dL</SelectItem>
                      <SelectItem value="mmol/L">mmol/L</SelectItem>
                      <SelectItem value="K/uL">K/uL</SelectItem>
                      <SelectItem value="g/dL">g/dL</SelectItem>
                      <SelectItem value="U/L">U/L</SelectItem>
                      <SelectItem value="%">%</SelectItem>
                      <SelectItem value="cells/μL">cells/μL</SelectItem>
                      <SelectItem value="μmol/L">μmol/L</SelectItem>
                      <SelectItem value="ng/mL">ng/mL</SelectItem>
                      <SelectItem value="pg/mL">pg/mL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-low">Reference Low</Label>
                  <Input
                    id="edit-low"
                    type="text"
                    defaultValue={editingResult.currentValues.referenceLow}
                    onChange={(e) => {
                      const updated = { ...editingResult.currentValues, referenceLow: e.target.value }
                      setEditingResult({ ...editingResult, currentValues: updated })
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-high">Reference High</Label>
                  <Input
                    id="edit-high"
                    type="text"
                    defaultValue={editingResult.currentValues.referenceHigh}
                    onChange={(e) => {
                      const updated = { ...editingResult.currentValues, referenceHigh: e.target.value }
                      setEditingResult({ ...editingResult, currentValues: updated })
                    }}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={closeEditDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={() => saveEditedResult(editingResult.currentValues)}
                  className="bg-wellness-blue-light text-white hover:bg-wellness-blue-medium"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Record Dialog - Shows Stay Tuned Message */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
              <Zap className="w-8 h-8 text-purple-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Stay Tuned!
              </DialogTitle>
            </DialogHeader>
            <p className="text-gray-600 leading-relaxed">
              We're working hard to bring you an enhanced medical record upload experience. 
              This feature will be available soon.
            </p>
            <div className="flex space-x-2 pt-2">
              <Button 
                onClick={() => setUploadDialogOpen(false)}
                className="bg-gradient-to-r from-wellness-blue-primary to-wellness-blue-medium hover:from-wellness-blue-dark hover:to-wellness-blue-primary"
              >
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Removed Lab Report Stay Tuned dialog */}

      {/* Legacy Tabs (hidden) */}
      <div className="hidden">
          <Tabs defaultValue="ocr" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ocr">Upload</TabsTrigger>
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            </TabsList>

            <TabsContent value="ocr" className="space-y-4">
              {/* File Upload Section */}
              {!ocrFile && (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors duration-200">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Lab Report</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Drop your lab report file here, or click to browse
                    <br />
                    <span className="text-xs">Supports PNG, JPEG, and PDF files up to 10MB</span>
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="ocr-file-input"
                  />
                  <Button 
                    onClick={() => document.getElementById('ocr-file-input')?.click()}
                    className="bg-wellness-blue-light text-wellness-blue-primary hover:bg-wellness-blue-light hover:text-wellness-blue-primary"
                  >
                    Choose File
                  </Button>
            </div>
              )}

              {/* File Preview and Processing */}
              {ocrFile && (
                <div className="space-y-4">
                  <Card className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {ocrFile?.type.match('image.*') ? (
                            <ImageIcon className="w-8 h-8 text-blue-500" />
                          ) : (
                            <File className="w-8 h-8 text-red-500" />
                          )}
            <div>
                            <p className="font-medium text-gray-900">{ocrFile?.name}</p>
                            <p className="text-sm text-gray-500">{ocrFile && getFileSize(ocrFile)}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={removeFile}
                          disabled={isProcessing}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {isProcessing && (
                        <div className="mt-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <LoadingIcon size="small" />
                            <span className="text-sm text-gray-600">Processing OCR... {ocrProgress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${ocrProgress}%` }}
              />
            </div>
                        </div>
                      )}

                      {!isProcessing && !extractedText && (
                        <div className="mt-4">
              <Button 
                            onClick={processOCR}
                            className="bg-gradient-to-r from-blue-500 to-purple-600"
                          >
                            <Activity className="w-4 h-4 mr-2" />
                            Start OCR Processing
              </Button>
            </div>
                      )}

                      {!isProcessing && extractedText && (
                        <div className="mt-4">
                          <div className="flex items-center space-x-2 text-green-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">Processing completed! Lab values have been extracted.</span>
          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>


              </div>
            )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="testDate">Test Date</Label>
                  <Input
                    id="testDate"
                    type="date"
                    value={labReport.testDate}
                    onChange={(e) => setLabReport(prev => ({ ...prev, testDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="bloodCount">Blood Count (μL)</Label>
                  <Input
                    id="bloodCount"
                    placeholder="e.g., 9800"
                    value={labReport.bloodCount}
                    onChange={(e) => setLabReport(prev => ({ ...prev, bloodCount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hemoglobin">Hemoglobin (g/dL)</Label>
                  <Input
                    id="hemoglobin"
                    placeholder="e.g., 14.2"
                    value={labReport.hemoglobin}
                    onChange={(e) => setLabReport(prev => ({ ...prev, hemoglobin: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="whiteBloodCells">White Blood Cells (K/μL)</Label>
                  <Input
                    id="whiteBloodCells"
                    placeholder="e.g., 7.5"
                    value={labReport.whiteBloodCells}
                    onChange={(e) => setLabReport(prev => ({ ...prev, whiteBloodCells: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platelets">Platelets (K/μL)</Label>
                  <Input
                    id="platelets"
                    placeholder="e.g., 250"
                    value={labReport.platelets}
                    onChange={(e) => setLabReport(prev => ({ ...prev, platelets: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cholesterol">Total Cholesterol (mg/dL)</Label>
                  <Input
                    id="cholesterol"
                    placeholder="e.g., 180"
                    value={labReport.cholesterol}
                    onChange={(e) => setLabReport(prev => ({ ...prev, cholesterol: e.target.value }))}
                  />
                  </div>
                </div>

                <div>
                <Label htmlFor="bloodSugar">Blood Sugar (mg/dL)</Label>
                <Input
                  id="bloodSugar"
                  placeholder="e.g., 95"
                  value={labReport.bloodSugar}
                  onChange={(e) => setLabReport(prev => ({ ...prev, bloodSugar: e.target.value }))}
                />
                  </div>

              <div>
                <Label htmlFor="labNotes">Additional Notes</Label>
                <Textarea
                  id="labNotes"
                  placeholder="Any additional observations or doctor's notes"
                  value={labReport.notes}
                  onChange={(e) => setLabReport(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
                </div>
            </TabsContent>

            {/* Common Action Buttons */}
            <div className="flex space-x-2 pt-4 border-t">
              <Button 
                onClick={handleAddLabReport} 
                disabled={!labReport.testDate.trim() || !labReport.bloodCount.trim()}
                className="bg-gradient-to-r from-blue-500 to-purple-600"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Lab Report
                </Button>
              <Button variant="outline" onClick={() => {
                setLabUploadDialogOpen(false)
                setOcrFile(null)
                setExtractedText("")
                setOcrProgress(0)
                setIsProcessing(false)
              }}>
                Cancel
                </Button>
              </div>
          </Tabs>
      </div>

      {/* Category Selection Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={(open) => {
        setShowCategoryDialog(open)
        if (!open) {
          setAiLabReportOnly(false)
          setSelectedCategory('')
        }
      }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>{aiLabReportOnly ? 'AI Lab Report Analysis' : 'Select Document Category'}</DialogTitle>
            <p className="text-sm text-gray-600">
              {aiLabReportOnly
                ? `Upload lab reports for instant AI-powered analysis and health insights`
                : `Choose a category for ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}`
              }
            </p>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Category Selection - Must select first */}
            <div className="space-y-3">
              {!aiLabReportOnly && <Label>Document Category</Label>}

              {/* AI Lab Report Only Mode */}
              {aiLabReportOnly ? (
                <div className="space-y-4">
                  {/* Drag and Drop File Uploader */}
                  <div className="border-2 border-dashed border-wellness-blue-medium rounded-xl p-8 text-center hover:border-wellness-blue-primary transition-colors duration-200 bg-white">
                    <div className="w-24 h-24 bg-white rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Image
                        src="/meddyAi.jpeg"
                        alt="Meddy AI"
                        width={32}
                        height={32}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Lab Report for AI Analysis</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Drop your lab report file here, or click to browse
                      <br />
                      <span className="text-xs text-gray-500">Supports PNG, JPEG, and PDF files up to 10MB</span>
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/jpg,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (files && files.length > 0) {
                          const validFiles: File[] = []
                          for (const file of Array.from(files)) {
                            if (!file.type.match(/^(image\/|application\/pdf)/)) {
                              alert(`File ${file.name} is not supported. Please upload PDF, JPG, or PNG files only.`)
                              continue
                            }
                            if (file.size > 10 * 1024 * 1024) {
                              alert(`File ${file.name} is too large. Maximum size is 10MB.`)
                              continue
                            }
                            validFiles.push(file)
                          }
                          if (validFiles.length > 0) {
                            setPendingFiles(validFiles)
                            setSelectedCategory('ai-lab-report')
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-wellness-blue-light hover:bg-wellness-blue-light hover:text-wellness-blue-primary"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Choose Files
                    </Button>
                  </div>

                  {/* File Preview - Show after files are selected */}
                  {pendingFiles.length > 0 && (
                    <div className="space-y-2">
                      <Label>Selected Files for AI Analysis</Label>
                      <div className="max-h-32 overflow-y-auto space-y-2">
                        {pendingFiles.map((file, index) => (
                          <div key={index} className="flex items-center space-x-2 p-2 bg-wellness-blue-pale rounded">
                            <File className="w-4 h-4 text-wellness-blue-primary" />
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 w-6 p-0 text-red-600 hover:text-red-700"
                              onClick={() => {
                                setPendingFiles(prev => prev.filter((_, i) => i !== index))
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
              {/* AI Lab Report - Full Width at Top */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-black">AI</h3>
                {fileCategories.filter(cat => cat.fullWidth).map((category) => (
                  <Button
                    key={category.value}
                        variant="outline"
                        className={`w-full h-auto p-4 mb-3 transition-all duration-200 ${
                      selectedCategory === category.value 
                            ? 'bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-light text-white border-wellness-blue-primary hover:from-wellness-blue-primary hover:to-wellness-blue-medium shadow-md'
                            : 'border-2 border-wellness-blue-medium hover:border-wellness-blue-primary hover:bg-gradient-to-r hover:from-wellness-blue-pale hover:to-wellness-blue-light'
                    }`}
                    onClick={() => setSelectedCategory(category.value)}
                  >
                    <div className="flex items-center justify-center gap-3 w-full">
                      <category.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-semibold flex-shrink-0">{category.label}</span>
                    </div>
                  </Button>
                ))}
              </div>
              
              {/* Other Categories - Grid Layout */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-black mt-6">Others</h3>
                <div className="grid grid-cols-2 gap-3">
                {fileCategories.filter(cat => !cat.fullWidth).map((category) => (
                  <Button
                    key={category.value}
                        variant="outline"
                        className={`h-auto p-3 flex flex-col items-center space-y-2 transition-all duration-200 ${
                          selectedCategory === category.value
                            ? 'bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-light text-white border-wellness-blue-primary hover:from-wellness-blue-primary hover:to-wellness-blue-medium shadow-md'
                            : 'hover:bg-gradient-to-r hover:from-wellness-blue-pale hover:to-wellness-blue-light hover:border-wellness-blue-primary'
                    }`}
                    onClick={() => setSelectedCategory(category.value)}
                  >
                    <category.icon className="w-5 h-5" />
                    <span className="text-xs">{category.label}</span>
                  </Button>
                ))}
                </div>
              </div>
                </>
              )}
            </div>

            {/* File Preview - Show after category is selected */}
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Selected Files</Label>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                      <File className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 w-6 p-0"
                        onClick={() => {
                          setPendingFiles(prev => prev.filter((_, i) => i !== index))
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center">
                  Uploading... {Math.round(uploadProgress)}%
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-2">
              {!aiLabReportOnly && (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  if (files && files.length > 0) {
                    const validFiles: File[] = []
                    for (const file of Array.from(files)) {
                      if (!file.type.match(/^(image\/|application\/pdf)/)) {
                        alert(`File ${file.name} is not supported. Please upload PDF, JPG, or PNG files only.`)
                        continue
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        alert(`File ${file.name} is too large. Maximum size is 10MB.`)
                        continue
                      }
                      validFiles.push(file)
                    }
                    if (validFiles.length > 0) {
                      setPendingFiles(validFiles)
                    }
                  }
                }}
              />
              )}
              <Button 
                className={`flex-1 ${
                  (aiLabReportOnly ? pendingFiles.length > 0 : selectedCategory)
                    ? 'bg-gradient-to-r from-wellness-blue-pale to-wellness-blue-light hover:from-wellness-blue-dark hover:to-wellness-blue-primary hover:text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                onClick={() => {
                  if (aiLabReportOnly) {
                    if (pendingFiles.length === 0) {
                      alert('Please select files first')
                      return
                    }
                    processFilesWithCategory()
                  } else {
                  if (!selectedCategory) {
                    alert('Please select a category first')
                    return
                  }
                  if (pendingFiles.length === 0) {
                    // Trigger file selection
                    fileInputRef.current?.click()
                  } else {
                    // Upload files
                    processFilesWithCategory()
                    }
                  }
                }}
                disabled={(aiLabReportOnly ? pendingFiles.length === 0 : !selectedCategory) || isUploading}
              >
                {isUploading ? 'Uploading...' : pendingFiles.length > 0 ? 'Upload Files' : (aiLabReportOnly ? 'Select Files' : 'Select Files')}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCategoryDialog(false)
                  setPendingFiles([])
                  setSelectedCategory('')
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Preview Modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {previewFile && (
              <Image 
                src={previewFile.url} 
                alt={previewFile.name}
                width={800}
                height={600}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                unoptimized={previewFile.url.startsWith('/api/hipaa/') || previewFile.url.startsWith('/api/medical-records/')}
              />
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => {
                if (previewFile) {
                  handleFileDownload(previewFile);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => setPreviewFile(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.open} onOpenChange={(open) => setDeleteConfirmDialog({ ...deleteConfirmDialog, open })}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <p className="text-sm text-gray-600 mt-2">
              Are you sure you want to delete <span className="font-semibold">{deleteConfirmDialog.fileName}</span>? This action cannot be undone.
            </p>
          </DialogHeader>
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmDialog({ open: false, fileId: null, fileName: '' })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Removed Stay Tuned Modal */}
    </div>
  )
}