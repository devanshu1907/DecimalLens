"use client";

import React, { useState, useEffect, useRef } from "react";
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
  highlightText?: string;
}

export default function PdfViewer({ url, currentPage, onPageChange, highlightText }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(currentPage || 1);
  const [scale, setScale] = useState<number>(1.0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        // Leave some margin for padding (p-4 is 16px on each side, total 32px) and border (2px)
        const width = entries[0].contentRect.width - 36;
        setContainerWidth(width > 0 ? width : undefined);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync external currentPage prop changes via effect instead of during render.
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

  // Custom text renderer for highlighting text on PDF pages
  const textRenderer = (textItem: any) => {
    if (!highlightText) return textItem.str;

    const cleanText = textItem.str.replace(/\s+/g, ' ').trim().toLowerCase();
    const cleanPattern = highlightText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (!cleanText || !cleanPattern) return textItem.str;

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Case 1: Text item contains full pattern
    if (cleanText.includes(cleanPattern)) {
      const escaped = escapeRegExp(cleanPattern);
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = textItem.str.split(regex);
      return parts.map((part: string, index: number) => 
        regex.test(part) ? (
          <mark 
            key={index} 
            className="bg-amber-200 dark:bg-amber-500/40 text-text-primary px-0.5 rounded-sm font-semibold"
          >
            {part}
          </mark>
        ) : (
          part
        )
      );
    }

    // Case 2: Pattern contains text item (word-chunk matching)
    if (cleanPattern.includes(cleanText) && cleanText.length > 8) {
      return (
        <mark className="bg-amber-200 dark:bg-amber-500/40 text-text-primary px-0.5 rounded-sm font-semibold">
          {textItem.str}
        </mark>
      );
    }

    return textItem.str;
  };

  return (
    <div className="flex flex-col items-center w-full h-full bg-bg relative">
      {/* Viewer toolbar */}
      <div className="w-full h-10 border-b border-border bg-panel flex items-center justify-between px-4 sticky top-0 z-10 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-sans font-medium text-text-primary font-mono">
            Page {pageNumber} of {numPages || "..."}
          </span>
          <button
            onClick={() => changePage(1)}
            disabled={numPages === null || pageNumber >= numPages}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
            className="p-1 rounded hover:bg-muted text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-medium text-text-secondary w-10 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            className="p-1 rounded hover:bg-muted text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div 
        ref={containerRef}
        className="flex-1 w-full overflow-auto flex justify-center p-4 bg-bg min-h-0"
      >
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
              key={`${pageNumber}_${highlightText || ""}`}
              pageNumber={pageNumber}
              scale={scale}
              width={containerWidth}
              renderAnnotationLayer={true}
              renderTextLayer={true}
              customTextRenderer={textRenderer}
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
