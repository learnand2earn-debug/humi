'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Download,
  RefreshCw,
  Send,
  Copy,
  Paperclip,
  RotateCcw,
  Check,
  X,
  FileText,
  Upload,
} from 'lucide-react';
import {
  DOCUMENT_TYPE_CATALOG,
  PROFESSIONAL_TEMPLATES,
  SAMPLE_IMPORTED_PDF_DATA,
  AgentRewriteTone,
  AudienceLevel,
  CanonicalDocumentModel,
  DocumentVersionRecord,
  TemplateStyleConfig,
  ChatGptMessage,
  generateChatGptStyleResponse,
  applyPromptToDocumentOrSection,
  editDocumentWithChatGptPrompt,
  buildCanonicalDocumentFromImportedText,
  extractTextFromUploadedPdfOrTextFile,
  runControlledHumanizePipeline,
  applyEditorQuickAction,
  exportCanonicalDocumentToPdfBytes,
  exportCanonicalDocumentToDocxBytes,
} from '@/lib/document-agent-engine';

type RightPanelView = 'preview' | 'sections' | 'versions';

const TONES: AgentRewriteTone[] = ['Professional', 'Friendly', 'Academic', 'Simple', 'Persuasive'];

const AUDIENCES: AudienceLevel[] = [
  'Executive / C-Suite',
  'Client / Small Business Owner',
  'General Public',
  'Technical / Specialist',
  'Academic / Peer Review',
];

const STARTER_PROMPTS = [
  {
    label: 'Business Proposal',
    prompt:
      'Mujhe digital marketing agency ke liye client Nova Retail Group ka complete Business Proposal chahiye ($8,500/month budget, 12 weeks timeline, target 4.0x ROAS).',
    context: '',
  },
  {
    label: 'ATS CV / Resume',
    prompt:
      'Write a complete ATS-ready CV for Ayesha Tariq, Senior Full-Stack Engineer with 4 years experience in Next.js, TypeScript, PostgreSQL, and AWS who reduced API latency by 38%.',
    context: '',
  },
  {
    label: 'Academic Report',
    prompt:
      'Create a structured academic research report on Decentralized Solar Micro-Grids in Urban Corridors with 18.4% transmission loss reduction and 31% thermal resilience gain.',
    context: '',
  },
  {
    label: 'Landing Page & Email',
    prompt:
      'Write persuasive SaaS landing page and launch email copy for VerbaForma Enterprise that preserves 100% of PDF layouts and humanizes text under 10% AI score.',
    context: '',
  },
];

let clientSeqCounter = 200;
function nextClientId(prefix: string): string {
  clientSeqCounter += 1;
  return `${prefix}-${clientSeqCounter}`;
}

