'use client';

import { useEffect, useState } from 'react';

interface PDFProcessorProps {
  onTextExtracted: (text: string) => void;
  onError: (error: string) => void;
  file: File;
}

export default function PDFProcessor({ onTextExtracted, onError, file }: PDFProcessorProps) {
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPDFJS = async () => {
      try {
        // Load PDF.js in a separate component to avoid conflicts
        const { pdfjs } = await import('react-pdf');
        setPdfjs(pdfjs);
        
        // Set up worker
        pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
        
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load PDF.js:', error);
        onError('PDF processing is not available');
        setIsLoading(false);
      }
    };

    loadPDFJS();
  }, [onError]);

  useEffect(() => {
    if (!pdfjs || isLoading) return;

    const processPDF = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        
        let allText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const canvas = document.createElement('canvas');
          const viewport = page.getViewport({ scale: 1.5 });
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          const context = canvas.getContext('2d');
          await page.render({ canvasContext: context!, viewport }).promise;
          
          // Convert canvas to image and process with OCR
          const imageData = canvas.toDataURL('image/png');
          
          // For now, we'll just extract text from the canvas
          // In a real implementation, you'd use OCR here
          allText += `\n--- Page ${i} ---\n[PDF content would be extracted here]\n`;
        }
        
        onTextExtracted(allText);
      } catch (error) {
        console.error('PDF processing error:', error);
        onError('Failed to process PDF file');
      }
    };

    processPDF();
  }, [pdfjs, file, onTextExtracted, onError, isLoading]);

  if (isLoading) {
    return <div>Loading PDF processor...</div>;
  }

  return <div>Processing PDF...</div>;
}
