"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Sparkles, 
  Info,
  Database,
  History,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  Download,
  Printer
} from "lucide-react";
import nextDynamic from "next/dynamic";

import { ThemeProvider } from "@/components/ThemeProviderClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const PdfViewer = nextDynamic(() => import("../components/PdfViewer"), {
  ssr: false,
});

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getSortedRowModel,
  SortingState
} from "@tanstack/react-table";
import { Command } from "cmdk";

interface Claim {
  id: string;
  metric: string;
  reported: string;
  recalculated: string;
  formula: string;
  expression: string;
  verified: boolean;
  page: number;
  context: string;
  reason?: string;
  confidence_tier?: string;
  relative_error_bps?: string;
  faithfulness_score?: string;
  tolerance_used?: string;
  n_operands?: number;
}

interface ForecasterResponse {
  confidence: string;
  risk_assessment: string;
  projections: {
    year: string;
    projected_revenue: string;
    projected_operating_income: string;
    risk_weight: string;
  }[];
}

interface AuditSession {
  id: string;
  fileName: string;
  storedFileName: string | null;  // UUID-prefixed server-side name for /api/document/
  timestamp: string;
  parsedText: string;
  lowConfidence: boolean;
  extractedClaims: Claim[];
  forecasterResponse: ForecasterResponse | null;
}


const SAMPLE_FILING_TEXT = `DECIMALLENS INC.
FORM 10-Q | PART I - FINANCIAL INFORMATION

The following table sets forth consolidated revenue and income metrics for the three-month period ended December 31, 2025. All metrics are compiled under strict GAAP standards, except where explicitly noted.

Financial Line Item            Reported Value       Footnote Ref
Total Revenue                  $142,500,000         [Sec. 1.2]
Gross Profit                   $62,100,000          [Sec. 1.3]
Operating Income               $34,912,500          [Sec. 2.1]
Operating Margin               24.50%               [Sec. 2.2]

For the quarter, our international market sectors generated $97,300,000 in revenues, representing a substantial growth path, while US domestic revenues stabilized at $45,200,000.
COGS stood at $80,400,000, leaving Gross Profit at $62,100,000.
R&D investments totaled $15,400,000, and SG&A expenses were reported at $12,100,000. Operating Income was reported at $34,912,500.
Operating margin is calculated as Operating Income over Total Revenue, yielding 24.50%.

Operating Income represents gross profit subtracting structural operational costs (R&D and SG&A). Forward guidance suggests operating margins will track toward 25.50% by early 2026.`;

// Streaming panel component for live LLM output visualization
const StreamingBox = ({ title, text }: { title: string; text: string }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="border border-border bg-bg/50 backdrop-blur-sm rounded-md p-4 font-mono text-[10px] text-text-primary max-h-[220px] overflow-y-auto shadow-inner flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-border pb-2 mb-2 sticky top-0 bg-bg/95">
        <span className="text-[9px] uppercase tracking-wider text-text-secondary font-sans font-semibold">{title}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-text-secondary font-sans">Streaming Agent reasoning...</span>
        </div>
      </div>
      <pre className="whitespace-pre-wrap leading-relaxed font-mono">
        {text || "{}"}
      </pre>
    </div>
  );
};