export default function DocumentAgentSuite() {
  const [rightView, setRightView] = useState<RightPanelView>('preview');
  const [tone, setTone] = useState<AgentRewriteTone>('Persuasive');
  const [audience, setAudience] = useState<AudienceLevel>('Client / Small Business Owner');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateStyleConfig>(
    () => PROFESSIONAL_TEMPLATES[0]
  );

  const [mobilePane, setMobilePane] = useState<'both' | 'chat' | 'document'>('both');
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const [chatActionMode, setChatActionMode] = useState<'edit_current' | 'generate_new'>(
    'generate_new'
  );
  const [importedPdfMeta, setImportedPdfMeta] = useState<{
    fileName: string;
    pageCount: number;
    sectionCount: number;
  } | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState<boolean>(false);

  const [chatInputPrompt, setChatInputPrompt] = useState<string>('');
  const [chatAttachedContext, setChatAttachedContext] = useState<string>('');
  const [showContextBox, setShowContextBox] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedDoc, setCopiedDoc] = useState<boolean>(false);
  const [showRawCompare, setShowRawCompare] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);
  const [sectionPromptMap, setSectionPromptMap] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready — Import any PDF to edit via ChatGPT prompts, or type a prompt below to generate a new document (<10% AI score).'
  );

  const [chatMessages, setChatMessages] = useState<ChatGptMessage[]>(() => {
    const initialUserMsg: ChatGptMessage = {
      id: 'msg-init-user',
      role: 'user',
      promptText:
        'Mujhe digital marketing agency (Apex Growth Digital) ke liye client Nova Retail Group ka complete Business Proposal chahiye ($8,500/month retainer, 12 weeks timeline, scale ROAS from 2.1x to 4.0x).',
      createdAt: '2026-11-04T09:00:00.000Z',
    };
    const initialAssistantMsg = generateChatGptStyleResponse({
      prompt: initialUserMsg.promptText,
      tone: 'Persuasive',
      audience: 'Client / Small Business Owner',
      lengthTarget: 'Medium (2–3 Pages)',
    });
    initialAssistantMsg.id = 'msg-init-assistant';
    initialAssistantMsg.createdAt = '2026-11-04T09:00:05.000Z';
    if (initialAssistantMsg.canonicalDocument) {
      initialAssistantMsg.canonicalDocument.id = 'doc-init-1';
      initialAssistantMsg.canonicalDocument.createdAt = '2026-11-04T09:00:05.000Z';
      initialAssistantMsg.canonicalDocument.updatedAt = '2026-11-04T09:00:05.000Z';
    }
    return [initialUserMsg, initialAssistantMsg];
  });

  const [currentDoc, setCurrentDoc] = useState<CanonicalDocumentModel>(() => {
    const initialAssistant = chatMessages.find((m) => m.role === 'assistant');
    return initialAssistant!.canonicalDocument!;
  });

  const [versionHistory, setVersionHistory] = useState<DocumentVersionRecord[]>(() => [
    {
      id: 'ver-1',
      documentId: currentDoc.id,
      versionNumber: 1,
      label: 'Initial Prompt Draft (v1)',
      createdAt: currentDoc.createdAt,
      documentSnapshot: currentDoc,
    },
  ]);

  const latestAssistantMsg = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant') return chatMessages[i];
    }
    return undefined;
  }, [chatMessages]);

  const averageAiScoreAfter = useMemo(() => {
    if (!currentDoc.sections.length) return 4;
    const sum = currentDoc.sections.reduce((acc, s) => acc + s.metrics.aiScoreAfter, 0);
    return Math.round(sum / currentDoc.sections.length);
  }, [currentDoc]);

  const totalLockedFactsCount = useMemo(
    () => currentDoc.sections.reduce((acc, s) => acc + s.lockedFacts.length, 0),
    [currentDoc]
  );

  const pushVersion = (updatedDoc: CanonicalDocumentModel, label: string) => {
    const nextVerNum = versionHistory.length + 1;
    const stamped: CanonicalDocumentModel = {
      ...updatedDoc,
      currentVersionNumber: nextVerNum,
      updatedAt: new Date().toISOString(),
    };
    setCurrentDoc(stamped);
    setVersionHistory((prev) => [
      {
        id: nextClientId('ver'),
        documentId: stamped.id,
        versionNumber: nextVerNum,
        label: `${label} (v${nextVerNum})`,
        createdAt: stamped.updatedAt,
        documentSnapshot: stamped,
      },
      ...prev,
    ]);
  };

  const handleImportPdfFromData = (params: {
    fileName: string;
    rawText: string;
    pageTexts: string[];
    pageCount: number;
    customInstruction?: string;
  }) => {
    const { fileName, rawText, pageTexts, pageCount, customInstruction } = params;
    const userMsg: ChatGptMessage = {
      id: nextClientId('user-import'),
      role: 'user',
      promptText:
        customInstruction ||
        `Imported PDF "${fileName}" (${pageCount} pages) — Extract structure, humanize under 10% AI score, and open for ChatGPT prompt editing.`,
      attachedInputContext: rawText.slice(0, 800),
      createdAt: new Date().toISOString(),
    };

    const { chatReply, canonicalDocument } = buildCanonicalDocumentFromImportedText({
      fileName,
      rawText,
      pageTexts,
      userPromptInstruction: customInstruction,
      tone,
      audience,
    });

    setChatMessages((prev) => [...prev, userMsg, chatReply]);
    pushVersion(canonicalDocument, `Imported PDF: ${fileName.slice(0, 26)}`);
    setImportedPdfMeta({
      fileName,
      pageCount,
      sectionCount: canonicalDocument.sections.length,
    });
    setChatActionMode('edit_current');
    setRightView('preview');
    setStatusMessage(
      `Imported "${fileName}" (${canonicalDocument.sections.length} sections, ${chatReply.aiScoreAfter}% AI Score). Mode set to "Edit Current / PDF" — type any prompt to edit it!`
    );
  };

  const handleUploadPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingPdf(true);
    setStatusMessage(`Importing "${file.name}" and extracting structured sections...`);
    try {
      const extracted = await extractTextFromUploadedPdfOrTextFile(file);
      handleImportPdfFromData({
        fileName: extracted.fileName,
        rawText: extracted.rawText,
        pageTexts: extracted.pageTexts,
        pageCount: extracted.pageCount,
        customInstruction: chatInputPrompt.trim() || undefined,
      });
      if (chatInputPrompt.trim()) {
        setChatInputPrompt('');
      }
    } finally {
      setIsImportingPdf(false);
      e.target.value = '';
    }
  };

  const handleLoadSamplePdfToEdit = () => {
    setIsImportingPdf(true);
    try {
      handleImportPdfFromData({
        fileName: SAMPLE_IMPORTED_PDF_DATA.fileName,
        rawText: SAMPLE_IMPORTED_PDF_DATA.pageTexts.join('\n\n'),
        pageTexts: SAMPLE_IMPORTED_PDF_DATA.pageTexts,
        pageCount: SAMPLE_IMPORTED_PDF_DATA.pageCount,
      });
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleSendPrompt = async (
    overridePrompt?: string,
    overrideContext?: string,
    forceMode?: 'edit_current' | 'generate_new'
  ) => {
    const promptToUse = (overridePrompt !== undefined ? overridePrompt : chatInputPrompt).trim();
    const contextToUse = (
      overrideContext !== undefined ? overrideContext : chatAttachedContext
    ).trim();

    if (!promptToUse && !contextToUse) return;

    const finalPrompt =
      promptToUse ||
      'Analyze this input text, suggest missing details, structure it into headings, and humanize it under 10% AI score.';

    const effectiveMode = forceMode || chatActionMode;

    const userMsg: ChatGptMessage = {
      id: nextClientId('user'),
      role: 'user',
      promptText: finalPrompt,
      attachedInputContext: contextToUse || undefined,
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (overridePrompt === undefined) setChatInputPrompt('');
    setIsGenerating(true);

    // MODE A: Edit Imported / Current PDF in-place via ChatGPT Prompt
    if (effectiveMode === 'edit_current' && !contextToUse) {
      setStatusMessage(
        `Editing "${currentDoc.title}" via ChatGPT prompt and re-humanizing (<10% AI score)...`
      );
      try {
        const { chatReply, updatedDocument } = editDocumentWithChatGptPrompt({
          doc: currentDoc,
          promptInstruction: finalPrompt,
          tone,
          audience,
        });
        setChatMessages((prev) => [...prev, chatReply]);
        pushVersion(updatedDocument, `Edited: ${finalPrompt.slice(0, 28)}`);
        setStatusMessage(
          `Updated "${updatedDocument.title}" via prompt — ${chatReply.aiScoreAfter}% AI Score (<10% Pass).`
        );
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // MODE B: Generate New Document from Prompt
    setStatusMessage(
      'Generating structured document, auto-filling missing details, and humanizing (<10% AI score)...'
    );

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chatgpt',
          prompt: finalPrompt,
          inputContext: contextToUse,
          tone,
          audience,
          lengthTarget: 'Medium (2–3 Pages)',
          useGeminiRefinement: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.chatReply) {
          setChatMessages((prev) => [...prev, data.chatReply]);
          if (data.document) {
            pushVersion(data.document, data.document.title.slice(0, 36));
          }
          setStatusMessage(
            `Generated "${data.document?.title || 'Document'}" — ${data.chatReply.aiScoreAfter}% AI Score (<10% Pass).`
          );
          return;
        }
      }

      const fallbackReply = generateChatGptStyleResponse({
        prompt: finalPrompt,
        inputContext: contextToUse,
        tone,
        audience,
      });
      setChatMessages((prev) => [...prev, fallbackReply]);
      if (fallbackReply.canonicalDocument) {
        pushVersion(
          fallbackReply.canonicalDocument,
          fallbackReply.canonicalDocument.title.slice(0, 36)
        );
      }
      setStatusMessage(
        `Generated "${fallbackReply.canonicalDocument?.title || 'Document'}" — ${
          fallbackReply.aiScoreAfter
        }% AI Score (<10% Pass).`
      );
    } catch {
      const fallbackReply = generateChatGptStyleResponse({
        prompt: finalPrompt,
        inputContext: contextToUse,
        tone,
        audience,
      });
      setChatMessages((prev) => [...prev, fallbackReply]);
      if (fallbackReply.canonicalDocument) {
        pushVersion(
          fallbackReply.canonicalDocument,
          fallbackReply.canonicalDocument.title.slice(0, 36)
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSectionQuickAction = (
    sectionId: string,
    action: 'rewrite' | 'humanize' | 'expand' | 'shorten' | 'improve'
  ) => {
    const updatedSections = currentDoc.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const modifiedParas = applyEditorQuickAction(sec.paragraphs, action, tone, audience);
      const pipeline = runControlledHumanizePipeline(modifiedParas, tone, audience);
      return {
        ...sec,
        paragraphs: pipeline.humanizedParagraphs,
        humanizeStatus: 'humanized' as const,
        pipelineStage: 'Final Humanized Text' as const,
        lockedFacts: pipeline.lockedFacts,
        metrics: {
          aiScoreBefore: pipeline.aiScoreBefore,
          aiScoreAfter: pipeline.aiScoreAfter,
          burstinessAfter: pipeline.burstinessAfter,
          meaningPreserved: pipeline.meaningPreserved,
        },
      };
    });

    const updatedDoc: CanonicalDocumentModel = {
      ...currentDoc,
      tone,
      audience,
      sections: updatedSections,
    };
    pushVersion(updatedDoc, `Section ${action}`);
    setStatusMessage(`Applied "${action}" on section (<10% AI Score, all facts locked).`);
  };

  const handleApplySectionPrompt = (sectionId: string, instruction: string) => {
    const cleanInst = instruction.trim();
    if (!cleanInst) return;
    const updatedDoc = applyPromptToDocumentOrSection({
      doc: currentDoc,
      promptInstruction: cleanInst,
      targetSectionId: sectionId,
      tone,
      audience,
    });
    pushVersion(updatedDoc, `Prompt update: ${cleanInst.slice(0, 24)}`);
    setSectionPromptMap((prev) => ({ ...prev, [sectionId]: '' }));
    setStatusMessage(`Updated section via prompt: "${cleanInst.slice(0, 45)}".`);
  };

  const handleAcceptOrRejectSection = (sectionId: string, decision: 'accepted' | 'rejected') => {
    const updatedSections = currentDoc.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      if (decision === 'rejected') {
        return {
          ...sec,
          paragraphs: [...sec.originalParagraphs],
          humanizeStatus: 'rejected' as const,
        };
      }
      return {
        ...sec,
        humanizeStatus: 'accepted' as const,
      };
    });
    setCurrentDoc({ ...currentDoc, sections: updatedSections });
  };

  const handleCopyFullDocument = async () => {
    const fullText = currentDoc.sections
      .map((s, idx) => `${idx + 1}. ${s.heading}\n${s.paragraphs.join('\n\n')}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleExportPdf = async (
    cleanMinimalStructure = true,
    targetDoc: CanonicalDocumentModel = currentDoc
  ) => {
    setIsExportingPdf(true);
    try {
      const pdfBytes = await exportCanonicalDocumentToPdfBytes(targetDoc, selectedTemplate, {
        cleanMinimalStructure,
      });
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = cleanMinimalStructure
        ? `${targetDoc.documentTypeId}_clean_humanized.pdf`
        : `${targetDoc.documentTypeId}_template_humanized.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage(
        cleanMinimalStructure
          ? `Exported clean structure-preserved humanized PDF ("${filename}").`
          : `Exported branded template humanized PDF ("${filename}").`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportDocx = () => {
    setIsExportingDocx(true);
    try {
      const docxBytes = exportCanonicalDocumentToDocxBytes(currentDoc, selectedTemplate);
      const blob = new Blob([docxBytes as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDoc.documentTypeId}_humanized.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage(`Exported "${currentDoc.documentTypeId}_humanized.docx".`);
    } finally {
      setIsExportingDocx(false);
    }
  };

  return (
    <section
      id="ai-document-generator-agent-suite"
      className="w-full bg-[#171717] text-[#ECECEC] border-t border-[#2F2F2F] py-6 sm:py-10 overflow-x-hidden"
    >
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 space-y-4 sm:space-y-5">
        {/* Clean Minimal Dark Section Header */}
        <div className="flex flex-col gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-[#2F2F2F]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#10A37F]">
                Prompt-Driven AI Content &amp; Document Studio
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
                Generate &amp; Humanize Complete Documents from a Single Prompt
              </h2>
              <p className="text-xs sm:text-sm text-[#B4B4B4] leading-relaxed">
                Import any PDF to edit via ChatGPT prompts, or describe a new document from scratch.
                Automatically suggests missing details, locks facts, humanizes under 10% AI score,
                and exports to PDF or Word.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
              <input
                ref={pdfFileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                aria-label="Import PDF file into ChatGPT Studio"
                onChange={handleUploadPdfFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={isImportingPdf}
                onClick={() => pdfFileInputRef.current?.click()}
                className="min-h-[40px] px-3.5 py-2.5 text-xs font-semibold text-white bg-[#2A2A2A] border border-[#10A37F]/70 rounded-lg hover:bg-[#343434] transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#10A37F]" />
                <span>{isImportingPdf ? 'Importing PDF...' : 'Import PDF to Edit (.pdf)'}</span>
              </button>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => handleExportPdf(true)}
                  className="min-h-[40px] px-3 sm:px-4 py-2.5 text-xs font-semibold text-white bg-[#10A37F] rounded-lg hover:bg-[#0E906F] transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">
                    {isExportingPdf ? 'Exporting...' : 'Export Clean PDF'}
                  </span>
                  <span className="hidden sm:inline">
                    {isExportingPdf ? 'Exporting PDF...' : 'Export Clean Humanized PDF'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isExportingDocx}
                  onClick={handleExportDocx}
                  className="min-h-[40px] px-3 sm:px-3.5 py-2.5 text-xs font-semibold text-[#ECECEC] bg-[#212121] border border-[#383838] rounded-lg hover:bg-[#2F2F2F] transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">
                    {isExportingDocx ? 'Exporting...' : 'Word (.docx)'}
                  </span>
                  <span className="hidden sm:inline">
                    {isExportingDocx ? 'Exporting...' : 'Download Word (.docx)'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Clean Inline Dark Controls & Telemetry Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1 min-w-0">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
              <select
                aria-label="Document Type Preset"
                onChange={(e) => {
                  const found = DOCUMENT_TYPE_CATALOG.find((d) => d.id === e.target.value);
                  if (found) {
                    setChatActionMode('generate_new');
                    handleSendPrompt(
                      `Generate a complete ${found.name} (${found.category}) with all required sections and suggested details.`,
                      '',
                      'generate_new'
                    );
                  }
                }}
                value={currentDoc.documentTypeId}
                className="w-full sm:max-w-[260px] truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-[#383838] rounded-lg focus:outline-none focus:border-[#10A37F]"
              >
                {DOCUMENT_TYPE_CATALOG.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#212121] text-[#ECECEC]">
                    {d.category}: {d.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto min-w-0">
                <select
                  aria-label="Humanizer Tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as AgentRewriteTone)}
                  className="w-full sm:w-auto truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-[#383838] rounded-lg focus:outline-none focus:border-[#10A37F]"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t} className="bg-[#212121] text-[#ECECEC]">
                      Tone: {t}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Target Audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as AudienceLevel)}
                  className="w-full sm:w-auto truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-[#383838] rounded-lg focus:outline-none focus:border-[#10A37F]"
                >
                  {AUDIENCES.map((aud) => (
                    <option key={aud} value={aud} className="bg-[#212121] text-[#ECECEC]">
                      {aud}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-start gap-x-2.5 gap-y-1 text-[11px] sm:text-xs text-[#B4B4B4] font-mono tabular-nums bg-[#1E1E1E] lg:bg-transparent px-3 py-2 lg:p-0 rounded-lg border border-[#2A2A2A] lg:border-0">
              <span>
                AI Detector: <strong className="text-[#10A37F]">{averageAiScoreAfter}% AI</strong>{' '}
                (&lt;10% Target)
              </span>
              <span aria-hidden="true" className="text-[#555555]">
                ·
              </span>
              <span>
                Locked Facts: <strong className="text-white">{totalLockedFactsCount}</strong>
              </span>
              <span aria-hidden="true" className="text-[#555555]">
                ·
              </span>
              <span>
                Sections: <strong className="text-white">{currentDoc.sections.length}</strong>
              </span>
              <span aria-hidden="true" className="text-[#555555]">
                ·
              </span>
              <span>
                Version: <strong className="text-white">v{currentDoc.currentVersionNumber}</strong>
              </span>
            </div>
          </div>

          <div
            className="text-xs text-[#B4B4B4] bg-[#212121] border border-[#2F2F2F] rounded-lg px-3.5 py-2 leading-relaxed break-words"
            role="status"
          >
            {statusMessage}
          </div>

          {/* Mobile / Tablet Quick View Switcher (Visible below lg breakpoint for effortless 1-hand phone navigation) */}
          <div
            role="group"
            aria-label="Mobile Workspace Panel Switcher"
            className="grid grid-cols-3 gap-1 p-1 bg-[#141414] border border-[#2F2F2F] rounded-xl lg:hidden"
          >
            <button
              type="button"
              onClick={() => setMobilePane('both')}
              className={`min-h-[36px] px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mobilePane === 'both'
                  ? 'bg-[#2F2F2F] text-white'
                  : 'text-[#9B9B9B] hover:text-white'
              }`}
            >
              Split View
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('chat')}
              className={`min-h-[36px] px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mobilePane === 'chat'
                  ? 'bg-[#10A37F] text-white'
                  : 'text-[#9B9B9B] hover:text-white'
              }`}
            >
              ChatGPT &amp; PDF
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('document')}
              className={`min-h-[36px] px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mobilePane === 'document'
                  ? 'bg-[#10A37F] text-white'
                  : 'text-[#9B9B9B] hover:text-white'
              }`}
            >
              Document ({currentDoc.sections.length})
            </button>
          </div>
        </div>

        {/* Main 2-Column Workspace: Left = ChatGPT Prompt & PDF Import/Edit Assistant, Right = Live Document */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start min-w-0">
          {/* LEFT COLUMN (5 cols): ChatGPT PDF Import, Mode Toggle, Prompt Composer & AI Suggestions */}
          <div
            ref={leftColumnRef}
            className={`lg:col-span-5 min-w-0 bg-[#212121] border border-[#2F2F2F] rounded-xl flex flex-col overflow-hidden ${
              mobilePane === 'document' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Import PDF to Edit OR Generate New Bar */}
            <div className="p-3.5 sm:p-4 border-b border-[#2F2F2F] bg-[#181818] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  Import PDF to Edit or Generate New Document
                </span>
                {/* Mode Toggle: Edit Current/Imported PDF vs Generate New */}
                <div
                  role="group"
                  aria-label="ChatGPT Prompt Action Mode"
                  className="grid grid-cols-2 sm:flex items-center gap-1 p-0.5 bg-[#121212] border border-[#2F2F2F] rounded-lg w-full sm:w-auto"
                >
                  <button
                    type="button"
                    onClick={() => setChatActionMode('edit_current')}
                    className={`min-h-[32px] px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors text-center cursor-pointer ${
                      chatActionMode === 'edit_current'
                        ? 'bg-[#10A37F] text-white'
                        : 'text-[#9B9B9B] hover:text-white'
                    }`}
                  >
                    Edit Current / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatActionMode('generate_new')}
                    className={`min-h-[32px] px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors text-center cursor-pointer ${
                      chatActionMode === 'generate_new'
                        ? 'bg-[#10A37F] text-white'
                        : 'text-[#9B9B9B] hover:text-white'
                    }`}
                  >
                    Generate New
                  </button>
                </div>
              </div>

              {/* Import PDF Buttons */}
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  disabled={isImportingPdf}
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>{isImportingPdf ? 'Importing...' : 'Upload PDF / Doc (.pdf, .txt)'}</span>
                </button>

                <button
                  type="button"
                  disabled={isImportingPdf}
                  onClick={handleLoadSamplePdfToEdit}
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                  <span>Load Sample PDF to Edit</span>
                </button>
              </div>

              {/* Active Imported PDF Status Box */}
              {importedPdfMeta && (
                <div className="p-2.5 rounded-lg bg-[#1F2925] border border-[#10A37F]/40 flex items-center justify-between gap-2 text-xs">
                  <div className="text-[#ECECEC] truncate">
                    <span className="font-semibold text-[#10A37F]">Imported PDF Active:</span>{' '}
                    {importedPdfMeta.fileName} ({importedPdfMeta.sectionCount} sections)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImportedPdfMeta(null);
                      setChatActionMode('generate_new');
                    }}
                    className="text-[11px] text-[#B4B4B4] hover:text-white shrink-0 px-1.5 py-0.5 rounded bg-[#171F1C] cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* 1-Click Starter Prompts (Generate New) */}
              <div className="pt-0.5 space-y-1.5">
                <div className="text-[11px] font-medium text-[#9B9B9B]">
                  Or 1-Click Generate New Document:
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setChatActionMode('generate_new');
                        handleSendPrompt(item.prompt, item.context, 'generate_new');
                      }}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] transition-colors cursor-pointer truncate text-center"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Conversation & AI Missing Details Suggestions */}
            <div className="p-3.5 sm:p-4 space-y-3.5 max-h-[420px] sm:max-h-[540px] overflow-y-auto">
              {chatMessages.slice(-4).map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[92%] sm:max-w-[90%] rounded-2xl bg-[#2F2F2F] text-white border border-[#3D3D3D] px-3.5 py-2.5 text-xs leading-relaxed break-words">
                      {msg.promptText}
                    </div>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className="rounded-xl bg-[#1A1A1A] border border-[#2F2F2F] p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-[#B4B4B4] font-mono tabular-nums border-b border-[#2F2F2F] pb-2">
                      <span className="font-sans font-semibold text-white">
                        {msg.detectedDocTypeName || 'Generated Document'}
                      </span>
                      <span>
                        AI Score: {msg.aiScoreBefore}% →{' '}
                        <strong className="text-[#10A37F]">{msg.aiScoreAfter}%</strong>
                      </span>
                    </div>

                    <p className="text-xs text-[#B4B4B4] leading-relaxed break-words">
                      {msg.assistantIntro ||
                        `AI automatically generated ${
                          msg.autoGeneratedOutline?.length || 6
                        } sections, locked all numbers/facts, and filled missing details from your prompt.`}
                    </p>

                    {msg.canonicalDocument && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isExportingPdf}
                          onClick={() => handleExportPdf(true, msg.canonicalDocument!)}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 shrink-0" />
                          <span>Export Clean PDF (Preserve Structure)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (mobilePane === 'chat') {
                              setMobilePane('document');
                            } else {
                              rightColumnRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                            }
                          }}
                          className="lg:hidden min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-[11px] font-medium text-[#ECECEC] border border-[#383838] transition-colors cursor-pointer"
                        >
                          View Document ↓
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* AI Missing Things Auto-Suggestions (1-Click Selection — Zero Manual Typing) */}
              {latestAssistantMsg?.detectedMissingDetails &&
                latestAssistantMsg.detectedMissingDetails.length > 0 && (
                  <div className="border-t border-[#2F2F2F] pt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        AI-Suggested Missing Details (Tap Any Option)
                      </span>
                      <span className="text-[11px] text-[#10A37F] font-medium shrink-0">
                        Auto-Filled
                      </span>
                    </div>

                    <div className="space-y-2">
                      {latestAssistantMsg.detectedMissingDetails.slice(0, 4).map((md) => (
                        <div
                          key={md.fieldKey}
                          className="p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2F2F2F] space-y-1.5"
                        >
                          <div className="text-xs font-medium text-[#ECECEC] break-words">
                            {md.label}:{' '}
                            <span className="font-normal text-[#9B9B9B]">
                              {md.aiAutoFilledValue.slice(0, 65)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {md.promptOptions.map((opt, idx) => (
                              <button
                                key={`${md.fieldKey}-${idx}`}
                                type="button"
                                onClick={() =>
                                  handleSendPrompt(
                                    `Set ${md.label} to "${opt}" and update all sections accordingly.`,
                                    '',
                                    'edit_current'
                                  )
                                }
                                className="text-left px-2.5 py-1.5 rounded-md bg-[#262626] hover:bg-[#333333] text-[11px] text-[#ECECEC] border border-[#383838] transition-colors cursor-pointer leading-snug"
                              >
                                Option {idx + 1}: {opt.slice(0, 48)}
                                {opt.length > 48 ? '...' : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 1-Click Follow-Up Refinements */}
              {latestAssistantMsg?.followUpPrompts && (
                <div className="border-t border-[#2F2F2F] pt-3 space-y-1.5">
                  <div className="text-xs font-semibold text-[#ECECEC]">
                    1-Click Follow-Up Edit Prompts
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {latestAssistantMsg.followUpPrompts.slice(0, 3).map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => handleSendPrompt(fp, '', 'edit_current')}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#2A2A2A] text-xs text-[#ECECEC] border border-[#2F2F2F] transition-colors cursor-pointer leading-snug"
                      >
                        {fp} →
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Unified ChatGPT Dark Composer Card (Full-width input on both Phone & Desktop) */}
            <div className="p-3 sm:p-3.5 border-t border-[#2F2F2F] bg-[#181818] space-y-2.5">
              {showContextBox && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#B4B4B4]">
                    <span className="font-medium">Paste Source Text / Notes (Optional)</span>
                    <button
                      type="button"
                      onClick={() => setShowContextBox(false)}
                      className="text-[#9B9B9B] hover:text-white cursor-pointer"
                    >
                      Hide
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={chatAttachedContext}
                    onChange={(e) => setChatAttachedContext(e.target.value)}
                    placeholder="Paste existing notes, article, or PDF text here..."
                    className="w-full px-3 py-2 rounded-lg bg-[#262626] border border-[#3D3D3D] text-xs text-white placeholder-[#8E8E8E] focus:outline-none focus:border-[#10A37F]"
                  />
                </div>
              )}

              <div className="rounded-xl bg-[#2A2A2A] border border-[#3D3D3D] focus-within:border-[#10A37F] p-2.5 space-y-2 transition-colors">
                <input
                  type="text"
                  value={chatInputPrompt}
                  onChange={(e) => setChatInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  placeholder={
                    chatActionMode === 'edit_current'
                      ? `Prompt ChatGPT to edit "${currentDoc.title.slice(0, 32)}..."`
                      : "Write a prompt to generate a new document (e.g. 'Business proposal for Nova')..."
                  }
                  className="w-full px-1.5 py-1 bg-transparent text-xs sm:text-sm text-white placeholder-[#9B9B9B] focus:outline-none"
                />

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#383838]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => pdfFileInputRef.current?.click()}
                      title="Import PDF file (.pdf)"
                      aria-label="Import PDF file (.pdf)"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#333333] text-[#ECECEC] border border-[#3D3D3D] flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                      <span className="sm:hidden">PDF</span>
                      <span className="hidden sm:inline">Upload PDF</span>
                    </button>

                    {!showContextBox && (
                      <button
                        type="button"
                        onClick={() => setShowContextBox(true)}
                        title="Paste Source Text"
                        aria-label="Paste Source Text"
                        className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#333333] text-[#ECECEC] border border-[#3D3D3D] flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-[#B4B4B4] shrink-0" />
                        <span className="sm:hidden">Paste</span>
                        <span className="hidden sm:inline">Paste Text</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleSendPrompt()}
                    className="min-h-[36px] px-3.5 sm:px-4 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{chatActionMode === 'edit_current' ? 'Edit PDF' : 'Generate'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Clean Dark Live Document Preview, Section Refiner & Version History */}
          <div
            ref={rightColumnRef}
            className={`lg:col-span-7 min-w-0 bg-[#212121] border border-[#2F2F2F] rounded-xl flex flex-col overflow-hidden ${
              mobilePane === 'chat' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Right Panel Toolbar */}
            <div className="px-3.5 sm:px-4 py-3 border-b border-[#2F2F2F] bg-[#1B1B1B] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2.5">
              {/* Segmented View Control */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#141414] border border-[#2F2F2F] rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setRightView('preview')}
                  className={`min-h-[34px] px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors truncate text-center cursor-pointer ${
                    rightView === 'preview'
                      ? 'bg-[#2F2F2F] text-white shadow-xs'
                      : 'text-[#9B9B9B] hover:text-white'
                  }`}
                >
                  <span className="sm:hidden">Preview</span>
                  <span className="hidden sm:inline">Document Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightView('sections')}
                  className={`min-h-[34px] px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors truncate text-center cursor-pointer ${
                    rightView === 'sections'
                      ? 'bg-[#2F2F2F] text-white shadow-xs'
                      : 'text-[#9B9B9B] hover:text-white'
                  }`}
                >
                  Refine ({currentDoc.sections.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightView('versions')}
                  className={`min-h-[34px] px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors truncate text-center cursor-pointer ${
                    rightView === 'versions'
                      ? 'bg-[#2F2F2F] text-white shadow-xs'
                      : 'text-[#9B9B9B] hover:text-white'
                  }`}
                >
                  History (v{versionHistory.length})
                </button>
              </div>

              {/* Template & Copy Controls */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <select
                  aria-label="Document Template"
                  value={selectedTemplate.id}
                  onChange={(e) => {
                    const tpl = PROFESSIONAL_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) setSelectedTemplate(tpl);
                  }}
                  className="flex-1 sm:flex-initial min-w-[140px] truncate min-h-[34px] px-2.5 py-1.5 text-xs text-[#ECECEC] bg-[#2A2A2A] border border-[#383838] rounded-lg"
                >
                  {PROFESSIONAL_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id} className="bg-[#212121] text-[#ECECEC]">
                      Template: {tpl.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowRawCompare(!showRawCompare)}
                  className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] whitespace-nowrap cursor-pointer"
                >
                  {showRawCompare ? 'Single View' : 'Compare Raw vs Humanized'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFullDocument}
                  className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedDoc ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => handleExportPdf(true)}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Clean PDF</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: Clean Dark Document Preview */}
            {rightView === 'preview' && (
              <div className="p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 max-h-[560px] sm:max-h-[700px] overflow-y-auto">
                {showRawCompare ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                    <div className="space-y-3 border-b md:border-b-0 md:border-r border-[#2F2F2F] pb-4 md:pb-0 md:pr-4">
                      <div className="text-xs font-semibold text-[#9B9B9B]">
                        Original Un-Humanized Draft
                      </div>
                      {currentDoc.sections.map((sec, idx) => (
                        <div key={sec.id} className="space-y-1.5">
                          <h4 className="text-xs font-bold text-[#B4B4B4]">
                            {idx + 1}. {sec.heading}
                          </h4>
                          <p className="text-xs text-[#8E8E8E] leading-relaxed break-words">
                            {sec.originalParagraphs.join('\n\n')}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-[#10A37F]">
                        Humanized Output ({averageAiScoreAfter}% AI Score · Natural Human Tone)
                      </div>
                      {currentDoc.sections.map((sec, idx) => (
                        <div key={sec.id} className="space-y-1.5">
                          <h4 className="text-xs font-bold text-white">
                            {idx + 1}. {sec.heading}
                          </h4>
                          <p className="text-xs text-[#ECECEC] leading-relaxed break-words">
                            {sec.paragraphs.join('\n\n')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="border-b border-[#2F2F2F] pb-4">
                      <div className="text-xs text-[#10A37F] font-medium">
                        {selectedTemplate.companyName} · {selectedTemplate.pageSize}
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-white mt-1 break-words">
                        {currentDoc.title}
                      </h3>
                      <p className="text-xs text-[#B4B4B4] mt-0.5 break-words">
                        {currentDoc.subtitle}
                      </p>
                    </div>

                    {currentDoc.sections.map((sec, idx) => (
                      <div key={sec.id} className="space-y-2">
                        <h4 className="text-sm font-bold text-white break-words">
                          {idx + 1}. {sec.heading}
                        </h4>
                        {sec.paragraphs.map((p, pIdx) => (
                          <p
                            key={pIdx}
                            className="text-xs sm:text-sm text-[#D4D4D4] leading-relaxed break-words"
                          >
                            {p}
                          </p>
                        ))}
                        {sec.bullets && sec.bullets.length > 0 && (
                          <ul className="list-disc pl-5 space-y-1 text-xs text-[#B4B4B4]">
                            {sec.bullets.map((b, bIdx) => (
                              <li key={bIdx} className="break-words">
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                        {sec.table && sec.table.rows.length > 0 && (
                          <div className="overflow-x-auto pt-2">
                            <table className="w-full text-xs border border-[#2F2F2F]">
                              <thead className="bg-[#1A1A1A] text-[#ECECEC]">
                                <tr>
                                  <th className="p-2 text-left border-b border-[#2F2F2F]">
                                    {sec.table.headers[0]}
                                  </th>
                                  <th className="p-2 text-left border-b border-[#2F2F2F]">
                                    {sec.table.headers[1]}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {sec.table.rows.map((r, rIdx) => (
                                  <tr key={rIdx} className="border-b border-[#2A2A2A]">
                                    <td className="p-2 font-medium text-white">{r[0]}</td>
                                    <td className="p-2 text-[#B4B4B4]">{r[1]}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Clean Finalized Document Export Footer */}
                <div className="pt-4 sm:pt-5 border-t border-[#2F2F2F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[#B4B4B4]">
                    Structure preserved ({currentDoc.sections.length} numbered sections, bullet lists
                    &amp; tables ·{' '}
                    <span className="font-mono font-semibold text-[#10A37F]">
                      {averageAiScoreAfter}% AI Score
                    </span>
                    )
                  </div>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      disabled={isExportingPdf}
                      onClick={() => handleExportPdf(true)}
                      className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isExportingPdf
                          ? 'Exporting PDF...'
                          : 'Export Clean Humanized PDF (Preserve Structure)'}
                      </span>
                    </button>
                    <div className="grid grid-cols-2 sm:flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isExportingPdf}
                        onClick={() => handleExportPdf(false)}
                        className="min-h-[38px] px-3 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Template PDF</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExportingDocx}
                        onClick={handleExportDocx}
                        className="min-h-[38px] px-3 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>Word (.docx)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: Clean Dark Section-by-Section Prompt Refiner */}
            {rightView === 'sections' && (
              <div className="p-3.5 sm:p-5 space-y-4 max-h-[560px] sm:max-h-[700px] overflow-y-auto">
                {currentDoc.sections.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className="p-3.5 sm:p-4 rounded-xl bg-[#1A1A1A] border border-[#2F2F2F] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center justify-between sm:justify-start gap-2">
                        <span className="text-sm font-bold text-white break-words">
                          {idx + 1}. {sec.heading}
                        </span>
                        <span className="text-[11px] font-mono text-[#10A37F] shrink-0">
                          {sec.metrics.aiScoreAfter}% AI · {sec.humanizeStatus}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'humanize', label: 'Humanize' },
                            { id: 'rewrite', label: 'Rewrite' },
                            { id: 'expand', label: 'Expand' },
                            { id: 'shorten', label: 'Shorten' },
                          ] as const
                        ).map((btn) => (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={() => handleSectionQuickAction(sec.id, btn.id)}
                            className="min-h-[30px] px-2.5 py-1 rounded bg-[#262626] hover:bg-[#333333] text-xs font-medium text-[#ECECEC] border border-[#383838] cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAcceptOrRejectSection(sec.id, 'accepted')}
                          className="min-h-[30px] px-2 py-1 rounded bg-[#262626] hover:bg-[#10A37F]/20 text-xs text-[#10A37F] border border-[#383838] flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptOrRejectSection(sec.id, 'rejected')}
                          className="min-h-[30px] px-2 py-1 rounded bg-[#262626] hover:bg-rose-950/50 text-xs text-rose-400 border border-[#383838] flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#D4D4D4] leading-relaxed bg-[#212121] p-3 rounded-lg border border-[#2F2F2F] break-words">
                      {sec.paragraphs.join('\n\n')}
                    </p>

                    {/* Prompt input for this section (Zero manual text editing) */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={sectionPromptMap[sec.id] || ''}
                        onChange={(e) =>
                          setSectionPromptMap({ ...sectionPromptMap, [sec.id]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplySectionPrompt(sec.id, sectionPromptMap[sec.id] || '');
                          }
                        }}
                        placeholder={`Prompt AI to update "${sec.heading}"...`}
                        className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#2F2F2F] border border-[#3D3D3D] text-xs text-white placeholder-[#8E8E8E] focus:outline-none focus:border-[#10A37F]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleApplySectionPrompt(
                            sec.id,
                            sectionPromptMap[sec.id] ||
                              `Enhance ${sec.heading} with concrete details`
                          )
                        }
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        Update via Prompt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VIEW 3: Clean Dark Version History */}
            {rightView === 'versions' && (
              <div className="p-3.5 sm:p-5 space-y-2.5 max-h-[560px] sm:max-h-[700px] overflow-y-auto">
                {versionHistory.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3.5 rounded-lg bg-[#1A1A1A] border border-[#2F2F2F] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white break-words">
                        v{ver.versionNumber} — {ver.label}
                      </div>
                      <div className="text-[11px] text-[#9B9B9B] font-mono tabular-nums mt-0.5">
                        {ver.createdAt.slice(11, 19)} UTC · {ver.documentSnapshot.sections.length}{' '}
                        Sections · Tone: {ver.documentSnapshot.tone}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentDoc(ver.documentSnapshot);
                        setRightView('preview');
                        setStatusMessage(`Restored Version v${ver.versionNumber}.`);
                      }}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
