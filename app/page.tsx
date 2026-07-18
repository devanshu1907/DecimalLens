"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  ArrowRight, 
  Maximize2, 
  Sparkles, 
  Info,
  ChevronRight,
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
  rowOffset: string; // Tailwind top position mapping for mock scroll highlight
  reason?: string;
}

const mockClaims: Claim[] = [
  {
    id: "claim-1",
    metric: "Total Revenue (Q4 2025)",
    reported: "$142,500,000",
    recalculated: "$142,500,000",
    formula: "$45,200,000 (US) + $97,300,000 (Intl)",
    verified: true,
    page: 3,
    rowOffset: "top-[190px]",
  },
  {
    id: "claim-2",
    metric: "Gross Profit",
    reported: "$62,100,000",
    recalculated: "$62,100,000",
    formula: "Revenue ($142,500,000) - COGS ($80,400,000)",
    verified: true,
    page: 3,
    rowOffset: "top-[230px]",
  },
  {
    id: "claim-3",
    metric: "Operating Income",
    reported: "$34,912,500",
    recalculated: "$34,600,000",
    formula: "Gross Profit ($62,100,000) - R&D ($15,400,000) - SG&A ($12,100,000)",
    verified: false,
    page: 3,
    rowOffset: "top-[270px]",
    reason: "Arithmetic mismatch. Reported: $34,912,500. Recalculated: $34,600,000 (Discrepancy: -$312,500). Expected explanation in footnotes missing.",
  },
  {
    id: "claim-4",
    metric: "Operating Margin",
    reported: "24.50%",
    recalculated: "24.28%",
    formula: "Operating Income ($34,600,000) / Revenue ($142,500,000)",
    verified: false,
    page: 3,
    rowOffset: "top-[310px]",
    reason: "Built on top of unverified Operating Income. Calculated margin using corrected operating income is 24.28% instead of reported 24.50%.",
  }
];

