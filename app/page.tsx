"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Sparkles, 
  Info,
  Database
} from "lucide-react";

interface Claim {
  id: string;
  metric: string;
  reported: string;
  recalculated: string;
  formula: string;
  verified: boolean;
  page: number;
  context: string;
  reason?: string;
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
    <div className="border border-border bg-[#0F172A] rounded-md p-4 font-mono text-[10px] text-emerald-400 max-h-[220px] overflow-y-auto shadow-inner flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 sticky top-0 bg-[#0F172A]">
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-semibold">{title}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-slate-400 font-sans">Streaming Agent reasoning...</span>
        </div>
      </div>
      <pre className="whitespace-pre-wrap leading-relaxed font-mono">
        {text || "{}"}
      </pre>
    </div>
  );
};

export default function Page() {
  const [activeAgent, setActiveAgent] = useState<"auditor" | "forecaster">("auditor");
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Backend Integration States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [parsedText, setParsedText] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [extractedClaims, setExtractedClaims] = useState<Claim[]>([]);
  const [forecasterResponse, setForecasterResponse] = useState<any>(null);
  const [auditorText, setAuditorText] = useState("");
  const [forecasterText, setForecasterText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [showRawAuditor, setShowRawAuditor] = useState(false);
  const [showRawForecaster, setShowRawForecaster] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const highlightRef = useRef<HTMLSpanElement | null>(null);

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
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedClaimId, activeAgent]);

  const handleSelectClaim = (claimId: string) => {
    setSelectedClaimId(claimId);
    setIsFlashing(claimId);
    setTimeout(() => {
      setIsFlashing(null);
    }, 1000);
  };

  const handleLoadSample = async () => {
    setFileName("SEC_Filing_Q4_2025_Draft.txt");
    setParsedText(SAMPLE_FILING_TEXT);
    setLowConfidence(false);
    setExtractedClaims([]);
    setForecasterResponse(null);
    setAuditorText("");
    setForecasterText("");
    setErrorMsg("");
    setSelectedClaimId(null);
    setIsAnalyzing(true);

    try {
      await runAnalysisStream(SAMPLE_FILING_TEXT, false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process sample document.");
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsAnalyzing(true);
    setStatusText("Ingesting and parsing document...");
    setParsedText(null);
    setExtractedClaims([]);
    setForecasterResponse(null);
    setAuditorText("");
    setForecasterText("");
    setErrorMsg("");
    setSelectedClaimId(null);

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
      setParsedText(uploadData.text);
      setLowConfidence(uploadData.low_confidence);

      await runAnalysisStream(uploadData.text, uploadData.low_confidence);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
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
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error reading analysis stream.");
    } finally {
      setIsAnalyzing(false);
      setStatusText("");
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
          if (data.claims && data.claims.length > 0) {
            setSelectedClaimId(data.claims[0].id);
          }
          break;
        case "forecaster_chunk":
          setForecasterText((prev) => prev + data.chunk);
          break;
        case "done":
          setForecasterResponse(data.forecaster_response);
          break;
        case "error":
          setErrorMsg(data.message);
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

  const renderParsedText = () => {
    if (!parsedText) return null;
    const citation = activeClaim?.context;
    
    if (!citation) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
          {parsedText}
        </pre>
      );
    }
    
    const citationLower = citation.toLowerCase().trim();
    const parsedTextLower = parsedText.toLowerCase();
    const index = parsedTextLower.indexOf(citationLower);
    
    if (index === -1) {
      return (
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
          {parsedText}
        </pre>
      );
    }
    
    const before = parsedText.substring(0, index);
    const match = parsedText.substring(index, index + citation.length);
    const after = parsedText.substring(index + citation.length);
    
    return (
      <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed max-w-full">
        {before}
        <span
          ref={highlightRef}
          className={`bg-[#FEF3C7] border-l-2 border-[#B45309] font-bold px-1 py-0.5 rounded text-[#0F172A] transition-all inline shadow-sm ${
            isFlashing ? "animate-citation-flash" : ""
          }`}
        >
          {match}
        </span>
        {after}
      </pre>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-screen overflow-hidden bg-bg">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.csv,.md,.markdown,.txt"
        className="hidden"
      />

      {/* Premium Header */}
      <header className="h-14 bg-panel border-b border-border flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-accent-navy" />
          <span className="font-semibold text-text-primary tracking-tight font-sans">DecimalLens</span>
          <span className="text-[10px] uppercase font-mono bg-border px-1.5 py-0.5 rounded text-text-secondary tracking-widest">
            v5.0 Audit
          </span>
        </div>

        {/* Command Palette trigger */}
        <button 
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 border border-border bg-bg hover:bg-border/30 transition-all rounded-md px-3 py-1.5 text-xs text-text-secondary w-72 justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search claims and metrics...</span>
          </span>
          <kbd className="bg-panel px-1.5 py-0.5 border border-border rounded text-[10px] font-mono shadow-sm">
            ⌘K
          </kbd>
        </button>

        {/* File State Indicator */}
        <div className="flex items-center gap-3">
          {fileName ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-[#F1F5F9] border border-border px-3 py-1 rounded-md text-xs font-medium text-text-primary">
                <FileText className="w-3.5 h-3.5 text-accent-navy" />
                <span className="font-mono text-[11px]">{fileName}</span>
              </div>
              <button
                onClick={() => {
                  setFileName(null);
                  setParsedText(null);
                  setExtractedClaims([]);
                  setForecasterResponse(null);
                  setAuditorText("");
                  setForecasterText("");
                  setErrorMsg("");
                  setSelectedClaimId(null);
                }}
                className="text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded border border-border bg-panel hover:bg-bg transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-accent-navy text-white text-xs font-semibold px-4 py-1.5 rounded-md hover:bg-opacity-90 transition-all cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </button>
          )}
        </div>
      </header>

      {/* Main Two-Pane Layout Shell */}
      <div className="two-pane-container flex-1">
        {/* Left Pane: Source Filing Document Viewer */}
        <div className="pane">
          <div className="h-10 border-b border-border bg-[#FAFAFA] flex items-center justify-between px-4">
            <span className="text-xs font-semibold text-text-primary font-sans">Source Document Viewer</span>
            {fileName && (
              <span className="text-[10px] font-mono text-text-secondary">
                Format: {fileName.split('.').pop()?.toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 p-8 overflow-y-auto flex flex-col items-center bg-zinc-100 relative">
            {!fileName ? (
              <div className="max-w-md w-full border-2 border-dashed border-border rounded-lg bg-panel p-8 text-center flex flex-col items-center gap-4 shadow-sm my-auto">
                <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center text-text-secondary border border-border">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">No filing document loaded</h3>
                  <p className="text-xs text-text-secondary mt-1">
                    Upload an SEC report (PDF, CSV, MD, TXT) or load the sample file to run the auditing pipeline.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full mt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-accent-navy text-white text-xs font-semibold py-2.5 rounded-md hover:bg-opacity-90 transition-all cursor-pointer shadow-sm"
                  >
                    Select File to Upload
                  </button>
                  <button
                    onClick={handleLoadSample}
                    className="w-full border border-border bg-panel text-text-primary text-xs font-semibold py-2.5 rounded-md hover:bg-bg transition-all cursor-pointer shadow-sm"
                  >
                    Load Q4 2025 Sample Filing
                  </button>
                </div>
              </div>
            ) : (
              /* Ingested PDF / CSV / Markdown View */
              <div className="w-full max-w-2xl bg-panel border border-border shadow-md rounded-md p-8 min-h-[600px] flex flex-col relative font-sans text-xs leading-relaxed text-slate-800">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-center font-bold text-sm tracking-tight text-text-primary uppercase truncate">
                    {fileName}
                  </h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-[10px] text-text-secondary font-mono tracking-widest uppercase">
                      Ingested Document
                    </span>
                    {lowConfidence && (
                      <span className="text-[9px] font-sans font-semibold bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.5 rounded border border-[#B45309]/20 animate-pulse">
                        Layout Warning
                      </span>
                    )}
                  </div>
                </div>

                {isAnalyzing && !parsedText ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                    <div className="w-6 h-6 border-2 border-accent-navy border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-text-secondary font-mono">{statusText}</span>
                  </div>
                ) : (
                  renderParsedText()
                )}

                {/* Floating active claim indicator */}
                {activeClaim && (
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
            )}
          </div>
        </div>

        {/* Right Pane: Auditing & Analysis Insights */}
        <div className="pane">
          {/* Agent Navigation Tabs */}
          <div className="h-12 border-b border-border bg-bg flex items-center px-4 justify-between shrink-0">
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveAgent("auditor")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeAgent === "auditor"
                    ? "bg-panel text-accent-navy shadow-sm border border-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-verified" />
                Auditor Agent
              </button>
              <button
                onClick={() => setActiveAgent("forecaster")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeAgent === "forecaster"
                    ? "bg-panel text-accent-navy shadow-sm border border-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-navy" />
                Forecaster Agent
              </button>
            </div>

            {fileName && (
              <span className="text-[10px] font-mono text-text-secondary bg-panel border border-border px-2 py-0.5 rounded">
                Verified: {extractedClaims.filter(c => c.verified).length}/{extractedClaims.length} Claims
              </span>
            )}
          </div>

          {/* Insights Display Container */}
          <div className="flex-1 p-6 overflow-y-auto">
            {errorMsg && (
              <div className="mb-4 border border-red-200 bg-red-50 text-red-700 p-4 rounded-md text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Error:</strong> {errorMsg}
                </div>
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
                      <div className="border border-border bg-[#F8FAFC] rounded-md p-3 text-xs text-text-primary flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-accent-navy border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="font-mono text-[11px]">{statusText}</span>
                      </div>
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
                    {extractedClaims.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {extractedClaims.map((claim) => {
                          const isSelected = claim.id === selectedClaimId;
                          return (
                            <div
                              key={claim.id}
                              onClick={() => handleSelectClaim(claim.id)}
                              className={`border transition-all rounded-md p-4 cursor-pointer text-left ${
                                isSelected 
                                  ? "border-accent-navy bg-panel shadow-sm ring-1 ring-accent-navy/20" 
                                  : claim.verified 
                                    ? "border-border bg-panel hover:border-slate-300"
                                    : "border-flagged/40 bg-flagged-bg/10 hover:border-flagged"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-[10px] font-mono text-text-secondary uppercase">
                                    CLAIM {claim.id.replace("claim-", "")} | Page {claim.page}
                                  </span>
                                  <h4 className="text-xs font-semibold text-text-primary mt-0.5">
                                    {claim.metric}
                                  </h4>
                                </div>

                                {claim.verified ? (
                                  <span className="inline-flex items-center gap-1 bg-[#E8F5E9] border border-verified/25 text-verified text-[10px] font-semibold px-2 py-0.5 rounded font-sans shrink-0">
                                    <CheckCircle2 className="w-3 h-3 text-verified" />
                                    Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-[#FEF3C7] border border-flagged/20 text-flagged text-[10px] font-semibold px-2 py-0.5 rounded font-sans shrink-0 animate-pulse">
                                    <AlertTriangle className="w-3 h-3 text-flagged" />
                                    Flagged
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-4 mt-3 border-t border-border/60 pt-3">
                                <div>
                                  <span className="text-[9px] uppercase tracking-wider text-text-secondary">Reported Value</span>
                                  <div className="text-xs font-mono font-bold text-text-primary mt-0.5">
                                    {claim.reported}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase tracking-wider text-text-secondary">Formula Parsing</span>
                                  <div className="text-[10px] font-mono text-text-secondary mt-0.5 truncate" title={claim.formula}>
                                    {claim.formula}
                                  </div>
                                </div>
                              </div>

                              {/* Error Reason */}
                              {!claim.verified && claim.reason && (
                                <div className="mt-3 bg-flagged-bg/40 border border-flagged/10 rounded p-2.5 text-[11px] text-[#9A3412] leading-relaxed font-sans">
                                  <strong>Auditor Notice:</strong> {claim.reason}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      !isAnalyzing && (
                        <div className="py-12 text-center text-xs text-text-secondary">
                          No claims extracted. Ensure your PDF has parseable financial data.
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
                      
                      {forecasterText && (
                        <button
                          onClick={() => setShowRawForecaster(!showRawForecaster)}
                          className="text-[10px] text-text-secondary hover:text-text-primary border border-border bg-panel px-2 py-1 rounded transition-all cursor-pointer font-sans"
                        >
                          {showRawForecaster ? "Hide Stream JSON" : "Show Stream JSON"}
                        </button>
                      )}
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
                          <div className="border border-border bg-[#F8FAFC] rounded-md p-3 text-xs text-text-primary flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-accent-navy border-t-transparent rounded-full animate-spin shrink-0" />
                            <span className="font-mono text-[11px]">
                              {statusText.includes("Forecaster") || statusText.includes("projection") ? statusText : "Preparing forecaster reasoning..."}
                            </span>
                          </div>
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
                                ? "border-flagged/40 bg-[#FEF3C7] text-[#B45309]"
                                : "border-verified/40 bg-[#E8F5E9] text-verified"
                            }`}>
                              {forecasterResponse.confidence === "Low" ? (
                                <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 className="w-5 h-5 text-verified shrink-0 mt-0.5" />
                              )}
                              <div className="text-xs font-sans leading-relaxed">
                                <strong className="font-bold">
                                  {forecasterResponse.confidence === "Low" 
                                    ? "Dual-Agent Pipeline Restriction Flagged:" 
                                    : "Dual-Agent Pipeline Check Completed:"}
                                </strong>
                                <p className="mt-1 text-slate-800">
                                  {forecasterResponse.risk_assessment}
                                </p>
                              </div>
                            </div>

                            {/* Projections Table */}
                            <div className="border border-border rounded-md overflow-hidden bg-panel mt-2">
                              <div className="bg-bg border-b border-border p-3 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Growth Projections (3-Year)</span>
                                <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-semibold font-sans ${
                                  forecasterResponse.confidence === "Low"
                                    ? "bg-[#D97706] text-white"
                                    : "bg-verified text-white"
                                }`}>
                                  Confidence: {forecasterResponse.confidence}
                                </span>
                              </div>
                              <div className="divide-y divide-border text-xs">
                                <div className="grid grid-cols-4 p-3 bg-slate-50 font-semibold text-text-secondary text-[10px] uppercase tracking-wider">
                                  <div>Fiscal Year</div>
                                  <div className="text-right">Projected Rev</div>
                                  <div className="text-right">Proj Op Income</div>
                                  <div className="text-right font-sans">Risk Weight</div>
                                </div>

                                {forecasterResponse.projections?.map((proj: any, idx: number) => {
                                  const isHighRisk = proj.risk_weight.toLowerCase().includes("high");
                                  return (
                                    <div key={idx} className="grid grid-cols-4 p-3 font-mono items-center">
                                      <div className="font-sans font-medium text-text-primary">{proj.year}</div>
                                      <div className="text-right font-bold text-text-primary">{proj.projected_revenue}</div>
                                      <div className={`text-right font-bold ${isHighRisk ? "text-flagged font-semibold animate-pulse" : "text-text-primary"}`}>
                                        {proj.projected_operating_income}
                                      </div>
                                      <div className={`text-right font-sans ${isHighRisk ? "text-[#B45309] font-medium" : "text-verified font-medium"}`}>
                                        {proj.risk_weight}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
              <div className="flex items-center border-b border-border px-4 py-3 gap-3">
                <Search className="w-4 h-4 text-text-secondary" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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

              <div className="max-h-72 overflow-y-auto p-2">
                {extractedClaims.length === 0 ? (
                  <div className="py-8 text-center text-xs text-text-secondary">
                    No active metrics loaded. Please upload a document or load sample filing first.
                  </div>
                ) : filteredClaims.length > 0 ? (
                  <div className="flex flex-col">
                    {filteredClaims.map((claim) => (
                      <button
                        key={`palette-${claim.id}`}
                        onClick={() => {
                          handleSelectClaim(claim.id);
                          setSearchOpen(false);
                        }}
                        className="flex items-center justify-between p-2.5 hover:bg-bg rounded-md text-left transition-colors cursor-pointer w-full text-xs"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-text-primary">{claim.metric}</span>
                          <span className="font-mono text-[10px] text-text-secondary">Claim {claim.id.replace("claim-", "")} | Page {claim.page}</span>
                        </div>
                        <span className="font-mono font-bold text-text-primary bg-bg border border-border px-2 py-0.5 rounded text-[11px]">
                          {claim.reported}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-text-secondary">
                    No matching financial metrics found.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