const TableSkeleton = () => {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-panel shadow-sm animate-pulse">
      <div className="bg-bg border-b border-border p-3 flex gap-4">
        <div className="h-3.5 w-10 bg-muted rounded" />
        <div className="h-3.5 w-32 bg-muted rounded" />
        <div className="h-3.5 w-20 bg-muted rounded" />
        <div className="h-3.5 w-16 bg-muted rounded" />
      </div>
      <div className="p-3 space-y-4">
        {[1, 2, 3, 4].map(idx => (
          <div key={idx} className="flex gap-4 items-center">
            <div className="h-2.5 w-8 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-3.5 w-12 bg-muted/60 rounded" />
            <div className="h-2.5 w-10 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
};

const ForecastSkeleton = () => {
  return (
    <div className="space-y-4 animate-pulse mt-2">
      <div className="border border-border rounded-md p-4 bg-muted/30 space-y-2">
        <div className="h-3.5 w-32 bg-muted rounded" />
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-5/6 bg-muted rounded" />
      </div>
      
      <div className="border border-border rounded-md overflow-hidden bg-panel shadow-sm">
        <div className="bg-bg border-b border-border p-3 flex justify-between">
          <div className="h-3.5 w-28 bg-muted rounded" />
          <div className="h-3.5 w-16 bg-muted rounded" />
        </div>
        <div className="p-3 space-y-4">
          {[1, 2, 3].map(idx => (
            <div key={idx} className="flex gap-4">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-3 w-16 bg-muted rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TextDocumentViewer = ({
  text,
  currentPage,
  onPageChange,
  activeClaim,
  isFlashing,
  fileName
}: {
  text: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  activeClaim: Claim | undefined;
  isFlashing: string | null;
  fileName: string;
}) => {
  const [scale, setScale] = useState(1.0);
  
  const pages = useMemo(() => {
    if (!text) return [];
    
    // Split by form feeds if available
    if (text.includes('\f')) {
      return text.split('\f').map(p => p.trim()).filter(Boolean);
    }
    
    // Fallback: split into pages of 32 lines
    const lines = text.split(/\n/);
    const result: string[] = [];
    const linesPerPage = 32;
    
    for (let i = 0; i < lines.length; i += linesPerPage) {
      result.push(lines.slice(i, i + linesPerPage).join('\n'));
    }
    return result;
  }, [text]);

  const numPages = pages.length;
  const pageIndex = Math.min(numPages - 1, Math.max(0, currentPage - 1));
  const currentPageText = pages[pageIndex] || "";

  // Highlight context inside the current page text
  const renderedPageContent = useMemo(() => {
    const citation = activeClaim?.context;
    if (!citation || activeClaim?.page !== (pageIndex + 1)) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-slate-800 leading-relaxed max-w-full">
          {currentPageText}
        </pre>
      );
    }

    const citationTrimmed = citation.trim();
    const citationLower = citationTrimmed.toLowerCase();
    const pageTextLower = currentPageText.toLowerCase();
    const index = pageTextLower.indexOf(citationLower);
    
    if (index === -1) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-slate-800 leading-relaxed max-w-full">
          {currentPageText}
        </pre>
      );
    }

    const matchLen = citationTrimmed.length;
    const before = currentPageText.substring(0, index);
    const match = currentPageText.substring(index, index + matchLen);
    const after = currentPageText.substring(index + matchLen);
    
    return (
      <pre className="whitespace-pre-wrap font-mono text-slate-800 leading-relaxed max-w-full">
        {before}
        <span
          className={`bg-flagged-bg border-l-2 border-flagged font-bold px-1 py-0.5 rounded text-text-primary transition-all inline shadow-sm ${
            isFlashing ? "animate-citation-flash" : ""
          }`}
        >
          {match}
        </span>
        {after}
      </pre>
    );
  }, [currentPageText, activeClaim, isFlashing, pageIndex]);

  const changePage = (offset: number) => {
    const newPage = currentPage + offset;
    if (newPage >= 1 && newPage <= numPages) {
      onPageChange(newPage);
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full bg-bg relative">
      {/* Viewer toolbar */}
      <div className="w-full h-10 border-b border-border bg-panel flex items-center justify-between px-4 sticky top-0 z-10 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changePage(-1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-sans font-medium text-text-primary font-mono">
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={() => changePage(1)}
            disabled={currentPage >= numPages}
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

      {/* Page Container */}
      <div className="flex-1 w-full overflow-auto flex justify-center p-4 sm:p-6 bg-bg min-h-0">
        <div 
          className="bg-white text-slate-900 border border-slate-200 shadow-sm rounded-md p-4 sm:p-10 max-w-2xl w-full h-fit transition-all duration-150 ease-out font-mono"
          style={{ fontSize: `${scale * 11}px` }}
        >
          <div className="border-b border-slate-200 pb-3 mb-6 flex justify-between items-center text-[9px] uppercase tracking-wider text-slate-400 font-sans">
            <span>{fileName}</span>
            <span>Ingested Document Page</span>
          </div>
          
          <div className="min-h-[500px]">
            {renderedPageContent}
          </div>
          
          <div className="border-t border-slate-100 pt-3 mt-6 flex justify-between items-center text-[9px] text-slate-400 font-sans">
            <span>DecimalLens Viewer</span>
            <span>Page {currentPage} of {numPages}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CsvDocumentViewer = ({
  parsedCsv,
  renderedCsvTable,
  fileName
}: {
  parsedCsv: string[][] | null;
  renderedCsvTable: React.ReactNode;
  fileName: string;
}) => {
  const [scale, setScale] = useState(1.0);

  return (
    <div className="flex flex-col items-center w-full h-full bg-bg relative">
      {/* Viewer toolbar */}
      <div className="w-full h-10 border-b border-border bg-panel flex items-center justify-between px-4 sticky top-0 z-10 shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-[11px] font-sans font-medium text-text-primary">
          <span>Sheet Preview</span>
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

      {/* Sheet Container */}
      <div className="flex-1 w-full overflow-auto flex justify-center p-4 sm:p-6 bg-bg min-h-0">
        <div 
          className="bg-white text-slate-900 border border-slate-200 shadow-sm rounded-md p-4 sm:p-10 max-w-4xl w-full h-fit transition-all duration-150 ease-out font-sans"
          style={{ fontSize: `${scale * 12}px` }}
        >
          <div className="border-b border-slate-200 pb-3 mb-6 flex justify-between items-center text-[0.75em] uppercase tracking-wider text-slate-400 font-sans">
            <span>{fileName}</span>
            <span>Spreadsheet Ingestion View</span>
          </div>
          
          <div className="min-h-[500px]">
            {renderedCsvTable}
          </div>
          
          <div className="border-t border-slate-100 pt-3 mt-6 flex justify-between items-center text-[0.75em] text-slate-400 font-sans">
            <span>DecimalLens Viewer</span>
            <span>1 Sheet | {parsedCsv?.length || 0} Rows</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Page() {
  const [activeAgent, setActiveAgent] = useState<"auditor" | "forecaster">("auditor");
  const [mobileActiveTab, setMobileActiveTab] = useState<"document" | "insights">("document");
  const [fileName, setFileName] = useState<string | null>(null);
  // storedFileName is the UUID-prefixed server-side name returned by /api/upload.
  // Used for the PdfViewer URL so same-filename uploads from different users
  // never collide. null for sample/text files that were never uploaded.
  const [storedFileName, setStoredFileName] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Backend Integration States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [parsedText, setParsedText] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [extractedClaims, setExtractedClaims] = useState<Claim[]>([]);
  const [forecasterResponse, setForecasterResponse] = useState<ForecasterResponse | null>(null);
  const [auditorText, setAuditorText] = useState("");
  const [forecasterText, setForecasterText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const [showRawAuditor, setShowRawAuditor] = useState(false);
  const [showRawForecaster, setShowRawForecaster] = useState(false);

  // Phase 4 States
  const [recentSessions, setRecentSessions] = useState<AuditSession[]>([]);
  const [isEditingClaim, setIsEditingClaim] = useState(false);
  const [isAddingClaim, setIsAddingClaim] = useState(false);
  const [editMetric, setEditMetric] = useState("");
  const [editReported, setEditReported] = useState("");
  const [editFormula, setEditFormula] = useState("");
  const [editExpression, setEditExpression] = useState("");
  const [editPage, setEditPage] = useState<number>(1);
  const [editContext, setEditContext] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const highlightRef = useRef<HTMLSpanElement | null>(null);
  const leftPaneScrollRef = useRef<HTMLDivElement | null>(null);
  const claimsRef = useRef<Claim[]>([]);


  // TanStack Table configurations
  const [claimsSorting, setClaimsSorting] = useState<SortingState>([]);
  const [projectionSorting, setProjectionSorting] = useState<SortingState>([]);

  // Column definitions are memoized with empty deps because they are pure
  // static renderers — they never close over component state or callbacks.
  // Without memoization, createColumnHelper + the array literal run on every render.
  const claimColumnHelper = useMemo(() => createColumnHelper<Claim>(), []);
  const claimsColumns = useMemo(() => [
    claimColumnHelper.accessor("id", {
      header: "ID",
      cell: (info) => (
        <span className="font-mono text-[10px] text-text-secondary">
          {info.getValue().replace("claim-", "C")}
        </span>
      ),
    }),
    claimColumnHelper.accessor("metric", {
      header: "Metric",
      cell: (info) => (
        <span className="font-semibold text-text-primary text-[11px] block truncate max-w-[150px]" title={info.getValue()}>
          {info.getValue()}
        </span>
      ),
    }),
    claimColumnHelper.accessor("reported", {
      header: "Reported",
      cell: (info) => (
        <span className="font-mono text-[11px] font-bold text-text-primary">
          {info.getValue()}
        </span>
      ),
    }),
    claimColumnHelper.accessor("verified", {
      header: "Status",
      cell: (info) => {
        const verified = info.getValue();
        return verified ? (
          <span className="inline-flex items-center gap-1 bg-verified-bg text-verified text-[9px] font-bold px-1.5 py-0.5 rounded border border-verified/10">
            <CheckCircle2 className="w-2.5 h-2.5" />
            OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 bg-flagged-bg text-flagged text-[9px] font-bold px-1.5 py-0.5 rounded border border-flagged/10 animate-pulse">
            <AlertTriangle className="w-2.5 h-2.5" />
            Flagged
          </span>
        );
      },
    }),
    claimColumnHelper.accessor("page", {
      header: "Page",
      cell: (info) => (
        <span className="font-mono text-[10px] text-text-secondary">
          P.{info.getValue()}
        </span>
      ),
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [claimColumnHelper]);

  const claimsTable = useReactTable({
    data: extractedClaims,
    columns: claimsColumns,
    state: {
      sorting: claimsSorting,
    },
    onSortingChange: setClaimsSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  interface ProjectionRow {
    year: string;
    projected_revenue: string;
    projected_operating_income: string;
    risk_weight: string;
  }

  const projectionColumnHelper = useMemo(() => createColumnHelper<ProjectionRow>(), []);
  const projectionColumns = useMemo(() => [
    projectionColumnHelper.accessor("year", {
      header: "Fiscal Year",
      cell: (info) => <span className="font-sans font-medium text-text-primary">{info.getValue()}</span>,
    }),
    projectionColumnHelper.accessor("projected_revenue", {
      header: "Projected Revenue",
      cell: (info) => <span className="font-mono font-bold text-text-primary">{info.getValue()}</span>,
    }),
    projectionColumnHelper.accessor("projected_operating_income", {
      header: "Projected Operating Income",
      cell: (info) => {
        const val = info.getValue();
        const isHighRisk = val.includes("*");
        return (
          <span className={`font-mono font-bold ${isHighRisk ? "text-flagged font-semibold animate-pulse" : "text-text-primary"}`}>
            {val}
          </span>
        );
      },
    }),
    projectionColumnHelper.accessor("risk_weight", {
      header: "Risk Weight",
      cell: (info) => {
        const val = info.getValue();
        const isHighRisk = val.toLowerCase().includes("high");
        return (
          <span className={`font-sans font-medium ${isHighRisk ? "text-flagged" : "text-verified"}`}>
            {val}
          </span>
        );
      },
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [projectionColumnHelper]);

  const projectionsTable = useReactTable({
    data: forecasterResponse?.projections || [],
    columns: projectionColumns,
    state: {
      sorting: projectionSorting,
    },
    onSortingChange: setProjectionSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // 1. Smoothly increment progress towards targetProgress
  useEffect(() => {
    if (!showLoadingOverlay) return;
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < targetProgress) {
          const diff = targetProgress - prev;
          const step = Math.max(1, Math.min(5, Math.ceil(diff / 8)));
          return Math.min(targetProgress, prev + step);
        } else if (prev < 99 && isAnalyzing) {
          // Slow creep if target reached but still analyzing
          return prev + 0.2;
        }
        return prev;
      });
    }, 80);
    
    return () => clearInterval(interval);
  }, [showLoadingOverlay, targetProgress, isAnalyzing]);

  // 2. Map statusText to target progress milestones
  useEffect(() => {
    if (!isAnalyzing) return;
    
    const txt = statusText.toLowerCase();
    if (txt.includes("ingest") || txt.includes("parse")) {
      setTargetProgress(20);
    } else if (txt.includes("initializing") || txt.includes("pipeline")) {
      setTargetProgress(30);
    } else if (txt.includes("auditing") || txt.includes("extracting")) {
      setTargetProgress(55);
    } else if (txt.includes("verifying") || txt.includes("math") || txt.includes("calculation")) {
      setTargetProgress(75);
    } else if (txt.includes("forecasting") || txt.includes("projection")) {
      setTargetProgress(90);
    }
  }, [statusText, isAnalyzing]);

  // 3. Hold 100% progress for a moment before fading out
  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        setShowLoadingOverlay(false);
        setProgress(0);
        setTargetProgress(0);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const existing = localStorage.getItem("decimallens_sessions");
      if (existing) {
        setRecentSessions(JSON.parse(existing));
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }, []);

  const saveSession = (claims: Claim[], forecast: ForecasterResponse | null) => {
    if (!fileName || !parsedText) return;
    // Sanitize filename before embedding in the session ID — a raw filename
    // like `><script>alert(1)</script>.pdf` could inject markup if the ID
    // is ever rendered unescaped.
    const safeId = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") + "_" + Date.now();
    const newSession: AuditSession = {
      id: safeId,
      fileName,
      storedFileName: storedFileName ?? null,
      timestamp: new Date().toLocaleString(),
      // Truncate to 8 KB max.  Storing the full parsed text causes
      // QuotaExceededError for large uploads (≥25 MB) because localStorage
      // is typically capped at 5–10 MB per origin.
      parsedText: parsedText.slice(0, 8192),
      lowConfidence,
      extractedClaims: claims,
      forecasterResponse: forecast
    };
    try {
      const existing = localStorage.getItem("decimallens_sessions");
      const sessions: AuditSession[] = existing ? JSON.parse(existing) : [];
      const updated = [newSession, ...sessions.filter(s => s.fileName !== fileName)].slice(0, 10);
      localStorage.setItem("decimallens_sessions", JSON.stringify(updated));
      setRecentSessions(updated);
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        // Show a user-facing warning instead of silently swallowing the error
        setErrorMsg(
          "Session history could not be saved: browser storage is full. " +
          "Clear history or delete browser data to free space."
        );
      } else {
        console.error("Failed to save session", e);
      }
    }
  };

  const runForecastStream = async (claims: Claim[], keepProgress: boolean = false) => {
    if (claims.length === 0) {
      setForecasterResponse(null);
      setForecasterText("");
      return;
    }
    
    setIsAnalyzing(true);
    setStatusText("Forecasting projections based on updated claims...");
    setForecasterResponse(null);
    setForecasterText("");
    
    if (!keepProgress) {
      setShowLoadingOverlay(true);
      setProgress(0);
      setTargetProgress(15);
    } else {
      setTargetProgress(80);
    }
    
    try {
      const response = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claims,
          low_confidence_baseline: lowConfidence
        })
      });
      
      if (!response.ok) {
        throw new Error(`Forecast request failed: ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error("No response body received from forecast stream.");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        while (buffer.includes("\n\n")) {
          const parts = buffer.split("\n\n");
          const block = parts.shift() || "";
          buffer = parts.join("\n\n");
          
          const lines = block.split("\n");
          let eventType = "";
          let eventData = "";
          
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventData = line.replace("data:", "").trim();
            }
          }
          
          if (eventType && eventData) {
            try {
              const data = JSON.parse(eventData);
              if (eventType === "status") {
                setStatusText(data.status);
              } else if (eventType === "forecaster_chunk") {
                setForecasterText((prev) => prev + data.chunk);
              } else if (eventType === "done") {
                setForecasterResponse(data.forecaster_response);
                // Save updated session
                saveSession(claims, data.forecaster_response);
                setTargetProgress(100);
              } else if (eventType === "error") {
                setErrorMsg(data.message);
                setShowLoadingOverlay(false);
                setProgress(0);
              }
            } catch (e) {
              console.error("Failed to parse SSE event data:", e, eventData);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg((err as Error).message || "Error running forecast stream.");
      setShowLoadingOverlay(false);
      setProgress(0);
    } finally {
      setIsAnalyzing(false);
      setStatusText("");
      setTargetProgress(100);
    }
  };

  const exportToCsv = () => {
    if (extractedClaims.length === 0) return;
    const headers = ["Claim ID", "Metric Name", "Reported Value", "Recalculated Value", "Formula Check", "Expression", "Page Number", "Status", "Verification Reason"];
    const rows = extractedClaims.map(claim => [
      claim.id.toUpperCase(),
      claim.metric,
      claim.reported,
      claim.recalculated,
      claim.formula,
      claim.expression,
      `Page ${claim.page}`,
      claim.verified ? "Verified (OK)" : "Flagged (Mismatch)",
      claim.reason || ""
    ]);
    if (forecasterResponse?.projections) {
      rows.push([]);
      rows.push(["--- Growth Projections (3-Year Forecast) ---"]);
      rows.push(["Fiscal Year", "Projected Revenue", "Projected Operating Income", "Risk Weight"]);
      forecasterResponse.projections.forEach(p => {
        rows.push([
          p.year,
          p.projected_revenue,
          p.projected_operating_income,
          p.risk_weight
        ]);
      });
      rows.push([]);
      rows.push(["Risk Assessment Notes:", forecasterResponse.risk_assessment]);
    }
    const csvContent = [headers, ...rows]
      .map(row => row.map(val => {
        if (val === undefined || val === null) return '""';
        const stringVal = String(val);
        const escaped = stringVal.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `decimallens_audit_report_${fileName?.split('.')[0] || 'report'}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleStartEdit = () => {
    const claim = extractedClaims.find((c) => c.id === selectedClaimId);
    if (!claim) return;
    setEditMetric(claim.metric);
    setEditReported(claim.reported);
    setEditFormula(claim.formula);
    setEditExpression(claim.expression);
    setEditPage(claim.page);
    setEditContext(claim.context);
    setIsEditingClaim(true);
    setIsAddingClaim(false);
  };

  const handleSaveClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMetric || !editReported || !editExpression) {
      alert("Metric, Reported Value, and Expression are required.");
      return;
    }
    
    setShowLoadingOverlay(true);
    setProgress(0);
    setTargetProgress(30);
    setIsAnalyzing(true);
    setStatusText("Verifying calculation math...");
    try {
      const verifyRes = await fetch("/api/verify-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reported: editReported,
          expression: editExpression
        })
      });
      
      if (!verifyRes.ok) {
        throw new Error(`Verification failed: ${verifyRes.statusText}`);
      }
      
      const verifyData = await verifyRes.json();
      setTargetProgress(65);
      const claim = extractedClaims.find((c) => c.id === selectedClaimId);

      // Guard: if the user is editing (not adding) but the claim was removed
      // while the form was open, bail out gracefully instead of crashing on claim!.id
      if (!isAddingClaim && !claim) {
        alert("The claim you were editing no longer exists. Please try again.");
        setIsEditingClaim(false);
        setIsAnalyzing(false);
        setStatusText("");
        return;
      }
      
      const updatedClaim: Claim = {
        id: isAddingClaim ? `claim-custom-${Date.now()}` : claim!.id,
        metric: editMetric,
        reported: editReported,
        recalculated: verifyData.recalculated,
        formula: editFormula,
        expression: editExpression,
        verified: verifyData.verified,
        page: Number(editPage),
        context: editContext,
        reason: verifyData.reason || undefined
      };
      
      let nextClaims: Claim[];
      if (isAddingClaim) {
        nextClaims = [...extractedClaims, updatedClaim];
      } else {
        nextClaims = extractedClaims.map(c => c.id === claim!.id ? updatedClaim : c);
      }
      
      setExtractedClaims(nextClaims);
      claimsRef.current = nextClaims;
      setSelectedClaimId(updatedClaim.id);
      setIsEditingClaim(false);
      setIsAddingClaim(false);
      
      // Auto-trigger re-forecast
      await runForecastStream(nextClaims, true);
      
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to save claim.");
      setShowLoadingOverlay(false);
      setProgress(0);
      setIsAnalyzing(false);
      setStatusText("");
    }
  };

  const handleDeleteClaim = async (claimId: string) => {
    if (!confirm("Are you sure you want to delete this claim?")) return;
    
    const nextClaims = extractedClaims.filter(c => c.id !== claimId);
    setExtractedClaims(nextClaims);
    claimsRef.current = nextClaims;
    
    if (nextClaims.length > 0) {
      setSelectedClaimId(nextClaims[0].id);
    } else {
      setSelectedClaimId(null);
    }
    
    // Auto-trigger re-forecast
    try {
      setIsAnalyzing(true);
      setStatusText("Recalculating forecast after claim deletion...");
      setShowLoadingOverlay(true);
      setProgress(0);
      setTargetProgress(20);
      await runForecastStream(nextClaims, true);
    } catch (err) {
      // runForecastStream has its own internal try/catch but if the fetch
      // itself throws (network down), we must still recover the UI state.
      setErrorMsg((err as Error).message || "Forecast failed after deletion.");
      setShowLoadingOverlay(false);
      setProgress(0);
      setIsAnalyzing(false);
      setStatusText("");
    }
  };

  // Command + K / Ctrl + K palette shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  // Scroll to highlight element when selected claim changes
  useEffect(() => {
    if (!selectedClaimId) return;
    
    // Use a small timeout to allow React to render the new highlighted span first
    const timer = setTimeout(() => {
      if (highlightRef.current && leftPaneScrollRef.current) {
        const container = leftPaneScrollRef.current;
        const element = highlightRef.current;
        
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
        const targetScrollTop = relativeTop - (containerRect.height / 2) + (elementRect.height / 2);
        
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [selectedClaimId, activeAgent, parsedText]);

  const handleSelectClaim = (claimId: string) => {
    setSelectedClaimId(claimId);
    setIsFlashing(claimId);
    
    const claim = extractedClaims.find((c) => c.id === claimId);
    if (claim && claim.page) {
      setCurrentPage(claim.page);
    }

    // Auto-switch to the document tab on mobile/tablet so user sees the highlight
    setMobileActiveTab("document");

    setTimeout(() => {
      setIsFlashing(null);
    }, 1000);
  };

  const handleLoadSample = async () => {
    setFileName("SEC_Filing_Q4_2025_Draft.txt");
    setStoredFileName(null);  // sample is not a server-stored PDF
    setParsedText(SAMPLE_FILING_TEXT);
    setLowConfidence(false);
    setExtractedClaims([]);
    setForecasterResponse(null);
    setAuditorText("");
    setForecasterText("");
    setErrorMsg("");
    setSelectedClaimId(null);
    setCurrentPage(1);
    setShowLoadingOverlay(true);
    setProgress(0);
    setTargetProgress(15);
    setIsAnalyzing(true);

    try {
      await runAnalysisStream(SAMPLE_FILING_TEXT, false);
    } catch (err) {
      console.error(err);
      setErrorMsg((err as Error).message || "Failed to process sample document.");
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStoredFileName(null); // will be set once upload response arrives
    setShowLoadingOverlay(true);
    setProgress(0);
    setTargetProgress(10);
    setIsAnalyzing(true);
    setStatusText("Ingesting and parsing document...");
    setParsedText(null);
    setExtractedClaims([]);
    setForecasterResponse(null);
    setAuditorText("");
    setForecasterText("");
    setErrorMsg("");
    setSelectedClaimId(null);
    setCurrentPage(1);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${uploadRes.statusText}`);
      }

      const uploadData = await uploadRes.json();
      // stored_filename is the UUID-prefixed server-side path; use it for
      // /api/document/ requests so collisions between concurrent uploads are impossible.
      setStoredFileName(uploadData.stored_filename ?? null);
      setParsedText(uploadData.text);
      setLowConfidence(uploadData.low_confidence);

      await runAnalysisStream(uploadData.text, uploadData.low_confidence);
    } catch (err) {
      console.error(err);
      setErrorMsg((err as Error).message || "An unexpected error occurred during processing.");
      setIsAnalyzing(false);
    }
  };

  const runAnalysisStream = async (text: string, isLowConfidence: boolean) => {
    setStatusText("Initializing analysis pipeline...");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          low_confidence: isLowConfidence,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Analysis request failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body received from analysis stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes("\n\n")) {
          const parts = buffer.split("\n\n");
          const block = parts.shift() || "";
          buffer = parts.join("\n\n");

          const lines = block.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventData = line.replace("data:", "").trim();
            }
          }

          if (eventType && eventData) {
            handleSSEEvent(eventType, eventData);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg((err as Error).message || "Error reading analysis stream.");
      setShowLoadingOverlay(false);
      setProgress(0);
    } finally {
      setIsAnalyzing(false);
      setStatusText("");
      setTargetProgress(100);
    }
  };

  const handleSSEEvent = (event: string, dataStr: string) => {
    try {
      const data = JSON.parse(dataStr);
      switch (event) {
        case "parser":
          setLowConfidence(data.low_confidence);
          break;
        case "status":
          setStatusText(data.status);
          break;
        case "auditor_chunk":
          setAuditorText((prev) => prev + data.chunk);
          break;
        case "auditor_done":
          break;
        case "verified_claims":
          setExtractedClaims(data.claims);
          claimsRef.current = data.claims;
          setTargetProgress(80);
          if (data.claims && data.claims.length > 0) {
            setSelectedClaimId(data.claims[0].id);
            if (data.claims[0].page) {
              setCurrentPage(data.claims[0].page);
            }
          }
          break;
        case "forecaster_chunk":
          setForecasterText((prev) => prev + data.chunk);
          break;
        case "done":
          setForecasterResponse(data.forecaster_response);
          saveSession(claimsRef.current, data.forecaster_response);
          setTargetProgress(100);
          break;
        case "error":
          setErrorMsg(data.message);
          setShowLoadingOverlay(false);
          setProgress(0);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("Failed to parse SSE event data:", err, dataStr);
    }
  };

  const activeClaim = extractedClaims.find((c) => c.id === selectedClaimId);

  const filteredClaims = extractedClaims.filter((c) =>
    c.metric.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.reported.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // useMemo so the O(n) indexOf search over the full parsedText only runs
  // when parsedText, the active citation, or the flash state actually changes —
  // not on every keystroke or unrelated state update.
  const renderedParsedText = useMemo(() => {
    if (!parsedText) return null;
    const citation = activeClaim?.context;
    
    if (!citation) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
          {parsedText}
        </pre>
      );
    }

    // Trim the citation before searching so leading/trailing whitespace in the
    // LLM-returned context string doesn’t shift the match index.  Use the
    // trimmed length when slicing parsedText so before/match/after are correct.
    const citationTrimmed = citation.trim();
    const citationLower = citationTrimmed.toLowerCase();
    const parsedTextLower = parsedText.toLowerCase();
    const index = parsedTextLower.indexOf(citationLower);
    
    if (index === -1) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
          {parsedText}
        </pre>
      );
    }

    // Use citationTrimmed.length (not citation.length) so the slice boundaries
    // align with what we actually found in parsedText.
    const matchLen = citationTrimmed.length;
    const before = parsedText.substring(0, index);
    const match = parsedText.substring(index, index + matchLen);
    const after = parsedText.substring(index + matchLen);
    
    return (
      <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
        {before}
        <span
          ref={highlightRef}
          className={`bg-flagged-bg border-l-2 border-flagged font-bold px-1 py-0.5 rounded text-text-primary transition-all inline shadow-sm ${
            isFlashing ? "animate-citation-flash" : ""
          }`}
        >
          {match}
        </span>
        {after}
      </pre>
    );
  }, [parsedText, activeClaim, isFlashing]);

  // Helper to parse CSV lines safely
  const parsedCsv = useMemo(() => {
    if (!parsedText || !fileName?.toLowerCase().endsWith('.csv')) return null;
    
    // Check if the parsedText is actually a Markdown table from the backend parser
    if (parsedText.trim().startsWith('|')) {
      const lines = parsedText.split(/\r?\n/).filter(line => line.trim() !== '');
      const parsedRows: string[][] = [];
      
      for (const line of lines) {
        // Skip the table divider line (e.g. | --- | --- |)
        if (line.includes('---')) continue;
        
        // Split by pipe and trim each cell
        const parts = line.split('|').map(cell => cell.trim());
        
        // Since markdown table lines start and end with '|', parts[0] and parts[parts.length-1] will be empty strings.
        if (parts.length >= 3) {
          const cells = parts.slice(1, parts.length - 1);
          parsedRows.push(cells);
        }
      }
      return parsedRows;
    }
    
    const lines = parsedText.split(/\r?\n/).filter(line => line.trim() !== '');
    
    return lines.map(line => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  }, [parsedText, fileName]);

  const renderedCsvTable = useMemo(() => {
    if (!parsedCsv) return null;
    
    const activeMetric = activeClaim?.metric.toLowerCase();
    const activeReported = activeClaim?.reported.toLowerCase();
    
    return (
      <div className="w-full overflow-x-auto border border-border rounded-md bg-panel shadow-sm max-h-[500px]">
        <table className="w-full border-collapse text-left font-sans">
          <tbody>
            {parsedCsv.map((row, rowIndex) => {
              const rowText = row.join(" ").toLowerCase();
              const isHeader = rowIndex === 0;
              
              const isMatchedRow = !isHeader && activeMetric && activeReported && 
                (rowText.includes(activeMetric) || activeMetric.includes(rowText)) &&
                row.some(cell => {
                  const cleanCell = cell.toLowerCase().replace(/[\$,\s%()]/g, '');
                  const cleanReported = activeReported.replace(/[\$,\s%()]/g, '');
                  return cleanCell === cleanReported || cleanCell.includes(cleanReported) || cleanReported.includes(cleanCell);
                });

              return (
                <tr 
                  key={rowIndex} 
                  className={`border-b border-border/50 transition-all duration-150 ${
                    isHeader 
                      ? "bg-bg font-bold text-text-primary border-b-2 border-border sticky top-0" 
                      : isMatchedRow
                        ? "bg-flagged-bg/20 border-l-4 border-flagged font-semibold text-text-primary shadow-sm"
                        : "hover:bg-muted/30 text-text-secondary"
                  }`}
                >
                  {row.map((cell, cellIndex) => (
                    <td 
                      key={cellIndex} 
                      className={`p-2 sm:p-3 whitespace-nowrap ${
                        isHeader ? "text-[0.85em] uppercase tracking-wider font-semibold" : "text-[1em] font-mono"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }, [parsedCsv, activeClaim]);

  return (
    <ThemeProvider>
      <>
        <div className="flex flex-col flex-1 h-screen overflow-hidden bg-bg print:hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.csv,.md,.markdown,.txt"
        className="hidden"
      />

      {/* Premium Header */}
      <header className="h-14 bg-panel border-b border-border flex items-center justify-between px-3 sm:px-6 z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <Database className="w-5 h-5 text-accent-navy" />
          <span className="font-semibold text-text-primary tracking-tight font-sans text-sm sm:text-base">DecimalLens</span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-mono bg-border px-1.5 py-0.5 rounded text-text-secondary tracking-widest">
            v5.0 Audit
          </span>
        </div>

        {/* Command Palette trigger */}
        <button 
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 border border-border bg-bg hover:bg-border/30 transition-all rounded-md px-3 py-1.5 text-xs text-text-secondary w-40 lg:w-72 justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span className="truncate">Search claims...</span>
          </span>
          <kbd className="hidden lg:inline-block bg-panel px-1.5 py-0.5 border border-border rounded text-[10px] font-mono shadow-sm">
            ⌘K
          </kbd>
        </button>

        {/* File State Indicator */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {fileName ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 bg-muted border border-border px-2 sm:px-3 py-1 rounded-md text-xs font-medium text-text-primary max-w-[100px] xs:max-w-[150px] sm:max-w-[240px]">
                <FileText className="w-3.5 h-3.5 text-accent-navy shrink-0" />
                <span className="font-mono text-[11px] truncate">{fileName}</span>
              </div>
              
              {/* Export Findings Buttons */}
              {extractedClaims.length > 0 && (
                <div className="flex items-center gap-0.5 sm:gap-1 bg-muted border border-border p-1 rounded-md">
                  <button
                    onClick={exportToCsv}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-accent-navy hover:bg-border/30 px-2 py-1 rounded transition-all cursor-pointer font-sans"
                    title="Export verified claims and forecast projections to a CSV file"
                  >
                    <Download className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <span className="w-px h-3.5 bg-border" />
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-accent-navy hover:bg-border/30 px-2 py-1 rounded transition-all cursor-pointer font-sans"
                    title="Print report card or save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">Print</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setFileName(null);
                  setStoredFileName(null);
                  setParsedText(null);
                  setExtractedClaims([]);
                  setForecasterResponse(null);
                  setAuditorText("");
                  setForecasterText("");
                  setErrorMsg("");
                  setSelectedClaimId(null);
                }}
                className="text-xs text-text-secondary hover:text-text-primary px-2 sm:px-2.5 py-1 rounded border border-border bg-panel hover:bg-bg transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 sm:gap-2 bg-accent-navy text-white text-xs font-semibold px-3 sm:px-4 py-1.5 rounded-md hover:bg-opacity-90 transition-all cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Upload Document</span>
              <span className="xs:hidden">Upload</span>
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile/Tablet View Switcher */}
      <div className="md:hidden h-11 bg-panel border-b border-border flex shrink-0 w-full select-none">
        <button
          onClick={() => setMobileActiveTab("document")}
          className={cn(
            "flex-1 text-xs font-semibold flex items-center justify-center gap-2 transition-all border-b-2 cursor-pointer",
            mobileActiveTab === "document"
              ? "border-accent-navy text-accent-navy bg-bg/10"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Source Document</span>
        </button>
        <button
          onClick={() => setMobileActiveTab("insights")}
          className={cn(
            "flex-1 text-xs font-semibold flex items-center justify-center gap-2 transition-all border-b-2 cursor-pointer",
            mobileActiveTab === "insights"
              ? "border-accent-navy text-accent-navy bg-bg/10"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-verified" />
          <span>Audit Insights</span>
        </button>
      </div>

      {/* Main Two-Pane Layout Shell */}
      <div className="two-pane-container flex-1">
        {/* Left Pane: Source Filing Document Viewer */}
        <div className={cn("pane", mobileActiveTab === "document" ? "flex" : "hidden md:flex")}>
          <div className="h-10 border-b border-border bg-panel flex items-center justify-between px-4">
            <span className="text-xs font-semibold text-text-primary font-sans">Source Document Viewer</span>
            {fileName && (
              <span className="text-[10px] font-mono text-text-secondary">
                Format: {fileName.split('.').pop()?.toUpperCase()}
              </span>
            )}
          </div>

          <div 
            ref={leftPaneScrollRef}
            className="flex-1 flex flex-col items-center bg-bg relative overflow-hidden p-0 w-full"
          >
            {!fileName ? (
              <div className="max-w-xl w-full flex flex-col gap-6 my-auto p-8">
                <div className="border-2 border-dashed border-border rounded-lg bg-panel p-8 text-center flex flex-col items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center text-text-secondary border border-border">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">No filing document loaded</h3>
                    <p className="text-xs text-text-secondary mt-1">
                      Upload an SEC report (PDF, CSV, MD, TXT) or load the sample file to run the auditing pipeline.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full mt-2 justify-center max-w-sm">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-accent-navy text-white text-xs font-semibold py-2.5 rounded-md hover:bg-opacity-90 transition-all cursor-pointer shadow-sm"
                    >
                      Select File to Upload
                    </button>
                    <button
                      onClick={handleLoadSample}
                      className="flex-1 border border-border bg-panel text-text-primary text-xs font-semibold py-2.5 rounded-md hover:bg-bg transition-all cursor-pointer shadow-sm"
                    >
                      Load Q4 2025 Sample
                    </button>
                  </div>
                </div>

                {recentSessions.length > 0 && (
                  <div className="bg-panel border border-border rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-2 font-sans">
                        <History className="w-3.5 h-3.5 text-accent-navy" />
                        Recent Audits History
                      </h4>
                      <button
                        onClick={() => {
                          localStorage.removeItem("decimallens_sessions");
                          setRecentSessions([]);
                        }}
                        className="text-[10px] text-red-600 hover:text-red-700 font-semibold transition-all cursor-pointer font-sans"
                      >
                        Clear History
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                      {recentSessions.map((session) => (
                        <motion.div
                          key={session.id}
                          whileHover={{ x: 2, scale: 1.008 }}
                          transition={{ type: "tween", ease: "easeOut", duration: 0.15 }}
                          onClick={() => {
                            setFileName(session.fileName);
                            setStoredFileName(session.storedFileName ?? null);
                            setParsedText(session.parsedText);
                            setLowConfidence(session.lowConfidence);
                            setExtractedClaims(session.extractedClaims);
                            claimsRef.current = session.extractedClaims;
                            setForecasterResponse(session.forecasterResponse);
                            if (session.extractedClaims.length > 0) {
                              setSelectedClaimId(session.extractedClaims[0].id);
                              setCurrentPage(session.extractedClaims[0].page || 1);
                            }
                          }}
                          className="flex items-center justify-between p-3 bg-bg hover:bg-border/20 rounded-md border border-border/40 hover:border-border cursor-pointer transition-all shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <FileText className="w-4 h-4 text-accent-navy shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs text-text-primary truncate font-bold">{session.fileName}</span>
                              <span className="text-[10px] text-text-secondary font-sans">{session.timestamp}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold font-mono bg-verified-bg text-verified">
                              {session.extractedClaims.filter(c => c.verified).length}/{session.extractedClaims.length} OK
                            </span>
                            {session.forecasterResponse && (
                              <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold font-mono ${
                                session.forecasterResponse.confidence === "Low"
                                  ? "bg-flagged-bg text-flagged"
                                  : "bg-verified-bg text-verified"
                              }`}>
                                {session.forecasterResponse.confidence}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : isAnalyzing && !parsedText ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-6 h-6 border-2 border-accent-navy border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-secondary font-mono">{statusText}</span>
              </div>
            ) : fileName.toLowerCase().endsWith('.pdf') ? (
              <PdfViewer
                url={`/api/document/${storedFileName ?? fileName}`}
                currentPage={currentPage}
                onPageChange={(page) => setCurrentPage(page)}
                highlightText={activeClaim?.context}
              />
            ) : fileName.toLowerCase().endsWith('.csv') ? (
              <CsvDocumentViewer
                parsedCsv={parsedCsv}
                renderedCsvTable={renderedCsvTable}
                fileName={fileName}
              />
            ) : (
              <TextDocumentViewer
                text={parsedText || ""}
                currentPage={currentPage}
                onPageChange={(page) => setCurrentPage(page)}
                activeClaim={activeClaim}
                isFlashing={isFlashing}
                fileName={fileName}
              />
            )}

            {/* Floating active claim indicator (renders once for all viewer types) */}
            {fileName && activeClaim && (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 right-4 bg-accent-navy text-white text-[11px] p-3 rounded-md flex items-center justify-between shadow-md z-10"
              >
                <span className="flex items-center gap-2 overflow-hidden mr-2">
                  <Info className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                  <span className="font-sans truncate">
                    Metric: <strong className="font-mono">{activeClaim.metric}</strong>
                  </span>
                </span>
                <span className="bg-white/10 px-2 py-0.5 rounded text-[9px] font-mono font-bold shrink-0">
                  Page {activeClaim.page}
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Pane: Auditing & Analysis Insights */}
        <div className={cn("pane", mobileActiveTab === "insights" ? "flex" : "hidden md:flex")}>
          {/* Agent Navigation Tabs */}
          <div className="h-12 border-b border-border bg-bg flex items-center px-2 sm:px-4 justify-between shrink-0">
            <div className="flex gap-1 bg-border/40 p-0.5 rounded-lg relative z-0">
              <button
                onClick={() => setActiveAgent("auditor")}
                className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer z-10 ${
                  activeAgent === "auditor" ? "text-accent-navy font-bold" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-verified" />
                <span>Auditor</span>
                {activeAgent === "auditor" && (
                  <motion.div
                    layoutId="activeAgentTab"
                    className="absolute inset-0 bg-panel border border-border rounded-md shadow-sm -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
              <button
                onClick={() => setActiveAgent("forecaster")}
                className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer z-10 ${
                  activeAgent === "forecaster" ? "text-accent-navy font-bold" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-navy" />
                <span>Forecaster</span>
                {activeAgent === "forecaster" && (
                  <motion.div
                    layoutId="activeAgentTab"
                    className="absolute inset-0 bg-panel border border-border rounded-md shadow-sm -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            </div>

            {fileName && (
              <span className="text-[10px] font-mono text-text-secondary bg-panel border border-border px-1.5 sm:px-2 py-0.5 rounded">
                <span className="hidden xs:inline">Verified: </span>
                {extractedClaims.filter(c => c.verified).length}/{extractedClaims.length}
                <span className="hidden xs:inline"> Claims</span>
                <span className="xs:hidden"> OK</span>
              </span>
            )}
          </div>

          {/* Insights Display Container */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {errorMsg && (
              <div className="mb-4 border border-red-200 bg-red-50 text-red-700 p-4 rounded-md text-xs flex justify-between items-start">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Error:</strong> {errorMsg}
                  </div>
                </div>
                <button
                  onClick={() => setErrorMsg("")}
                  className="text-red-700 hover:text-red-950 font-bold ml-4 cursor-pointer text-[10px] uppercase tracking-wider hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {!fileName ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 my-auto">
                <FileText className="w-10 h-10 text-text-secondary mb-3 stroke-1 animate-pulse" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Awaiting Audit Execution</h4>
                <p className="text-xs text-text-secondary max-w-xs mt-1">
                  Once a document is loaded, the Dual-Agent system will scan text tables, parse formulas, and execute math verification.
                </p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {activeAgent === "auditor" ? (
                  <motion.div
                    key="auditor-pane"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">Extraction & Math Verification Grid</h3>
                        <p className="text-xs text-text-secondary mt-0.5 font-sans">
                          Deterministic calculations parsed with decimal precision. Click on a claim to jump to its source location.
                        </p>
                      </div>
                      
                      {auditorText && (
                        <button
                          onClick={() => setShowRawAuditor(!showRawAuditor)}
                          className="text-[10px] text-text-secondary hover:text-text-primary border border-border bg-panel px-2 py-1 rounded transition-all cursor-pointer font-sans"
                        >
                          {showRawAuditor ? "Hide Stream JSON" : "Show Stream JSON"}
                        </button>
                      )}
                    </div>

                    {/* Status Alert while analyzing */}
                    {isAnalyzing && statusText && (
                      <div className="border border-border bg-muted/40 rounded-md p-3 text-xs text-text-primary flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-accent-navy border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="font-mono text-[11px]">{statusText}</span>
                      </div>
                    )}

                    {isAnalyzing && extractedClaims.length === 0 && (
                      <TableSkeleton />
                    )}

                    {/* Live streaming window */}
                    {isAnalyzing && auditorText && extractedClaims.length === 0 && (
                      <StreamingBox title="Auditor JSON Response" text={auditorText} />
                    )}

                    {showRawAuditor && auditorText && (
                      <div className="mt-1">
                        <StreamingBox title="Auditor Raw Stream Output" text={auditorText} />
                      </div>
                    )}

                    {/* Claims list */}
                    {extractedClaims.length > 0 || isAddingClaim ? (
                      <div className="flex flex-col gap-4">
                        {extractedClaims.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="border border-border rounded-md overflow-hidden bg-panel shadow-sm"
                          >
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                {claimsTable.getHeaderGroups().map(headerGroup => (
                                  <tr key={headerGroup.id} className="bg-bg border-b border-border">
                                    {headerGroup.headers.map(header => {
                                      const columnId = header.column.id;
                                      const isIdOrPage = columnId === "id" || columnId === "page";
                                      return (
                                        <th 
                                          key={header.id} 
                                          onClick={header.column.getToggleSortingHandler()}
                                          className={cn(
                                            "p-2 sm:p-3 text-[10px] uppercase font-bold text-text-secondary tracking-wider cursor-pointer hover:bg-border/30 transition-all select-none",
                                            isIdOrPage && "hidden sm:table-cell"
                                          )}
                                        >
                                          <div className="flex items-center gap-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{
                                              asc: ' ▴',
                                              desc: ' ▾',
                                            }[header.column.getIsSorted() as string] ?? null}
                                          </div>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {claimsTable.getRowModel().rows.map(row => {
                                  const isSelected = row.original.id === selectedClaimId;
                                  return (
                                    <tr 
                                      key={row.id}
                                      onClick={() => handleSelectClaim(row.original.id)}
                                      className={`cursor-pointer transition-all hover:bg-bg/40 ${
                                        isSelected 
                                          ? "bg-muted font-medium border-l-2 border-accent-navy" 
                                          : row.original.verified
                                            ? "bg-panel"
                                            : "bg-flagged-bg/5 hover:bg-flagged-bg/10"
                                      }`}
                                    >
                                      {row.getVisibleCells().map(cell => {
                                        const columnId = cell.column.id;
                                        const isIdOrPage = columnId === "id" || columnId === "page";
                                        return (
                                          <td 
                                            key={cell.id} 
                                            className={cn(
                                              "p-2 sm:p-3 max-w-[200px] truncate",
                                              isIdOrPage && "hidden sm:table-cell"
                                            )}
                                          >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </motion.div>
                        )}

                        {extractedClaims.length > 0 && !isAddingClaim && (
                          <div className="flex justify-end mt-1">
                            <button
                              onClick={() => {
                                setEditMetric("");
                                setEditReported("");
                                setEditFormula("");
                                setEditExpression("");
                                setEditPage(1);
                                setEditContext("");
                                setIsAddingClaim(true);
                                setIsEditingClaim(false);
                                setSelectedClaimId(null);
                              }}
                              className="flex items-center gap-1.5 text-xs text-accent-navy hover:text-opacity-80 font-semibold border border-accent-navy/20 hover:border-accent-navy px-3 py-1.5 rounded bg-panel transition-all cursor-pointer font-sans font-semibold"
                            >
                              + Add Custom Claim
                            </button>
                          </div>
                        )}

                        {/* Active Claim Detail or Edit/Add Form Panel */}
                        {(isAddingClaim || isEditingClaim || activeClaim) && (
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`border rounded-md p-4 bg-panel ${
                              (isAddingClaim || isEditingClaim) 
                                ? "border-accent-navy/40" 
                                : activeClaim?.verified 
                                  ? "border-border" 
                                  : "border-flagged/30 bg-flagged-bg/5"
                            }`}
                          >
                            {(isAddingClaim || isEditingClaim) ? (
                              /* Edit / Add Claim Form */
                              <form onSubmit={handleSaveClaim} className="flex flex-col gap-4 text-xs">
                                <div className="flex justify-between items-center border-b border-border/60 pb-2 mb-1">
                                  <h4 className="text-xs font-bold text-text-primary font-sans">
                                    {isAddingClaim ? "Add Custom Claim" : `Edit Claim ${activeClaim?.id.toUpperCase()}`}
                                  </h4>
                                  <span className="text-[10px] text-text-secondary font-mono">Workspace Edit</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Metric Name</label>
                                    <input
                                      type="text"
                                      value={editMetric}
                                      onChange={(e) => setEditMetric(e.target.value)}
                                      placeholder="e.g. Gross Margin (FY 2025)"
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-sans bg-bg text-text-primary"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Reported Value</label>
                                    <input
                                      type="text"
                                      value={editReported}
                                      onChange={(e) => setEditReported(e.target.value)}
                                      placeholder="e.g. $142,500,000 or 24.50%"
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-mono bg-bg text-text-primary"
                                      required
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Formula Check Description</label>
                                    <input
                                      type="text"
                                      value={editFormula}
                                      onChange={(e) => setEditFormula(e.target.value)}
                                      placeholder="e.g. Revenue - COGS"
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-sans bg-bg text-text-primary"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Math Expression (for Python evaluation)</label>
                                    <input
                                      type="text"
                                      value={editExpression}
                                      onChange={(e) => setEditExpression(e.target.value)}
                                      placeholder="e.g. 142500000 - 80400000"
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-mono bg-bg text-text-primary"
                                      required
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div className="sm:col-span-1">
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Page Number</label>
                                    <input
                                      type="number"
                                      value={editPage}
                                      onChange={(e) => setEditPage(Number(e.target.value))}
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-mono bg-bg text-text-primary"
                                      min={1}
                                      required
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">Filing Citation Context</label>
                                    <input
                                      type="text"
                                      value={editContext}
                                      onChange={(e) => setEditContext(e.target.value)}
                                      placeholder="The textual context containing the claim..."
                                      className="w-full border border-border rounded px-2.5 py-1.5 outline-none focus:border-accent-navy text-xs font-sans bg-bg text-text-primary"
                                    />
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border/40">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsEditingClaim(false);
                                      setIsAddingClaim(false);
                                      if (extractedClaims.length > 0) {
                                        setSelectedClaimId(extractedClaims[0].id);
                                      }
                                    }}
                                    className="px-3.5 py-1.5 rounded border border-border bg-panel text-text-primary hover:bg-bg transition-all font-semibold cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    className="px-4 py-1.5 rounded bg-accent-navy text-white hover:bg-opacity-90 transition-all font-semibold shadow-sm cursor-pointer"
                                  >
                                    Save & Re-verify
                                  </button>
                                </div>
                              </form>
                            ) : (
                              /* Read-Only Details Panel with Edit/Delete Buttons */
                              <>
                                <div className="flex justify-between items-center border-b border-border/60 pb-2 mb-3">
                                  <h4 className="text-xs font-bold text-text-primary font-sans">
                                    Claim Details (Page {activeClaim!.page})
                                  </h4>
                                  <span className="font-mono text-[10px] text-text-secondary">
                                    {activeClaim!.id.toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-3 text-xs">
                                    <div className="grid grid-cols-2 gap-3 mb-1 bg-bg p-3 rounded-md border border-border">
                                      <div className="col-span-2">
                                        <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-text-secondary">
                                          <span>Math Faithfulness Score</span>
                                          <span className="font-mono text-text-primary font-bold">
                                            {activeClaim!.faithfulness_score 
                                              ? `${(parseFloat(activeClaim!.faithfulness_score) * 100).toFixed(1)}%` 
                                              : activeClaim!.verified ? "100.0%" : "0.0%"}
                                          </span>
                                        </div>
                                        <div className="w-full bg-border h-1.5 rounded-full mt-1.5 overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-350 ${
                                              activeClaim!.verified
                                                ? "bg-verified"
                                                : activeClaim!.faithfulness_score && parseFloat(activeClaim!.faithfulness_score) > 0.4
                                                  ? "bg-flagged"
                                                  : "bg-destructive"
                                            }`}
                                            style={{ 
                                              width: `${
                                                activeClaim!.faithfulness_score 
                                                  ? Math.min(100, parseFloat(activeClaim!.faithfulness_score) * 100) 
                                                  : activeClaim!.verified ? 100 : 0
                                              }%` 
                                            }}
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <span className="text-[9px] uppercase tracking-wider text-text-secondary block">Reported Value</span>
                                        <div className="font-mono font-bold text-text-primary text-[12.5px] mt-0.5">
                                          {activeClaim!.reported}
                                        </div>
                                      </div>

                                      <div>
                                        <span className="text-[9px] uppercase tracking-wider text-text-secondary block">Recalculated Value</span>
                                        <div className="font-mono font-bold text-accent-navy text-[12.5px] mt-0.5">
                                          {activeClaim!.recalculated || "N/A"}
                                        </div>
                                      </div>

                                      {activeClaim!.confidence_tier && (
                                        <div>
                                          <span className="text-[9px] uppercase tracking-wider text-text-secondary block">Confidence Tier</span>
                                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 border ${
                                            activeClaim!.verified
                                              ? "bg-verified-bg text-verified border-verified/10"
                                              : activeClaim!.confidence_tier === "NEAR_MISS"
                                                ? "bg-flagged-bg text-flagged border-flagged/10"
                                                : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/10 animate-pulse"
                                          }`}>
                                            {activeClaim!.confidence_tier.replace("_", " ")}
                                          </span>
                                        </div>
                                      )}

                                      {activeClaim!.tolerance_used && (
                                        <div>
                                          <span className="text-[9px] uppercase tracking-wider text-text-secondary block">Tolerance Bound</span>
                                          <span className="font-mono text-[10px] font-semibold text-text-primary block mt-1">
                                            ±{activeClaim!.tolerance_used}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <span className="text-[10px] uppercase tracking-wider text-text-secondary block">Formula Check</span>
                                      <div className="font-mono text-text-primary bg-bg px-2 py-1.5 rounded border border-border mt-1 whitespace-pre-wrap break-all leading-relaxed">
                                        {activeClaim!.formula}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase tracking-wider text-text-secondary block">Filing Citation Context</span>
                                      <div className="text-text-secondary italic mt-1 bg-muted/40 border border-border p-2.5 rounded leading-relaxed text-[11px]">
                                        {"\""}{activeClaim!.context}{"\""}
                                      </div>
                                    </div>
                                    
                                    {activeClaim!.reason && (
                                      <div className={`border rounded p-3 text-[11px] leading-relaxed mt-1 ${
                                        activeClaim!.verified 
                                          ? "bg-verified-bg/30 border-verified/15 text-verified" 
                                          : "bg-flagged-bg/30 border-flagged/15 text-flagged"
                                      }`}>
                                        <strong>Auditor Notice:</strong> {activeClaim!.reason}
                                      </div>
                                    )}

                                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border/40">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteClaim(activeClaim!.id)}
                                        className="px-3 py-1.5 rounded border border-red-500/20 text-red-600 dark:text-red-400 bg-transparent hover:bg-red-500/10 transition-all font-semibold cursor-pointer text-[11px]"
                                      >
                                        Delete Claim
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleStartEdit}
                                        className="px-4 py-1.5 rounded bg-accent-navy text-white hover:bg-opacity-90 transition-all font-semibold shadow-sm cursor-pointer text-[11px]"
                                      >
                                        Edit Claim
                                      </button>
                                    </div>
                                  </div>
                              </>
                            )}
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      !isAnalyzing && (
                        <div className="py-12 text-center text-xs text-text-secondary flex flex-col items-center gap-3">
                          <p className="font-sans">No claims extracted. Ensure your PDF has parseable financial data.</p>
                          <button
                            onClick={() => {
                              setEditMetric("");
                              setEditReported("");
                              setEditFormula("");
                              setEditExpression("");
                              setEditPage(1);
                              setEditContext("");
                              setIsAddingClaim(true);
                              setIsEditingClaim(false);
                              setSelectedClaimId(null);
                            }}
                            className="flex items-center gap-1.5 text-xs text-accent-navy hover:text-opacity-80 font-semibold border border-accent-navy/20 hover:border-accent-navy px-3 py-1.5 rounded bg-panel transition-all cursor-pointer font-sans"
                          >
                            + Add Custom Claim Manually
                          </button>
                        </div>
                      )
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="forecaster-pane"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">Forecaster Projections & Risk Analysis</h3>
                        <p className="text-xs text-text-secondary mt-0.5">
                          Downstream forecasting built from audited data. Projections based on unverified math are flagged as high risk.
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        {forecasterText && (
                          <button
                            onClick={() => setShowRawForecaster(!showRawForecaster)}
                            className="text-[10px] text-text-secondary hover:text-text-primary border border-border bg-panel px-2 py-1 rounded transition-all cursor-pointer font-sans"
                          >
                            {showRawForecaster ? "Hide JSON" : "Show JSON"}
                          </button>
                        )}
                        {extractedClaims.length > 0 && (
                          <button
                            disabled={isAnalyzing}
                            onClick={() => runForecastStream(extractedClaims)}
                            className="text-[10px] text-white bg-accent-navy hover:bg-opacity-95 disabled:bg-opacity-50 px-2.5 py-1 rounded transition-all cursor-pointer font-sans font-semibold"
                          >
                            Re-run Projections
                          </button>
                        )}
                      </div>
                    </div>

                    {extractedClaims.length === 0 ? (
                      <div className="py-12 text-center text-xs text-text-secondary">
                        <AlertTriangle className="w-8 h-8 text-flagged mx-auto mb-2 stroke-1" />
                        <strong>Awaiting Auditor Results:</strong>
                        <p className="mt-1 max-w-xs mx-auto font-sans">
                          The Auditor Agent must complete claims verification before forecasting can begin.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Status alert for Forecaster */}
                        {isAnalyzing && !forecasterResponse && (
                          <>
                            <div className="border border-border bg-muted/40 rounded-md p-3 text-xs text-text-primary flex items-center gap-3">
                              <div className="w-4 h-4 border-2 border-accent-navy border-t-transparent rounded-full animate-spin shrink-0" />
                              <span className="font-mono text-[11px]">
                                {statusText.includes("Forecaster") || statusText.includes("projection") ? statusText : "Preparing forecaster reasoning..."}
                              </span>
                            </div>
                            <ForecastSkeleton />
                          </>
                        )}

                        {/* Live streaming window for Forecaster */}
                        {isAnalyzing && forecasterText && !forecasterResponse && (
                          <StreamingBox title="Forecaster JSON Response" text={forecasterText} />
                        )}

                        {showRawForecaster && forecasterText && (
                          <div className="mt-1">
                            <StreamingBox title="Forecaster Raw Stream Output" text={forecasterText} />
                          </div>
                        )}

                        {forecasterResponse ? (
                          <>
                            {/* Handoff Contract alert */}
                            <div className={`border rounded-md p-4 flex gap-3 ${
                              forecasterResponse.confidence === "Low"
                                ? "border-flagged/40 bg-flagged-bg text-flagged"
                                : "border-verified/40 bg-verified-bg text-verified"
                            }`}>
                              {forecasterResponse.confidence === "Low" ? (
                                <AlertTriangle className="w-5 h-5 text-flagged shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 className="w-5 h-5 text-verified shrink-0 mt-0.5" />
                              )}
                              <div className="text-xs font-sans leading-relaxed">
                                <strong className="font-bold">
                                  {forecasterResponse.confidence === "Low" 
                                    ? "Dual-Agent Pipeline Restriction Flagged:" 
                                    : "Dual-Agent Pipeline Check Completed:"}
                                </strong>
                                <p className="mt-1 text-text-primary">
                                  {forecasterResponse.risk_assessment}
                                </p>
                              </div>
                            </div>

                             {/* Projections Table */}
                             <div className="border border-border rounded-md overflow-hidden bg-panel mt-2 shadow-sm">
                               <div className="bg-bg border-b border-border p-3 flex justify-between items-center">
                                 <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Growth Projections (3-Year)</span>
                                 <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-semibold font-sans ${
                                   forecasterResponse.confidence === "Low"
                                     ? "bg-flagged text-white"
                                     : "bg-verified text-white"
                                 }`}>
                                   Confidence: {forecasterResponse.confidence}
                                 </span>
                               </div>
                               <table className="w-full border-collapse text-left text-xs">
                                 <thead>
                                   {projectionsTable.getHeaderGroups().map(headerGroup => (
                                     <tr key={headerGroup.id} className="bg-bg border-b border-border">
                                       {headerGroup.headers.map(header => {
                                         const isRiskWeight = header.column.id === "risk_weight";
                                         return (
                                           <th 
                                             key={header.id}
                                             onClick={header.column.getToggleSortingHandler()}
                                             className={cn(
                                               "p-2 sm:p-3 text-[10px] uppercase font-bold text-text-secondary tracking-wider cursor-pointer hover:bg-border/30 transition-all select-none",
                                               isRiskWeight && "hidden sm:table-cell"
                                             )}
                                           >
                                             <div className="flex items-center gap-1">
                                               {flexRender(header.column.columnDef.header, header.getContext())}
                                               {{
                                                 asc: ' ▴',
                                                 desc: ' ▾',
                                               }[header.column.getIsSorted() as string] ?? null}
                                             </div>
                                           </th>
                                         );
                                       })}
                                     </tr>
                                   ))}
                                 </thead>
                                 <tbody className="divide-y divide-border/60">
                                   {projectionsTable.getRowModel().rows.map(row => (
                                     <tr key={row.id} className="hover:bg-bg/20 transition-all">
                                       {row.getVisibleCells().map(cell => {
                                         const isRiskWeight = cell.column.id === "risk_weight";
                                         return (
                                           <td 
                                             key={cell.id} 
                                             className={cn(
                                               "p-2 sm:p-3",
                                               isRiskWeight && "hidden sm:table-cell"
                                             )}
                                           >
                                             {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                           </td>
                                         );
                                       })}
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                          </>
                        ) : (
                          !isAnalyzing && (
                            <div className="py-12 text-center text-xs text-text-secondary font-sans">
                              No projection data available.
                            </div>
                          )
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette Modal */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-24">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-panel border border-border w-full max-w-lg rounded-lg shadow-2xl overflow-hidden font-sans"
            >
              <Command className="w-full flex flex-col">
                <div className="flex items-center border-b border-border px-4 py-3 gap-3">
                  <Search className="w-4 h-4 text-text-secondary" />
                  <Command.Input 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder={extractedClaims.length > 0 ? "Type a financial line item or claim ID..." : "Load a file first to search metrics..."}
                    disabled={extractedClaims.length === 0}
                    className="flex-1 bg-transparent text-text-primary text-xs outline-none border-none placeholder-text-secondary"
                    autoFocus
                  />
                  <button 
                    onClick={() => setSearchOpen(false)}
                    className="text-[10px] font-mono border border-border bg-bg px-2 py-0.5 rounded text-text-secondary cursor-pointer hover:bg-border/30"
                  >
                    ESC
                  </button>
                </div>

                <Command.List className="max-h-72 overflow-y-auto p-2">
                  <Command.Empty className="py-8 text-center text-xs text-text-secondary font-sans">
                    No matching financial metrics found.
                  </Command.Empty>

                  {extractedClaims.length === 0 ? (
                    <div className="py-8 text-center text-xs text-text-secondary font-sans">
                      No active metrics loaded. Please upload a document or load sample filing first.
                    </div>
                  ) : (
                    <Command.Group heading="Financial Claims" className="text-[10px] text-text-secondary uppercase px-2 py-1 font-semibold tracking-wider font-sans">
                      {filteredClaims.map((claim) => (
                        <Command.Item
                          key={claim.id}
                          value={`${claim.metric} ${claim.reported} ${claim.id}`}
                          onSelect={() => {
                            handleSelectClaim(claim.id);
                            setSearchOpen(false);
                          }}
                          className="flex items-center justify-between p-2.5 hover:bg-bg rounded-md text-left transition-colors cursor-pointer w-full text-xs data-[selected=true]:bg-muted data-[selected=true]:text-text-primary font-sans select-none"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-text-primary">{claim.metric}</span>
                            <span className="font-mono text-[10px] text-text-secondary">Claim {claim.id.replace("claim-", "")} | Page {claim.page}</span>
                          </div>
                          <span className="font-mono font-bold text-text-primary bg-bg border border-border px-2 py-0.5 rounded text-[11px]">
                            {claim.reported}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </Command.List>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLoadingOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[100] flex flex-col items-center justify-center font-sans text-text-primary"
          >
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* Outer spinning ring decoration */}
              <div className="absolute inset-0 rounded-full border border-dashed border-accent-navy/30 animate-spin [animation-duration:15s]" />
              
              {/* Glow effect */}
              <div className="absolute w-40 h-40 rounded-full bg-accent-navy/5 blur-xl animate-pulse" />
              
              {/* Circular Progress Ring */}
              <svg className="w-40 h-40 transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth="5"
                  fill="transparent"
                />
                <motion.circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  className="text-accent-navy"
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 70}
                  initial={{ strokeDashoffset: 2 * Math.PI * 70 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 70 * (1 - Math.floor(progress) / 100) }}
                  transition={{ ease: "easeOut", duration: 0.15 }}
                />
              </svg>
              
              {/* Text inside circular progress */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="font-mono text-3xl font-bold tracking-tight text-text-primary">
                  {Math.floor(progress)}%
                </span>
                <span className="text-[9px] text-text-secondary uppercase tracking-widest font-semibold mt-1">
                  Verification
                </span>
              </div>
            </div>

            {/* Status indicator texts */}
            <div className="text-center max-w-sm mt-8 space-y-2 px-6">
              <motion.div
                key={statusText}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="font-mono text-xs font-semibold text-text-primary h-5 truncate"
              >
                {statusText}
              </motion.div>
              <div className="text-[10px] text-text-secondary font-sans leading-normal">
                DecimalLens is running deterministic math checks on your document. Please wait.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Printable Report Layout */}
      {fileName && (
        <div className="hidden print:block p-10 font-sans max-w-4xl mx-auto text-slate-900 bg-white">
          <div className="border-b-2 border-slate-950 pb-4 mb-6">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">DecimalLens Audit Summary</h1>
                <p className="text-xs text-slate-500 mt-1 font-sans">Enterprise Financial Intelligence & Calculation Verification</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-slate-700">SOURCE FILING: {fileName}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Report Date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          {/* Verification Status Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border border-slate-200 rounded p-3">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Total Claims Extracted</span>
              <span className="text-lg font-mono font-bold text-slate-800 mt-1 block">{extractedClaims.length}</span>
            </div>
            <div className="border border-slate-200 rounded p-3 bg-emerald-50/20">
              <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-semibold block">Verified Claims</span>
              <span className="text-lg font-mono font-bold text-emerald-700 mt-1 block">
                {extractedClaims.filter(c => c.verified).length}
              </span>
            </div>
            <div className="border border-slate-200 rounded p-3 bg-amber-50/20">
              <span className="text-[9px] uppercase tracking-wider text-amber-700 font-semibold block">Flagged Mismatches</span>
              <span className="text-lg font-mono font-bold text-amber-700 mt-1 block">
                {extractedClaims.filter(c => !c.verified).length}
              </span>
            </div>
          </div>

          {/* Claims Table */}
          <div className="mb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 font-sans">Extracted & Verified Claims Grid</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50">
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">ID</th>
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Metric Name</th>
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Reported</th>
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Recalculated</th>
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Status</th>
                  <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Formula Check / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {extractedClaims.map(claim => (
                  <tr key={claim.id} className="align-top">
                    <td className="p-2 font-mono text-[10px] text-slate-500">{claim.id.toUpperCase().replace("CLAIM-", "C")}</td>
                    <td className="p-2 font-semibold text-slate-800">{claim.metric}</td>
                    <td className="p-2 font-mono text-slate-700">{claim.reported}</td>
                    <td className="p-2 font-mono text-slate-700">{claim.recalculated}</td>
                    <td className="p-2">
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        claim.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {claim.verified ? "OK" : "FLAGGED"}
                      </span>
                    </td>
                    <td className="p-2 text-[10px] text-slate-600 leading-normal">
                      <div className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-100 mb-1">{claim.formula}</div>
                      {!claim.verified && claim.reason && (
                        <div className="text-red-700 font-medium text-[9px] mt-0.5">{claim.reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Forecaster Projections */}
          {forecasterResponse && (
            <div className="mb-6 page-break-inside-avoid">
              <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50 mb-6">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-sans">Forecaster Risk Assessment Notes</h4>
                <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                  {forecasterResponse.risk_assessment}
                </p>
              </div>

              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 font-sans">3-Year Growth Projections</h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-50">
                    <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Fiscal Year</th>
                    <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Projected Revenue</th>
                    <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Projected Operating Income</th>
                    <th className="p-2 font-bold text-[10px] uppercase text-slate-600">Risk Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {forecasterResponse.projections.map((p, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{p.year}</td>
                      <td className="p-2 font-mono font-semibold">{p.projected_revenue}</td>
                      <td className="p-2 font-mono font-semibold text-slate-700">{p.projected_operating_income}</td>
                      <td className="p-2">
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          p.risk_weight.toLowerCase().includes("high") ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {p.risk_weight}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer signature */}
          <div className="border-t border-slate-200 pt-4 mt-8 flex justify-between items-center text-[9px] text-slate-400">
            <span>DecimalLens Financial Intel - Confidential Report</span>
            <span>Generated by Devanshu Yadav</span>
          </div>
        </div>
      )}
    </>
    </ThemeProvider>
  );
}
