'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  Lock,
  Layers,
  CheckCircle2,
  RefreshCw,
  FileDown,
} from 'lucide-react';
import {
  TONE_OPTIONS,
  humanizeTextLocally,
  calculateAiRoboticMetrics,
  type HumanTone,
  type PdfPageModel,
  type TextBlock,
} from '@/lib/humanizer-engine';
import {
  createSamplePdfDocumentModel,
  parseUploadedPdfFile,
  exportHumanizedPdfBytes,
  generateSamplePdfBytes,
} from '@/lib/pdf-processor';
import PageReplicaCanvas from './PageReplicaCanvas';
import BlockInspectorPanel from './BlockInspectorPanel';

export default function PdfHumanizerWorkspace() {
  const [fileName, setFileName] = useState<string>('AI-Research-Report-With-Figures.pdf');
  const [pages, setPages] = useState<PdfPageModel[]>([]);
  const [activePageNumber, setActivePageNumber] = useState<number>(1);
  const [selectedTone, setSelectedTone] = useState<HumanTone>('warm_conversational');
  const [viewMode, setViewMode] = useState<
    'side_by_side' | 'humanized_only' | 'original_only' | 'structured_flow'
  >('side_by_side');
  const [textAlignment, setTextAlignment] = useState<'match_input' | 'justify' | 'left'>('match_input');
  const [showLayoutGuides, setShowLayoutGuides] = useState<boolean>(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [isHumanizingAll, setIsHumanizingAll] = useState<boolean>(false);
  const [isHumanizingPage, setIsHumanizingPage] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Loaded 3-page sample PDF with embedded figures and robotic AI paragraphs. Click "Humanize All Pages" or upload your own PDF.'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSampleDocument = useCallback(async () => {
    await Promise.resolve();
    setIsLoadingPdf(true);
    setStatusBanner('Preparing 3-page PDF with embedded figures and layout coordinates...');
    try {
      const sample = await createSamplePdfDocumentModel();
      setFileName(sample.fileName);
      setPages(sample.pages);
      setActivePageNumber(1);
      setSelectedBlockId(sample.pages[0]?.textBlocks[0]?.id ?? null);
      setStatusBanner(
        `Ready — "${sample.fileName}" (${sample.pages.length} pages, ${sample.pages.reduce(
          (acc, p) => acc + p.imageRegions.length,
          0
        )} locked visual figures). All pictures stay in their exact place.`
      );
    } catch (err) {
      console.error('Failed to load sample PDF:', err);
      setStatusBanner('Could not initialize sample document. Please try uploading a PDF file.');
    } finally {
      setIsLoadingPdf(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    createSamplePdfDocumentModel()
      .then((sample) => {
        if (!active) return;
        setFileName(sample.fileName);
        setPages(sample.pages);
        setActivePageNumber(1);
        setSelectedBlockId(sample.pages[0]?.textBlocks[0]?.id ?? null);
        setStatusBanner(
          `Ready — "${sample.fileName}" (${sample.pages.length} pages, ${sample.pages.reduce(
            (acc, p) => acc + p.imageRegions.length,
            0
          )} locked visual figures). All pictures stay in their exact place.`
        );
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load sample PDF:', err);
        setStatusBanner('Could not initialize sample document. Please try uploading a PDF file.');
      })
      .finally(() => {
        if (active) setIsLoadingPdf(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoadingPdf(true);
    setStatusBanner(
      `Analyzing & humanizing "${file.name}" page by page — copy-pasting images and rewriting text in natural human tone...`
    );

    try {
      const parsed = await parseUploadedPdfFile(file, selectedTone);
      setFileName(parsed.fileName);
      setPages(parsed.pages);
      setActivePageNumber(1);
      setSelectedBlockId(parsed.pages[0]?.textBlocks[0]?.id ?? null);
      const totalBlocks = parsed.pages.reduce((sum, p) => sum + p.textBlocks.length, 0);
      const totalImages = parsed.pages.reduce((sum, p) => sum + p.imageRegions.length, 0);
      setStatusBanner(
        `Humanized "${parsed.fileName}" — ${parsed.pages.length} page(s), ${totalBlocks} text block(s) rewritten in human tone, and ${totalImages} picture(s) copy-pasted in exact place.`
      );

      // Also refine via server-side /api/humanize route for each page
      for (const page of parsed.pages) {
        if (page.textBlocks.length === 0) continue;
        const updatedMap = await humanizeBlocksBatch(page.textBlocks, selectedTone);
        setPages((prev) =>
          prev.map((p) => {
            if (p.pageNumber !== page.pageNumber) return p;
            return {
              ...p,
              status: 'completed',
              textBlocks: p.textBlocks.map((b) => {
                const res = updatedMap.get(b.id);
                if (!res) return b;
                return {
                  ...b,
                  humanizedText: res.humanizedText,
                  status: 'done',
                  metrics: {
                    ...b.metrics,
                    roboticScoreAfter: res.roboticScoreAfter,
                    burstinessAfter: res.burstinessAfter,
                  },
                };
              }),
            };
          })
        );
      }
    } catch (err) {
      console.error('Error parsing uploaded PDF:', err);
      setStatusBanner(
        'Could not parse that PDF file. Please ensure it is a valid, unencrypted .pdf document.'
      );
    } finally {
      setIsLoadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleToneChange = async (newTone: HumanTone) => {
    setSelectedTone(newTone);
    const toneLabel = TONE_OPTIONS.find((t) => t.id === newTone)?.label || newTone;

    // Immediately update all blocks with the deterministic engine for zero-latency visual feedback
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        status: 'completed',
        textBlocks: p.textBlocks.map((b) => {
          const humanizedText = humanizeTextLocally(b.originalText, newTone, b.isHeading);
          const after = calculateAiRoboticMetrics(humanizedText);
          return {
            ...b,
            humanizedText,
            status: 'done',
            metrics: {
              ...b.metrics,
              roboticScoreAfter: after.roboticScore,
              burstinessAfter: after.burstiness,
            },
          };
        }),
      }))
    );

    setStatusBanner(
      `Re-humanized all ${pages.length} page(s) in "${toneLabel}" tone — all pictures and layout margins locked.`
    );
  };

  /**
   * Calls the server-side Gemini 3.8 Flash API route (/api/humanize) for a list of blocks,
   * with automatic fallback to the deterministic linguistic engine if offline.
   */
  const humanizeBlocksBatch = async (
    targetBlocks: TextBlock[],
    tone: HumanTone
  ): Promise<
    Map<
      string,
      {
        humanizedText: string;
        roboticScoreAfter: number;
        burstinessAfter: number;
      }
    >
  > => {
    const resultMap = new Map<
      string,
      { humanizedText: string; roboticScoreAfter: number; burstinessAfter: number }
    >();

    if (targetBlocks.length === 0) return resultMap;

    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone,
          blocks: targetBlocks.map((b) => ({
            id: b.id,
            originalText: b.originalText,
            isHeading: b.isHeading,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.results)) {
          for (const item of data.results) {
            resultMap.set(item.id, {
              humanizedText: item.humanizedText,
              roboticScoreAfter: item.roboticScoreAfter,
              burstinessAfter: item.burstinessAfter,
            });
          }
          return resultMap;
        }
      }
    } catch (err) {
      console.warn('Server humanize call fell back to local engine:', err);
    }

    // Fallback if network request failed
    for (const b of targetBlocks) {
      const humanizedText = humanizeTextLocally(b.originalText, tone, b.isHeading);
      const after = calculateAiRoboticMetrics(humanizedText);
      resultMap.set(b.id, {
        humanizedText,
        roboticScoreAfter: after.roboticScore,
        burstinessAfter: after.burstiness,
      });
    }
    return resultMap;
  };

  const handleHumanizePage = async (pageNumberToProcess: number) => {
    const targetPage = pages.find((p) => p.pageNumber === pageNumberToProcess);
    if (!targetPage || targetPage.textBlocks.length === 0) return;

    setIsHumanizingPage(true);
    setStatusBanner(
      `Humanizing Page ${pageNumberToProcess} in "${
        TONE_OPTIONS.find((t) => t.id === selectedTone)?.label
      }" tone while keeping all images locked...`
    );

    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumberToProcess
          ? {
              ...p,
              status: 'humanizing',
              textBlocks: p.textBlocks.map((b) => ({ ...b, status: 'humanizing' })),
            }
          : p
      )
    );

    const updatedMap = await humanizeBlocksBatch(targetPage.textBlocks, selectedTone);

    setPages((prev) =>
      prev.map((p) => {
        if (p.pageNumber !== pageNumberToProcess) return p;
        return {
          ...p,
          status: 'completed',
          textBlocks: p.textBlocks.map((b) => {
            const res = updatedMap.get(b.id);
            if (!res) return { ...b, status: 'done' };
            return {
              ...b,
              humanizedText: res.humanizedText,
              status: 'done',
              metrics: {
                ...b.metrics,
                roboticScoreAfter: res.roboticScoreAfter,
                burstinessAfter: res.burstinessAfter,
              },
            };
          }),
        };
      })
    );

    setIsHumanizingPage(false);
    setStatusBanner(
      `Page ${pageNumberToProcess} humanized — ${targetPage.textBlocks.length} text blocks rewritten in natural human tone; ${targetPage.imageRegions.length} picture(s) untouched.`
    );
  };

  const handleHumanizeAllPages = async () => {
    if (pages.length === 0) return;
    setIsHumanizingAll(true);

    for (const page of pages) {
      setActivePageNumber(page.pageNumber);
      setStatusBanner(
        `Humanizing Page ${page.pageNumber} of ${pages.length} — preserving exact picture coordinates and page layout...`
      );

      setPages((prev) =>
        prev.map((p) =>
          p.pageNumber === page.pageNumber
            ? {
                ...p,
                status: 'humanizing',
                textBlocks: p.textBlocks.map((b) => ({ ...b, status: 'humanizing' })),
              }
            : p
        )
      );

      const updatedMap = await humanizeBlocksBatch(page.textBlocks, selectedTone);

      setPages((prev) =>
        prev.map((p) => {
          if (p.pageNumber !== page.pageNumber) return p;
          return {
            ...p,
            status: 'completed',
            textBlocks: p.textBlocks.map((b) => {
              const res = updatedMap.get(b.id);
              if (!res) return { ...b, status: 'done' };
              return {
                ...b,
                humanizedText: res.humanizedText,
                status: 'done',
                metrics: {
                  ...b.metrics,
                  roboticScoreAfter: res.roboticScoreAfter,
                  burstinessAfter: res.burstinessAfter,
                },
              };
            }),
          };
        })
      );
    }

    setIsHumanizingAll(false);
    const totalBlocks = pages.reduce((acc, p) => acc + p.textBlocks.length, 0);
    const totalImages = pages.reduce((acc, p) => acc + p.imageRegions.length, 0);
    setStatusBanner(
      `Completed all ${pages.length} pages — ${totalBlocks} text blocks humanized in-place and ${totalImages} visual figures preserved at exact coordinates.`
    );
  };

  const handleHumanizeSingleBlock = async (blockId: string) => {
    const currentPage = pages.find((p) => p.pageNumber === activePageNumber);
    const targetBlock = currentPage?.textBlocks.find((b) => b.id === blockId);
    if (!currentPage || !targetBlock) return;

    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === activePageNumber
          ? {
              ...p,
              textBlocks: p.textBlocks.map((b) =>
                b.id === blockId ? { ...b, status: 'humanizing' } : b
              ),
            }
          : p
      )
    );

    const updatedMap = await humanizeBlocksBatch([targetBlock], selectedTone);
    const res = updatedMap.get(blockId);

    if (res) {
      setPages((prev) =>
        prev.map((p) =>
          p.pageNumber === activePageNumber
            ? {
                ...p,
                textBlocks: p.textBlocks.map((b) =>
                  b.id === blockId
                    ? {
                        ...b,
                        humanizedText: res.humanizedText,
                        status: 'done',
                        metrics: {
                          ...b.metrics,
                          roboticScoreAfter: res.roboticScoreAfter,
                          burstinessAfter: res.burstinessAfter,
                        },
                      }
                    : b
                ),
              }
            : p
        )
      );
      setStatusBanner(`Block ${blockId} humanized in-place on Page ${activePageNumber}.`);
    }
  };

  const handleUpdateBlockText = (pageNumber: number, blockId: string, newText: string) => {
    const afterMetrics = calculateAiRoboticMetrics(newText);
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumber
          ? {
              ...p,
              textBlocks: p.textBlocks.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      humanizedText: newText,
                      status: 'edited',
                      metrics: {
                        ...b.metrics,
                        roboticScoreAfter: afterMetrics.roboticScore,
                        burstinessAfter: afterMetrics.burstiness,
                      },
                    }
                  : b
              ),
            }
          : p
      )
    );
  };

  const handleResetBlock = (pageNumber: number, blockId: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumber
          ? {
              ...p,
              textBlocks: p.textBlocks.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      humanizedText: b.originalText,
                      status: 'pending',
                      metrics: {
                        ...b.metrics,
                        roboticScoreAfter: b.metrics.roboticScoreBefore,
                      },
                    }
                  : b
              ),
            }
          : p
      )
    );
    setStatusBanner(`Reset block ${blockId} on Page ${pageNumber} to original PDF text.`);
  };

  const handleExportHumanizedPdf = async () => {
    if (pages.length === 0) return;
    setIsExportingPdf(true);
    setStatusBanner('Reconstructing multi-page PDF with locked images and humanized text boxes...');

    try {
      const pdfBytes = await exportHumanizedPdfBytes(pages, textAlignment);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = fileName.replace(/\.pdf$/i, '');
      a.href = url;
      a.download = `${baseName}-humanized.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusBanner(`Exported "${baseName}-humanized.pdf" (${pages.length} pages with all images intact).`);
    } catch (err) {
      console.error('Export PDF error:', err);
      setStatusBanner('Failed to export PDF file. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadRawSamplePdf = async () => {
    setStatusBanner('Generating sample input PDF file for download...');
    try {
      const bytes = await generateSamplePdfBytes();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Sample-AI-Report-With-Images.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusBanner('Downloaded "Sample-AI-Report-With-Images.pdf" — you can also upload any PDF from your device.');
    } catch (err) {
      console.error('Sample download error:', err);
    }
  };

  const activePage = pages.find((p) => p.pageNumber === activePageNumber) ?? pages[0];

  // Calculate overall document humanization stats
  const allBlocks = pages.flatMap((p) => p.textBlocks);
  const humanizedBlocksCount = allBlocks.filter(
    (b) => b.status === 'done' || b.status === 'edited'
  ).length;
  const totalImagesLocked = pages.reduce((acc, p) => acc + p.imageRegions.length, 0);

  const avgAiBefore =
    allBlocks.length > 0
      ? Math.round(
          allBlocks.reduce((acc, b) => acc + b.metrics.roboticScoreBefore, 0) / allBlocks.length
        )
      : 0;
  const avgAiAfter =
    allBlocks.length > 0
      ? Math.round(
          allBlocks.reduce((acc, b) => acc + b.metrics.roboticScoreAfter, 0) / allBlocks.length
        )
      : 0;
  const avgHumanBefore = 100 - avgAiBefore;
  const avgHumanAfter = 100 - avgAiAfter;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Mandatory 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 bg-white sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          VerbaForma
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#workspace"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Workspace
          </a>
          <a
            href="#replica"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Page Replica
          </a>
          <a
            href="#inspector"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Block Inspector
          </a>
          <a
            href="#workflow"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportHumanizedPdf}
            disabled={isExportingPdf || pages.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingPdf ? 'Exporting PDF...' : 'Export Humanized PDF'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main id="workspace" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Hero & Primary Action Controls */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Column: Title, Explanation & Tone Selection */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs font-medium text-blue-700 mb-1.5">
                  Page-by-Page PDF Layout &amp; Image Preservation Engine
                </div>
                <h1
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
                  style={{ textWrap: 'balance' }}
                >
                  Humanize PDF Text Page by Page Without Moving a Single Picture
                </h1>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-2xl">
                  Upload any PDF file. Every page is analyzed and reconstructed in place: photos,
                  diagrams, charts, and margins stay 100% locked at their exact original coordinates
                  while stiff AI paragraphs are rewritten in a natural human tone.
                </p>
              </div>

              {/* Human Tone Selector (Interactive Segmented Buttons) */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-slate-800 mb-2">
                  Select Human Writing Tone ({TONE_OPTIONS.find((t) => t.id === selectedTone)?.urduHint})
                </div>
                <div
                  role="group"
                  aria-label="Human Writing Tone"
                  className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg border border-slate-200/80"
                >
                  {TONE_OPTIONS.map((tone) => {
                    const active = selectedTone === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => handleToneChange(tone.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tone.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {TONE_OPTIONS.find((t) => t.id === selectedTone)?.description}
                </p>
              </div>
            </div>

            {/* Right Column: Upload PDF Dropzone & Primary Humanize Triggers */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-900">
                    Input PDF Document
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500 truncate max-w-[220px]">
                    {fileName}
                  </span>
                </div>

                <label
                  htmlFor="pdf-upload-input"
                  className="flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-blue-600 bg-white rounded-md p-4 cursor-pointer transition-colors text-center"
                >
                  <Upload className="w-5 h-5 text-blue-600 mb-1.5" />
                  <span className="text-xs font-semibold text-slate-900">
                    Click to Upload Any PDF File (.pdf)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Preserves all embedded pictures, figures, and multi-column layouts
                  </span>
                  <input
                    ref={fileInputRef}
                    id="pdf-upload-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>

                <div className="flex items-center justify-between gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={loadSampleDocument}
                    disabled={isLoadingPdf}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reload 3-Page Sample PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadRawSamplePdf}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileDown className="w-3 h-3" />
                    <span>Download Sample Input PDF</span>
                  </button>
                </div>
              </div>

              {/* Primary Execution Buttons */}
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleHumanizeAllPages}
                  disabled={isHumanizingAll || isHumanizingPage || isLoadingPdf || pages.length === 0}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isHumanizingAll
                      ? 'Humanizing All Pages...'
                      : `Humanize All ${pages.length} Pages`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleHumanizePage(activePageNumber)}
                  disabled={isHumanizingAll || isHumanizingPage || isLoadingPdf || !activePage}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <span>
                    {isHumanizingPage
                      ? `Humanizing Page ${activePageNumber}...`
                      : `Humanize Page ${activePageNumber} Only`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Unboxed Document Metrics & Live Status Bar (Zero-Pill Discipline) */}
          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
              <span className="font-sans font-semibold text-slate-900">Document Telemetry:</span>
              <span>{pages.length} Pages</span>
              <span aria-hidden="true">·</span>
              <span>
                {humanizedBlocksCount}/{allBlocks.length} Text Blocks Humanized
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-800">
                {totalImagesLocked} Pictures/Figures Locked in Exact Place
              </span>
              <span aria-hidden="true">·</span>
              <span>
                AI Detector (GPTZero/Turnitin): <strong>{avgAiBefore}% AI</strong> →{' '}
                <strong className="text-emerald-700">{avgAiAfter}% AI (&lt;10% Pass)</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Human Tone: <strong>{avgHumanBefore}%</strong> →{' '}
                <strong className="text-emerald-700">{avgHumanAfter}%</strong>
              </span>
            </div>

            <div
              role="status"
              aria-live="polite"
              className="text-xs text-slate-700 font-medium truncate"
            >
              {statusBanner}
            </div>
          </div>
        </section>

        {/* Workspace Split: Left Page-by-Page Navigator + Right Visual Page Replica & Block Editor */}
        <section id="replica" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar: Page-by-Page Thumbnail & Lock List */}
          <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h2 className="text-xs font-semibold text-slate-900">
                Page-by-Page Navigator ({pages.length})
              </h2>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                Page {activePageNumber} of {pages.length}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
              {pages.map((p) => {
                const isSelected = p.pageNumber === activePageNumber;
                const doneCount = p.textBlocks.filter(
                  (b) => b.status === 'done' || b.status === 'edited'
                ).length;
                const isAllDone =
                  p.textBlocks.length > 0 && doneCount === p.textBlocks.length;

                return (
                  <div
                    key={p.pageNumber}
                    className={`rounded-md border transition-colors p-2.5 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/30'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActivePageNumber(p.pageNumber);
                        setSelectedBlockId(p.textBlocks[0]?.id ?? null);
                      }}
                      className="w-full text-left flex items-start gap-3"
                    >
                      {/* Mini Page Thumbnail */}
                      <div className="w-14 h-20 bg-slate-100 border border-slate-200 rounded-xs overflow-hidden shrink-0 flex items-center justify-center">
                        {p.originalPageDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.originalPageDataUrl}
                            alt={`Thumbnail of Page ${p.pageNumber}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-slate-900">
                            Page {p.pageNumber}
                          </span>
                          {isAllDone && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600 font-mono tabular-nums mt-1">
                          {doneCount}/{p.textBlocks.length} Text Blocks
                        </div>

                        <div className="text-[11px] text-amber-800 font-mono tabular-nums mt-0.5 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5 shrink-0" />
                          <span>{p.imageRegions.length} Pic(s) Locked</span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right 9 Columns: Page Replica View + Block Inspector */}
          <div className="lg:col-span-9 space-y-6">
            {/* Toolbar for Page Replica */}
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              {/* Page Stepping Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActivePageNumber((prev) => Math.max(1, prev - 1))
                  }
                  disabled={activePageNumber <= 1}
                  aria-label="Previous Page"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-40 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev Page</span>
                </button>

                <span className="text-xs font-semibold text-slate-900 font-mono tabular-nums px-2">
                  Page {activePageNumber} / {pages.length}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setActivePageNumber((prev) => Math.min(pages.length, prev + 1))
                  }
                  disabled={activePageNumber >= pages.length}
                  aria-label="Next Page"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-40 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Next Page</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* View Mode, Alignment & Bounding Box Overlay Toggles */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Page View Mode"
                  className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200/80"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('side_by_side')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === 'side_by_side'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('structured_flow')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === 'structured_flow'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ordered Flow (Pics + Text)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('humanized_only')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === 'humanized_only'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Humanized Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('original_only')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === 'original_only'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Original Only
                  </button>
                </div>

                {/* Text Alignment Selector */}
                <div
                  role="group"
                  aria-label="Text Alignment Mode"
                  className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200/80"
                >
                  <button
                    type="button"
                    onClick={() => setTextAlignment('match_input')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      textAlignment === 'match_input'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Same as Input PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlignment('justify')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      textAlignment === 'justify'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Aligned Justified
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlignment('left')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                      textAlignment === 'left'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Aligned Left
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLayoutGuides((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    showLayoutGuides
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{showLayoutGuides ? 'Hide Boxes' : 'Show Boxes'}</span>
                </button>
              </div>
            </div>

            {/* Active Page Visual Replica */}
            {activePage ? (
              <>
                <PageReplicaCanvas
                  page={activePage}
                  viewMode={viewMode}
                  textAlignment={textAlignment}
                  showLayoutGuides={showLayoutGuides}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  onHumanizeSingleBlock={handleHumanizeSingleBlock}
                />

                {/* Detailed Block & Locked Image Inspector */}
                <div id="inspector">
                  <BlockInspectorPanel
                    page={activePage}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={setSelectedBlockId}
                    onUpdateBlockText={handleUpdateBlockText}
                    onHumanizeSingleBlock={handleHumanizeSingleBlock}
                    onResetBlock={handleResetBlock}
                  />
                </div>
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-500">
                Loading PDF pages...
              </div>
            )}
          </div>
        </section>

        {/* How It Works Section (Editorial Numbering, Mechanism-to-Outcome) */}
        <section id="workflow" className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="max-w-2xl mb-5">
            <h2 className="text-base font-bold text-slate-900">
              How Page-by-Page Layout &amp; Picture Preservation Works
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Designed specifically so your output PDF looks identical in layout to your input PDF—with every photo, chart, and diagram untouched.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                01. Pixel-Accurate Base Layer
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Each PDF page is rendered at 2x Retina DPI as an immutable visual canvas. Every embedded photograph, schematic, table border, and diagram remains locked at its exact pixel coordinates.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                02. Bounding-Box Text Isolation
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Text lines are grouped into paragraphs with exact <span className="font-mono">(x, y, width, height)</span> PDF coordinates and local background color sampling so only the text blocks are targeted.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                03. In-Place Human Tone Fitting
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Gemini 3.8 Flash rewrites robotic AI phrasing into natural human prose matched to the original character footprint, auto-fitting the humanized text right back into the original box.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 mt-8">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>VerbaForma — Page-by-Page PDF Humanizer with Locked Image Coordinates</span>
          <span>All pictures, diagrams, and page geometries remain 100% in place</span>
        </div>
      </footer>
    </div>
  );
}
