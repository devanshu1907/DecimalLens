"use client";

import React, { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";

// CSS files required by react-pdf
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure worker: served from /public to avoid CDN supply-chain risk.
// Run `node -e "require('fs').copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'public/pdf.worker.min.mjs')"` after install.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfViewerProps {
  url: string;
  currentPage: number;
  onPageChange?: (page: number) => void;
}

export default function PdfViewer({ url, currentPage, onPageChange }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(currentPage || 1);
  const [scale, setScale] = useState<number>(1.0);

  // Sync external currentPage prop changes via effect instead of during render.
  // Calling setState directly in the render body is an anti-pattern that can
  // trigger infinite re-renders in React Strict Mode.
  useEffect(() => {
    if (currentPage !== pageNumber) {
      setPageNumber(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    if (pageNumber > numPages) {
      setPageNumber(1);
      onPageChange?.(1);
    }
  }

  const changePage = (offset: number) => {
    const newPage = pageNumber + offset;
    if (newPage >= 1 && numPages && newPage <= numPages) {
      setPageNumber(newPage);
      onPageChange?.(newPage);
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full bg-zinc-100 relative">
      {/* Viewer toolbar */}
      <div className="w-full h-10 border-b border-border bg-[#FAFAFA] flex items-center justify-between px-4 sticky top-0 z-10 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-30 disabled:hover:bg-transparent text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-sans font-medium text-text-primary font-mono">
            Page {pageNumber} of {numPages || "..."}
          </span>
          <button
            onClick={() => changePage(1)}
            disabled={numPages === null || pageNumber >= numPages}
            className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-30 disabled:hover:bg-transparent text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
            className="p-1 rounded hover:bg-slate-200/60 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-medium text-text-secondary w-10 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            className="p-1 rounded hover:bg-slate-200/60 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div className="flex-1 w-full overflow-auto flex justify-center p-4 bg-zinc-100 min-h-0">
        <div className="bg-panel border border-border shadow-md rounded-md overflow-hidden h-fit transition-transform duration-150 ease-out">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex flex-col items-center justify-center gap-3 p-16 min-h-[400px]">
                <Loader2 className="w-6 h-6 text-accent-navy animate-spin" />
                <span className="text-xs text-text-secondary font-mono">Loading PDF pages...</span>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-red-700 min-h-[300px]">
                Failed to load document. Make sure it is a valid PDF.
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderAnnotationLayer={true}
              renderTextLayer={true}
              loading={
                <div className="flex items-center justify-center p-16 min-h-[300px]">
                  <Loader2 className="w-5 h-5 text-accent-navy animate-spin" />
                </div>
              }
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