export default function Page() {
  const [activeAgent, setActiveAgent] = useState<"auditor" | "forecaster">("auditor");
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Handle Command+K / Ctrl+K palette shortcut
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

  const handleUpload = () => {
    setFileName("SEC_Filing_Q4_2025_Draft.pdf");
    // Default to select first claim for preview
    setSelectedClaimId("claim-1");
  };

  const handleSelectClaim = (claimId: string) => {
    setSelectedClaimId(claimId);
    setIsFlashing(claimId);
    // Remove citation flash class after transition duration
    setTimeout(() => {
      setIsFlashing(null);
    }, 1000);
  };

  const activeClaim = mockClaims.find((c) => c.id === selectedClaimId);

  const filteredClaims = mockClaims.filter((c) =>
    c.metric.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.reported.includes(searchQuery)
  );

  return (
    <div className="flex flex-col flex-1 h-screen overflow-hidden bg-bg">
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
            <div className="flex items-center gap-2 bg-[#F1F5F9] border border-border px-3 py-1 rounded-md text-xs font-medium text-text-primary">
              <FileText className="w-3.5 h-3.5 text-accent-navy" />
              <span className="font-mono text-[11px]">{fileName}</span>
            </div>
          ) : (
            <button 
              onClick={handleUpload}
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
            <span className="text-xs font-semibold text-text-primary font-sans">Source Document (SEC Filing)</span>
            {fileName && (
              <span className="text-[10px] font-mono text-text-secondary">Page 3 of 12</span>
            )}
          </div>

          <div className="flex-1 p-8 overflow-y-auto flex flex-col items-center justify-center bg-zinc-100 relative">
            {!fileName ? (
              <div className="max-w-md w-full border-2 border-dashed border-border rounded-lg bg-panel p-8 text-center flex flex-col items-center gap-4 shadow-sm">
                <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center text-text-secondary border border-border">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">No filing document loaded</h3>
                  <p className="text-xs text-text-secondary mt-1">
                    Upload an SEC report, regulatory draft, or Excel/Markdown sheet to initiate auditing.
                  </p>
                </div>
                <button
                  onClick={handleUpload}
                  className="bg-accent-navy text-white text-xs font-semibold px-5 py-2 rounded-md hover:bg-opacity-90 transition-all cursor-pointer shadow-sm"
                >
                  Load Q4 2025 Sample Filing
                </button>
              </div>
            ) : (
              /* Mock Interactive PDF Viewer */
              <div className="w-full max-w-xl bg-panel border border-border shadow-md rounded-md p-8 min-h-[600px] flex flex-col relative font-sans text-xs leading-relaxed text-slate-800">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-center font-bold text-sm tracking-tight text-text-primary uppercase">
                    DECIMALLENS INC.
                  </h2>
                  <p className="text-center text-[10px] text-text-secondary font-mono tracking-widest mt-1">
                    FORM 10-Q | PART I - FINANCIAL INFORMATION
                  </p>
                </div>

                <p className="mb-4">
                  The following table sets forth consolidated revenue and income metrics for the three-month period ended December 31, 2025. All metrics are compiled under strict GAAP standards, except where explicitly noted.
                </p>

                {/* Simulated PDF Table Sheet */}
                <div className="border border-border rounded overflow-hidden my-6 relative bg-panel">
                  {/* Highlight Overlay */}
                  {mockClaims.map((claim) => {
                    const isSelected = claim.id === selectedClaimId;
                    const isCurrentFlashing = claim.id === isFlashing;
                    return (
                      <div
                        key={`overlay-${claim.id}`}
                        className={`absolute left-0 right-0 h-9 transition-all pointer-events-none ${claim.rowOffset} ${
                          isSelected ? "bg-accent-navy/5 border-l-2 border-accent-navy" : ""
                        } ${isCurrentFlashing ? "animate-citation-flash" : ""}`}
                      />
                    );
                  })}

                  <div className="grid grid-cols-3 bg-[#F8FAFC] border-b border-border p-2.5 font-semibold text-[10px] text-text-secondary uppercase tracking-wider">
                    <div>Financial Line Item</div>
                    <div className="text-right">Reported Value</div>
                    <div className="text-right">Footnote Ref</div>
                  </div>

                  <div className="divide-y divide-border font-mono text-[11px]">
                    <div className="grid grid-cols-3 p-2.5 items-center">
                      <div className="font-sans font-medium text-text-primary">Total Revenue</div>
                      <div className="text-right font-bold text-text-primary">$142,500,000</div>
                      <div className="text-right text-[10px] text-text-secondary">[Sec. 1.2]</div>
                    </div>
                    <div className="grid grid-cols-3 p-2.5 items-center">
                      <div className="font-sans font-medium text-text-primary">Gross Profit</div>
                      <div className="text-right font-bold text-text-primary">$62,100,000</div>
                      <div className="text-right text-[10px] text-text-secondary">[Sec. 1.3]</div>
                    </div>
                    <div className="grid grid-cols-3 p-2.5 items-center">
                      <div className="font-sans font-medium text-text-primary">Operating Income</div>
                      <div className="text-right font-bold text-text-primary">$34,912,500</div>
                      <div className="text-right text-[10px] text-text-secondary">[Sec. 2.1]</div>
                    </div>
                    <div className="grid grid-cols-3 p-2.5 items-center">
                      <div className="font-sans font-medium text-text-primary">Operating Margin</div>
                      <div className="text-right font-bold text-text-primary">24.50%</div>
                      <div className="text-right text-[10px] text-text-secondary">[Sec. 2.2]</div>
                    </div>
                  </div>
                </div>

                <p className="mt-4">
                  For the quarter, our international market sectors generated $97,300,000 in revenues, representing a substantial growth path, while US domestic revenues stabilized at $45,200,000. COGS stood at $80,400,000. R&D investments totaled $15,400,000, and SG&A expenses were reported at $12,100,000.
                </p>

                <p className="mt-4">
                  Operating Income represents gross profit subtracting structural operational costs (R&D and SG&A). Forward guidance suggests operating margins will track toward 25.50% by early 2026.
                </p>

                {/* Floating active claim indicator */}
                {activeClaim && (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-4 left-4 right-4 bg-accent-navy text-white text-[11px] p-3 rounded-md flex items-center justify-between shadow-md"
                  >
                    <span className="flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                      <span className="font-sans truncate">
                        Linked Metric: <strong className="font-mono">{activeClaim.metric}</strong>
                      </span>
                    </span>
                    <span className="bg-white/10 px-2 py-0.5 rounded text-[9px] font-mono font-bold">
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
          <div className="h-12 border-b border-border bg-bg flex items-center px-4 justify-between">
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
                Verified: 2/4 Claims
              </span>
            )}
          </div>

          {/* Insights Display Container */}
          <div className="flex-1 p-6 overflow-y-auto">
            {!fileName ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <FileText className="w-10 h-10 text-text-secondary mb-3 stroke-1" />
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
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">Extraction & Math Verification Grid</h3>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Deterministic calculations parsed with decimal precision. Click on a claim to jump to its source code in filing.
                      </p>
                    </div>

                    {/* Claims list */}
                    <div className="flex flex-col gap-3">
                      {mockClaims.map((claim) => {
                        const isSelected = claim.id === selectedClaimId;
                        return (
                          <div
                            key={claim.id}
                            onClick={() => handleSelectClaim(claim.id)}
                            className={`border transition-all rounded-md p-4 cursor-pointer text-left ${
                              isSelected 
                                ? "border-accent-navy bg-panel shadow-sm" 
                                : claim.verified 
                                  ? "border-border bg-panel hover:border-slate-300"
                                  : "border-flagged/40 bg-flagged-bg/10 hover:border-flagged"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="text-[10px] font-mono text-text-secondary">
                                  CLAIM {claim.id.replace("claim-", "")}
                                </span>
                                <h4 className="text-xs font-semibold text-text-primary mt-0.5">
                                  {claim.metric}
                                </h4>
                              </div>

                              {claim.verified ? (
                                <span className="inline-flex items-center gap-1 bg-[#E8F5E9] border border-verified/25 text-verified text-[10px] font-semibold px-2 py-0.5 rounded font-sans">
                                  <CheckCircle2 className="w-3 h-3 text-verified" />
                                  Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-flagged-bg border border-flagged/20 text-flagged text-[10px] font-semibold px-2 py-0.5 rounded font-sans">
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
                              <div className="mt-3 bg-flagged-bg/40 border border-flagged/10 rounded p-2.5 text-[11px] text-flagged leading-relaxed font-sans">
                                <strong>Auditor Notice:</strong> {claim.reason}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">Forecaster Projections & Risk Analysis</h3>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Downstream forecasting built from audited data. Projections based on unverified math are automatically downgraded.
                      </p>
                    </div>

                    {/* Handoff Contract alert */}
                    <div className="border border-flagged/40 bg-flagged-bg/15 rounded-md p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-flagged shrink-0 mt-0.5" />
                      <div className="text-xs font-sans text-flagged leading-relaxed">
                        <strong className="font-bold">Dual-Agent Pipeline Restriction Flagged:</strong>
                        <p className="mt-1">
                          The Forecaster Agent has intercepted unverified math assertions for <span className="font-mono bg-flagged-bg/50 px-1 py-0.5 rounded text-text-primary">Operating Income (Claim 3)</span> and <span className="font-mono bg-flagged-bg/50 px-1 py-0.5 rounded text-text-primary">Operating Margin (Claim 4)</span>. Downstream financial models have been adjusted to reflect high risk.
                        </p>
                      </div>
                    </div>

                    {/* Projections Table */}
                    <div className="border border-border rounded-md overflow-hidden bg-panel mt-2">
                      <div className="bg-bg border-b border-border p-3 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Growth Projections (3-Year)</span>
                        <span className="text-[9px] uppercase bg-flagged text-white px-2 py-0.5 rounded font-semibold font-sans">
                          Confidence: Low
                        </span>
                      </div>
                      <div className="divide-y divide-border text-xs">
                        <div className="grid grid-cols-4 p-3 bg-slate-50 font-semibold text-text-secondary text-[10px]">
                          <div>Fiscal Year</div>
                          <div className="text-right">Projected Rev</div>
                          <div className="text-right">Proj Op Income</div>
                          <div className="text-right">Risk Weight</div>
                        </div>
                        <div className="grid grid-cols-4 p-3 font-mono">
                          <div className="font-sans font-medium">FY 2026 (Est)</div>
                          <div className="text-right font-bold">$154,600,000</div>
                          <div className="text-right text-flagged font-bold">$37,500,000*</div>
                          <div className="text-right text-flagged font-sans">High Risk (Math)</div>
                        </div>
                        <div className="grid grid-cols-4 p-3 font-mono">
                          <div className="font-sans font-medium">FY 2027 (Est)</div>
                          <div className="text-right font-bold">$167,700,000</div>
                          <div className="text-right text-flagged font-bold">$40,700,000*</div>
                          <div className="text-right text-flagged font-sans">High Risk (Math)</div>
                        </div>
                        <div className="grid grid-cols-4 p-3 font-mono">
                          <div className="font-sans font-medium">FY 2028 (Est)</div>
                          <div className="text-right font-bold">$182,000,000</div>
                          <div className="text-right text-flagged font-bold">$44,100,000*</div>
                          <div className="text-right text-flagged font-sans">High Risk (Math)</div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-text-secondary italic leading-relaxed">
                      * Projected Operating Income calculations have been adjusted down by 0.9% to account for structural reporting errors identified in the initial filing. Forecaster recommends holding manual review on Q4 earnings sheets before publishing final models.
                    </p>
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
                  placeholder="Type a financial line item or claim ID..."
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
                {filteredClaims.length > 0 ? (
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
