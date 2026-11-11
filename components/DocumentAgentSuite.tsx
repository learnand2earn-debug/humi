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
  ArrowUpRight,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import {
  DOCUMENT_TYPE_CATALOG,
  PROFESSIONAL_TEMPLATES,
  SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK,
  AgentRewriteTone,
  AudienceLevel,
  CanonicalDocumentModel,
  DocumentVersionRecord,
  TemplateStyleConfig,
  ChatGptMessage,
  ArtifactPdfFontStyle,
  ArtifactPdfShapePreset,
  ClaudeThinkingDepthMode,
  PipelineUploadedDocument,
  applyPromptToDocumentOrSection,
  ingestMultipleFilesIntoPipeline,
  generateNextUnlimitedPipelineDocument,
  analyzeMultiDocumentPipeline,
  executeMultiDocPromptPipeline,
  runControlledHumanizePipeline,
  applyEditorQuickAction,
  exportCanonicalDocumentToPdfBytes,
  exportCanonicalDocumentToDocxBytes,
} from '@/lib/document-agent-engine';

type RightPanelView = 'preview' | 'thinking' | 'sections' | 'versions';

const TONES: AgentRewriteTone[] = ['Professional', 'Friendly', 'Academic', 'Simple', 'Persuasive'];

const AUDIENCES: AudienceLevel[] = [
  'Executive / C-Suite',
  'Client / Small Business Owner',
  'General Public',
  'Technical / Specialist',
  'Academic / Peer Review',
];

const THINKING_DEPTH_OPTIONS: { id: ClaudeThinkingDepthMode; label: string }[] = [
  { id: 'extended_deep', label: 'Claude Thinking: Extended Deep (6 Stages)' },
  { id: 'first_principles', label: 'Claude Thinking: First-Principles Logic' },
  { id: 'executive_strategic', label: 'Claude Thinking: Executive Strategic' },
];

const FONT_STYLE_OPTIONS: { id: ArtifactPdfFontStyle; label: string; cssClass: string }[] = [
  { id: 'serif', label: 'Original Font: TimesRoman Serif', cssClass: 'font-serif' },
  { id: 'sans', label: 'Original Font: Helvetica Sans', cssClass: 'font-sans' },
  { id: 'mono', label: 'Original Font: Courier Mono', cssClass: 'font-mono' },
];

const SHAPE_PRESET_OPTIONS: { id: ArtifactPdfShapePreset; label: string }[] = [
  { id: 'executive_figure', label: 'Shape: A4 + Executive KPI Figure' },
  { id: 'technical_blueprint', label: 'Shape: A4 + Architecture Blueprint' },
  { id: 'clean_editorial', label: 'Shape: A4 Clean Editorial Sheet' },
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

const MULTI_DOC_PIPELINE_PROMPTS = [
  'Combine & synthesize all uploaded documents into 1 Master Business Proposal with all numbers locked',
  'Compare all uploaded files and build a Cross-Document Risk & SLA Audit report',
  'Extract every budget figure, ROI metric, and timeline from all uploaded files into a ledger',
  'Condense all uploaded documents into a 1-Page Executive Summary in C-Suite tone',
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
  const [thinkingDepthMode, setThinkingDepthMode] =
    useState<ClaudeThinkingDepthMode>('extended_deep');
  const [showMicroThinkingOnA4, setShowMicroThinkingOnA4] = useState<boolean>(true);
  // Keep thinking accordion collapsed by default so chat replies and prompt outputs are always immediately visible
  const [expandedThinkingMsgIds, setExpandedThinkingMsgIds] = useState<Record<string, boolean>>({});
  const [expandedPipelineDocIds, setExpandedPipelineDocIds] = useState<Record<string, boolean>>({});
  const [activePipelineStep, setActivePipelineStep] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [showInlineFileCreator, setShowInlineFileCreator] = useState<boolean>(false);
  const [customFileNameInput, setCustomFileNameInput] = useState<string>('');
  const [customFileContentInput, setCustomFileContentInput] = useState<string>('');
  const [isDraggingOverPipeline, setIsDraggingOverPipeline] = useState<boolean>(false);
  const uploadModeRef = useRef<'append' | 'replace'>('append');

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateStyleConfig>(
    () => PROFESSIONAL_TEMPLATES[0]
  );

  // Original PDF Font & Shape state for Claude Artifact & Top Humanizer handoff
  const [artifactFontStyle, setArtifactFontStyle] = useState<ArtifactPdfFontStyle>('serif');
  const [artifactShapePreset, setArtifactShapePreset] =
    useState<ArtifactPdfShapePreset>('executive_figure');
  const [isSendingToTopHumanizer, setIsSendingToTopHumanizer] = useState<boolean>(false);
  const [sentToTopHumanizerFileName, setSentToTopHumanizerFileName] = useState<string | null>(null);

  const [mobilePane, setMobilePane] = useState<'both' | 'chat' | 'document'>('both');
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  // Default to 'edit_current' so typing prompts works like Claude Artifacts / ChatGPT Canvas (iteratively updating the document)
  const [chatActionMode, setChatActionMode] = useState<'edit_current' | 'generate_new'>(
    'edit_current'
  );
  // Unlimited Continuous Multi-Document Ingestion, Reading & Analysis Pipeline state
  const [uploadedDocsPipeline, setUploadedDocsPipeline] = useState<PipelineUploadedDocument[]>(
    () => SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK
  );
  const [importedPdfMeta, setImportedPdfMeta] = useState<{
    fileName: string;
    pageCount: number;
    sectionCount: number;
  } | null>(() => ({
    fileName: `${SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK.length} Documents in Unlimited Pipeline (${SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK.reduce((s, d) => s + d.pageCount, 0)} Pages)`,
    pageCount: SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK.reduce((s, d) => s + d.pageCount, 0),
    sectionCount: 5,
  }));
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
    '5-Step Unlimited Multi-Document Pipeline Active (∞ Continuous File Queue) — Keep adding unlimited files (.pdf, .docx, .txt, .csv, or inline text) or enter any prompt below.'
  );

  const [chatMessages, setChatMessages] = useState<ChatGptMessage[]>(() => {
    const initialPromptText =
      'Mujhe digital marketing agency (Apex Growth Digital) ke liye client Nova Retail Group ka complete Business Proposal chahiye — sab uploaded documents ko 5-step pipeline main read aur analyze kar ke ($8,500/month retainer, 12 weeks timeline, scale ROAS from 2.1x to 4.0x).';
    const initialUserMsg: ChatGptMessage = {
      id: 'msg-init-user',
      role: 'user',
      promptText: `[Unlimited Pipeline: 3 File(s)] ${initialPromptText}`,
      createdAt: '2026-11-04T09:00:00.000Z',
    };
    const initialPipelineRun = executeMultiDocPromptPipeline({
      prompt: initialPromptText,
      uploadedDocs: SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK,
      mode: 'generate_new',
      tone: 'Persuasive',
      audience: 'Client / Small Business Owner',
      lengthTarget: 'Medium (2–3 Pages)',
      depthMode: 'extended_deep',
    });
    const initialAssistantMsg = initialPipelineRun.chatReply;
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
      label: 'Initial Multi-Doc Pipeline Draft (v1)',
      createdAt: currentDoc.createdAt,
      documentSnapshot: currentDoc,
    },
  ]);

  const scrollChatToBottom = () => {
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (chatScrollContainerRef.current) {
          chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
        }
      });
    }
  };

  const latestAssistantMsg = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant') return chatMessages[i];
    }
    return undefined;
  }, [chatMessages]);

  const livePipelineAnalysis = useMemo(() => {
    return analyzeMultiDocumentPipeline(
      uploadedDocsPipeline,
      latestAssistantMsg?.promptText || 'Read, analyze, and synthesize all uploaded documents'
    );
  }, [uploadedDocsPipeline, latestAssistantMsg]);

  const averageAiScoreAfter = useMemo(() => {
    if (!currentDoc.sections.length) return 4;
    const sum = currentDoc.sections.reduce((acc, s) => acc + s.metrics.aiScoreAfter, 0);
    return Math.round(sum / currentDoc.sections.length);
  }, [currentDoc]);

  const totalLockedFactsCount = useMemo(
    () => currentDoc.sections.reduce((acc, s) => acc + s.lockedFacts.length, 0),
    [currentDoc]
  );

  const totalMicroDecisionsCount = useMemo(() => {
    if (currentDoc.thinkingTrace?.microDecisionsCount) {
      return currentDoc.thinkingTrace.microDecisionsCount;
    }
    return currentDoc.sections.length * 6 + 10;
  }, [currentDoc]);

  const activeFontClass = useMemo(() => {
    return (
      FONT_STYLE_OPTIONS.find((f) => f.id === artifactFontStyle)?.cssClass || 'font-serif'
    );
  }, [artifactFontStyle]);

  const toggleThinkingAccordion = (msgId: string) => {
    setExpandedThinkingMsgIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const togglePipelineDocReader = (docId: string) => {
    setExpandedPipelineDocIds((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

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

  /**
   * Executes the 5-Step Unlimited Multi-Document Reading, Analysis & Synthesis Pipeline on an array of PipelineUploadedDocument items
   * and updates both the Chat thread and the Live A4 Document Artifact immediately.
   */
  const runPipelineOnDocuments = (
    docsToAnalyze: PipelineUploadedDocument[],
    customPromptInstruction?: string
  ) => {
    const effectiveInstruction =
      (customPromptInstruction || chatInputPrompt).trim() ||
      `Execute all 5 pipeline steps: read, analyze, and synthesize all ${docsToAnalyze.length} queued document(s) (${docsToAnalyze.map((d) => d.fileName).join(', ')}) into a unified A4 Document Artifact with all facts locked.`;

    const userMsg: ChatGptMessage = {
      id: nextClientId('user-multidoc'),
      role: 'user',
      promptText: `[5-Step Unlimited Pipeline: ${docsToAnalyze.length} File(s) Active — ${docsToAnalyze
        .map((d) => d.fileName)
        .join(', ')}] ${effectiveInstruction}`,
      createdAt: new Date().toISOString(),
    };

    const result = executeMultiDocPromptPipeline({
      prompt: effectiveInstruction,
      uploadedDocs: docsToAnalyze,
      currentDoc,
      inputContext: chatAttachedContext,
      mode: 'generate_new',
      tone,
      audience,
      depthMode: thinkingDepthMode,
    });

    setChatMessages((prev) => [...prev, userMsg, result.chatReply]);
    pushVersion(
      result.canonicalDocument,
      `5-Step Pipeline (${docsToAnalyze.length} Files): ${result.canonicalDocument.title.slice(0, 26)}`
    );
    setImportedPdfMeta({
      fileName:
        docsToAnalyze.length === 1
          ? docsToAnalyze[0].fileName
          : `${docsToAnalyze.length} Documents in Unlimited Pipeline (${docsToAnalyze.reduce((s, d) => s + d.pageCount, 0)} Pages)`,
      pageCount: docsToAnalyze.reduce((s, d) => s + d.pageCount, 0),
      sectionCount: result.canonicalDocument.sections.length,
    });
    setChatActionMode('edit_current');
    setRightView('preview');
    setActivePipelineStep(5);
    setStatusMessage(
      `5-Step Unlimited Pipeline Complete — Ingested, read & analyzed ${docsToAnalyze.length} file(s) (${docsToAnalyze.reduce(
        (s, d) => s + d.pageCount,
        0
      )} pages, ${docsToAnalyze.reduce(
        (s, d) => s + d.wordCount,
        0
      )} words) and synthesized ${result.canonicalDocument.sections.length} sections (${
        result.chatReply.aiScoreAfter
      }% AI Score). Keep adding more files or enter any prompt!`
    );
    scrollChatToBottom();
  };

  const ingestFilesIntoPipelineState = async (
    fileList: File[],
    strategy: 'append' | 'replace'
  ) => {
    if (fileList.length === 0) return;
    setIsImportingPdf(true);
    setActivePipelineStep(1);
    setStatusMessage(
      `Step 1 & 2: Ingesting & reading ${fileList.length} file(s) (${fileList.map((f) => f.name).join(', ')}) into Unlimited Pipeline...`
    );
    try {
      const newlyIngested = await ingestMultipleFilesIntoPipeline(fileList);
      const combinedPipeline =
        strategy === 'replace'
          ? newlyIngested
          : [...uploadedDocsPipeline, ...newlyIngested];
      setUploadedDocsPipeline(combinedPipeline);
      runPipelineOnDocuments(combinedPipeline, chatInputPrompt.trim() || undefined);
      if (chatInputPrompt.trim()) {
        setChatInputPrompt('');
      }
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleUploadPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    const strategy = uploadModeRef.current;
    uploadModeRef.current = 'append';
    await ingestFilesIntoPipelineState(fileList, strategy);
    e.target.value = '';
  };

  const handlePipelineDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOverPipeline(false);
    const fileList = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (fileList.length > 0) {
      await ingestFilesIntoPipelineState(fileList, 'append');
    }
  };

  /**
   * Continuously feeds 1 or more additional documents (#4, #5, #6, #7, #8... to ∞ Unlimited)
   * into the active pipeline and immediately executes all 5 pipeline steps across the entire queue.
   */
  const handleFeedUnlimitedFilesToPipeline = (countToAdd = 1) => {
    setIsImportingPdf(true);
    try {
      const currentCount = uploadedDocsPipeline.length;
      const newDocs: PipelineUploadedDocument[] = [];
      for (let i = 1; i <= countToAdd; i++) {
        const nextNum = currentCount + i;
        if (nextNum <= SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK.length) {
          const baseSample = SAMPLE_MULTI_DOCUMENT_PIPELINE_PACK[nextNum - 1];
          newDocs.push({
            ...baseSample,
            id: `unlimited-sample-${Date.now()}-${nextNum}`,
          });
        } else {
          newDocs.push(generateNextUnlimitedPipelineDocument(nextNum));
        }
      }
      const updatedPipeline = [...uploadedDocsPipeline, ...newDocs];
      setUploadedDocsPipeline(updatedPipeline);
      runPipelineOnDocuments(
        updatedPipeline,
        `Added ${countToAdd} new file(s) (${newDocs.map((d) => d.fileName).join(', ')}) — Run all 5 pipeline steps across all ${updatedPipeline.length} documents in the unlimited queue.`
      );
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleAddInlineCustomFileToPipeline = () => {
    const cleanText = customFileContentInput.trim();
    if (!cleanText) {
      setStatusMessage('Please enter or paste text content to add as a new file into the pipeline.');
      return;
    }
    const nextNum = uploadedDocsPipeline.length + 1;
    const newCustomDoc = generateNextUnlimitedPipelineDocument(
      nextNum,
      customFileNameInput.trim() || `${String(nextNum).padStart(2, '0')}_Custom_Pipeline_Doc_${nextNum}.txt`,
      cleanText
    );
    const updatedPipeline = [...uploadedDocsPipeline, newCustomDoc];
    setUploadedDocsPipeline(updatedPipeline);
    setCustomFileNameInput('');
    setCustomFileContentInput('');
    setShowInlineFileCreator(false);
    runPipelineOnDocuments(
      updatedPipeline,
      `Added custom document "${newCustomDoc.fileName}" as File #${nextNum} — Run all 5 pipeline steps across all ${updatedPipeline.length} files.`
    );
  };

  const handleRemoveDocFromPipeline = (docId: string) => {
    const remaining = uploadedDocsPipeline.filter((d) => d.id !== docId);
    setUploadedDocsPipeline(remaining);
    if (remaining.length > 0) {
      runPipelineOnDocuments(
        remaining,
        `Re-synthesize the remaining ${remaining.length} document(s) in the pipeline.`
      );
    } else {
      setImportedPdfMeta(null);
      setStatusMessage('Cleared file from Multi-Document Pipeline.');
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

    if (!promptToUse && !contextToUse && uploadedDocsPipeline.length === 0) {
      setStatusMessage(
        'Please enter a prompt or upload 1 or more files into the Multi-Document Pipeline first.'
      );
      return;
    }

    const finalPrompt =
      promptToUse ||
      (uploadedDocsPipeline.length > 0
        ? `Read, analyze, and synthesize all ${uploadedDocsPipeline.length} uploaded document(s) (${uploadedDocsPipeline
            .map((d) => d.fileName)
            .join(', ')}) into a complete executive document with all facts locked.`
        : 'Analyze this input text with Claude Extended Thinking, suggest missing details, structure it into headings, and humanize it under 10% AI score.');

    const asksForNewDoc =
      /\b(new document|generate new|start over|from scratch|naya document|nayi file|create a complete|write a complete|mujhe .* chahiye)\b/i.test(
        finalPrompt
      );
    const effectiveMode =
      forceMode || (asksForNewDoc ? 'generate_new' : chatActionMode);

    const userMsg: ChatGptMessage = {
      id: nextClientId('user'),
      role: 'user',
      promptText:
        uploadedDocsPipeline.length > 0
          ? `[Pipeline: ${uploadedDocsPipeline.length} File(s)] ${finalPrompt}`
          : finalPrompt,
      attachedInputContext: contextToUse || undefined,
      createdAt: new Date().toISOString(),
    };

    if (overridePrompt === undefined) setChatInputPrompt('');

    // Compute Multi-Doc + Claude Extended Thinking result synchronously (0ms) so every prompt responds IMMEDIATELY without waiting on network
    const localPipelineResult = executeMultiDocPromptPipeline({
      prompt: finalPrompt,
      uploadedDocs: uploadedDocsPipeline,
      currentDoc,
      inputContext: contextToUse,
      mode: effectiveMode,
      tone,
      audience,
      lengthTarget: 'Medium (2–3 Pages)',
      depthMode: thinkingDepthMode,
    });

    const assistantReplyId = localPipelineResult.chatReply.id;

    // Immediately update Chat Thread & Live A4 Document Artifact in 0ms
    setChatMessages((prev) => [...prev, userMsg, localPipelineResult.chatReply]);
    pushVersion(
      localPipelineResult.canonicalDocument,
      `Prompt: ${finalPrompt.slice(0, 30)}`
    );
    setChatActionMode('edit_current');
    setRightView('preview');
    setStatusMessage(
      `Prompt Executed${
        uploadedDocsPipeline.length > 0
          ? ` Across ${uploadedDocsPipeline.length} Uploaded Files`
          : ''
      } — Updated "${localPipelineResult.canonicalDocument.title}" (${
        localPipelineResult.canonicalDocument.sections.length
      } sections · ${localPipelineResult.chatReply.aiScoreAfter}% AI Score).`
    );
    scrollChatToBottom();

    // Optional non-blocking background server verification
    setIsGenerating(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3500);

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'chatgpt',
          prompt: finalPrompt,
          inputContext: contextToUse,
          uploadedDocuments: uploadedDocsPipeline,
          currentDocument: currentDoc,
          actionMode: effectiveMode,
          tone,
          audience,
          lengthTarget: 'Medium (2–3 Pages)',
          useGeminiRefinement: true,
          depthMode: thinkingDepthMode,
        }),
      });
      window.clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.chatReply && data.document && data.geminiRefined) {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === assistantReplyId ? { ...data.chatReply, id: assistantReplyId } : m))
          );
          setCurrentDoc(data.document);
        }
      }
    } catch {
      // Instant localPipelineResult is already rendered on screen
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
        microThinking: sec.microThinking
          ? {
              ...sec.microThinking,
              selfCritiqueResolution: `Executed "${action}" micro-thinking pass: verified ${pipeline.lockedFacts.length} locked facts and kept AI score at ${pipeline.aiScoreAfter}%.`,
            }
          : undefined,
      };
    });

    const updatedDoc: CanonicalDocumentModel = {
      ...currentDoc,
      tone,
      audience,
      sections: updatedSections,
    };
    pushVersion(updatedDoc, `Section ${action}`);
    setStatusMessage(`Applied "${action}" micro-thinking pass on section (<10% AI Score, all facts locked).`);
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
      depthMode: thinkingDepthMode,
    });
    pushVersion(updatedDoc, `Thinking update: ${cleanInst.slice(0, 24)}`);
    setSectionPromptMap((prev) => ({ ...prev, [sectionId]: '' }));
    setStatusMessage(`Updated section via Claude micro-thinking prompt: "${cleanInst.slice(0, 52)}".`);
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
        fontStyle: artifactFontStyle,
        shapePreset: artifactShapePreset,
      });
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = cleanMinimalStructure
        ? `${targetDoc.documentTypeId}_${artifactFontStyle}_clean_humanized.pdf`
        : `${targetDoc.documentTypeId}_${artifactFontStyle}_template_humanized.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage(
        cleanMinimalStructure
          ? `Exported clean structure-preserved PDF ("${filename}") in ${artifactFontStyle.toUpperCase()} font.`
          : `Exported branded template PDF ("${filename}") in ${artifactFontStyle.toUpperCase()} font.`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  /**
   * 1-Click Handoff to Upper Page-by-Page PDF Humanizer (#workspace / #pdf-upload-input)
   * Compiles the finalized document into a real multi-page A4 PDF with the exact selected
   * Original Font (Serif / Sans / Mono) and embedded Vector Shape diagram, then loads it
   * directly into the upper PdfHumanizerWorkspace without modifying a single line of the upper component!
   */
  const handleSendToTopHumanizer = async (targetDoc: CanonicalDocumentModel = currentDoc) => {
    setIsSendingToTopHumanizer(true);
    const cleanTitleSlug = targetDoc.title
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 38);
    const filename = `${cleanTitleSlug || targetDoc.documentTypeId}_Claude_Artifact_${artifactFontStyle}.pdf`;

    setStatusMessage(
      `Compiling "${filename}" with ${artifactFontStyle.toUpperCase()} font & ${artifactShapePreset} shape and sending to Top PDF Humanizer...`
    );

    try {
      const pdfBytes = await exportCanonicalDocumentToPdfBytes(targetDoc, selectedTemplate, {
        cleanMinimalStructure: true,
        forTopHumanizer: true,
        fontStyle: artifactFontStyle,
        shapePreset: artifactShapePreset,
      });

      const pdfFile = new File([pdfBytes as unknown as BlobPart], filename, {
        type: 'application/pdf',
      });

      const topUploadInput = document.getElementById(
        'pdf-upload-input'
      ) as HTMLInputElement | null;

      if (topUploadInput) {
        const dt = new DataTransfer();
        dt.items.add(pdfFile);
        topUploadInput.files = dt.files;
        topUploadInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setSentToTopHumanizerFileName(filename);
      setStatusMessage(
        `Sent "${filename}" (Original ${artifactFontStyle.toUpperCase()} Font + A4 Shape) to the Top PDF Humanizer and auto-running page-by-page humanization!`
      );

      const topWorkspaceEl = document.getElementById('workspace');
      if (topWorkspaceEl) {
        topWorkspaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // Automatically trigger "Humanize All N Pages" in the upper workspace once PDF parsing finishes
      let attempts = 0;
      const pollInterval = window.setInterval(() => {
        attempts += 1;
        const workspaceRoot = document.getElementById('workspace') || document.body;
        const buttons = Array.from(workspaceRoot.querySelectorAll('button'));
        const humanizeAllBtn = buttons.find(
          (btn) =>
            /Humanize All \d+ Pages/i.test(btn.textContent || '') &&
            !btn.disabled &&
            !/0 Pages/i.test(btn.textContent || '')
        );
        if (humanizeAllBtn) {
          window.clearInterval(pollInterval);
          humanizeAllBtn.click();
        } else if (attempts >= 20) {
          window.clearInterval(pollInterval);
        }
      }, 250);
    } finally {
      setIsSendingToTopHumanizer(false);
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
      className="w-full bg-[#171717] text-[#ECECEC] border-t border-[#2F2F2F] py-6 sm:py-10 overflow-x-hidden [overflow-wrap:anywhere]"
    >
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 space-y-4 sm:space-y-5">
        {/* Clean Minimal Dark Section Header */}
        <div className="flex flex-col gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-[#2F2F2F]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#10A37F]">
                Claude / ChatGPT Artifact Document Studio + Top PDF Humanizer Bridge
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
                Build &amp; Refine Documents via Prompts, Then Send Perfect PDF to Top Humanizer
              </h2>
              <p className="text-xs sm:text-sm text-[#B4B4B4] leading-relaxed">
                Prompt like Claude or ChatGPT to create and iteratively refine your document on a
                live A4 sheet with original fonts &amp; vector figures. When finalized, click{' '}
                <strong className="text-white">Send Final PDF to Top Humanizer ↑</strong> to load it
                straight into the upper Page-by-Page PDF Humanizer.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
              <input
                ref={pdfFileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                aria-label="Upload Multiple Files into Document Pipeline"
                onChange={handleUploadPdfFileChange}
                className="hidden"
              />

              {/* Primary Bridge Action: Send Final PDF to Top Humanizer */}
              <button
                type="button"
                disabled={isSendingToTopHumanizer}
                onClick={() => handleSendToTopHumanizer(currentDoc)}
                className="min-h-[42px] px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/40 rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 shrink-0" />
                <span>
                  {isSendingToTopHumanizer
                    ? 'Sending PDF to Top Humanizer...'
                    : 'Send Final PDF to Top Humanizer ↑'}
                </span>
              </button>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => handleExportPdf(true)}
                  className="min-h-[40px] px-3 sm:px-3.5 py-2.5 text-xs font-semibold text-white bg-[#10A37F] rounded-lg hover:bg-[#0E906F] transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">
                    {isExportingPdf ? 'Exporting...' : 'Export Clean PDF'}
                  </span>
                  <span className="hidden sm:inline">
                    {isExportingPdf ? 'Exporting PDF...' : 'Download Clean PDF'}
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
                    {isExportingDocx ? 'Exporting...' : 'Word (.docx)'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Clean Inline Dark Controls: Document Type, Claude Thinking Depth, Original PDF Font, Page Shape, Tone & Telemetry */}
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
                className="w-full sm:max-w-[220px] truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-[#383838] rounded-lg focus:outline-none focus:border-[#10A37F]"
              >
                {DOCUMENT_TYPE_CATALOG.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#212121] text-[#ECECEC]">
                    {d.category}: {d.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Claude Thinking Depth Mode"
                value={thinkingDepthMode}
                onChange={(e) => {
                  const nextDepth = e.target.value as ClaudeThinkingDepthMode;
                  setThinkingDepthMode(nextDepth);
                  setStatusMessage(
                    `Switched Claude Thinking Depth to "${
                      THINKING_DEPTH_OPTIONS.find((o) => o.id === nextDepth)?.label || nextDepth
                    }" — Next prompt or section refinement will reason with this depth.`
                  );
                }}
                className="w-full sm:w-auto truncate min-h-[38px] px-3 py-2 text-xs font-semibold text-amber-200 bg-[#212121] border border-amber-500/50 rounded-lg focus:outline-none focus:border-amber-400"
              >
                {THINKING_DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#212121] text-[#ECECEC]">
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto min-w-0">
                <select
                  aria-label="Original PDF Font Style"
                  value={artifactFontStyle}
                  onChange={(e) => setArtifactFontStyle(e.target.value as ArtifactPdfFontStyle)}
                  className="w-full sm:w-auto truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-indigo-500/50 rounded-lg focus:outline-none focus:border-indigo-400"
                >
                  {FONT_STYLE_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#212121] text-[#ECECEC]">
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Original PDF Page Shape"
                  value={artifactShapePreset}
                  onChange={(e) => setArtifactShapePreset(e.target.value as ArtifactPdfShapePreset)}
                  className="w-full sm:w-auto truncate min-h-[38px] px-3 py-2 text-xs font-medium text-[#ECECEC] bg-[#212121] border border-indigo-500/50 rounded-lg focus:outline-none focus:border-indigo-400"
                >
                  {SHAPE_PRESET_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#212121] text-[#ECECEC]">
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

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
                Pipeline Files:{' '}
                <strong className="text-[#10A37F]">{uploadedDocsPipeline.length}</strong>
              </span>
              <span aria-hidden="true" className="text-[#555555]">
                ·
              </span>
              <span>
                Thinking Checks:{' '}
                <strong className="text-amber-300">{totalMicroDecisionsCount}</strong>
              </span>
              <span aria-hidden="true" className="text-[#555555]">
                ·
              </span>
              <span>
                AI Detector: <strong className="text-[#10A37F]">{averageAiScoreAfter}% AI</strong>{' '}
                (&lt;10%)
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
            className="text-xs text-[#B4B4B4] bg-[#212121] border border-[#2F2F2F] rounded-lg px-3.5 py-2 leading-relaxed break-words flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            role="status"
          >
            <span>{statusMessage}</span>
            {sentToTopHumanizerFileName && (
              <a
                href="#workspace"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 break-all sm:whitespace-nowrap"
              >
                View Loaded PDF in Top Humanizer ({sentToTopHumanizerFileName}) ↑
              </a>
            )}
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
              Claude / ChatGPT
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
              A4 Artifact ({currentDoc.sections.length})
            </button>
          </div>
        </div>

        {/* Main 2-Column Workspace: Left = Multi-Doc Pipeline + Claude Prompt Assistant, Right = Live A4 Artifact Document + Micro-Thinking */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start min-w-0">
          {/* LEFT COLUMN (5 cols): Multi-Document Ingestion Pipeline, Claude Extended Thinking & Iterative Prompting */}
          <div
            ref={leftColumnRef}
            className={`lg:col-span-5 min-w-0 bg-[#212121] border border-[#2F2F2F] rounded-xl flex flex-col overflow-hidden ${
              mobilePane === 'document' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Multi-Document Pipeline & Mode Toggle Header */}
            <div className="p-3.5 sm:p-4 border-b border-[#2F2F2F] bg-[#181818] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#10A37F]" />
                  <span>Multi-Document Pipeline + Claude Thinking</span>
                </span>
                {/* Mode Toggle: Update Live Artifact vs Generate New */}
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
                    Refine Artifact
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

              {/* Unlimited Continuous File Ingestion Buttons (No 3-File Cap — Feed 1 to ∞ Files) */}
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  data-testid="upload-multiple-files-btn"
                  disabled={isImportingPdf}
                  onClick={() => {
                    uploadModeRef.current = 'append';
                    pdfFileInputRef.current?.click();
                  }}
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-semibold text-white border border-[#10A37F]/60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                  <span>
                    {isImportingPdf
                      ? 'Reading Files...'
                      : `+ Upload & Add Files (${uploadedDocsPipeline.length} in ∞ Queue)`}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="feed-next-unlimited-doc-btn"
                  disabled={isImportingPdf}
                  onClick={() => handleFeedUnlimitedFilesToPipeline(1)}
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#1F2925] hover:bg-[#273630] text-xs font-semibold text-[#10A37F] border border-[#10A37F]/50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                  <span>+ Feed Next File (#{uploadedDocsPipeline.length + 1} → ∞)</span>
                </button>

                <button
                  type="button"
                  data-testid="feed-batch-unlimited-docs-btn"
                  disabled={isImportingPdf}
                  onClick={() => handleFeedUnlimitedFilesToPipeline(3)}
                  className="min-h-[38px] px-2.5 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                  <span>+ Feed 3 More Files</span>
                </button>

                <button
                  type="button"
                  data-testid="toggle-custom-file-creator-btn"
                  onClick={() => setShowInlineFileCreator((prev) => !prev)}
                  className="min-h-[38px] px-2.5 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[#9B9B9B] shrink-0" />
                  <span>{showInlineFileCreator ? 'Hide Custom File' : '+ Paste Custom File'}</span>
                </button>

                {uploadedDocsPipeline.length > 0 && (
                  <button
                    type="button"
                    data-testid="replace-pipeline-files-btn"
                    disabled={isImportingPdf}
                    onClick={() => {
                      uploadModeRef.current = 'replace';
                      pdfFileInputRef.current?.click();
                    }}
                    className="min-h-[38px] px-2.5 py-2 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#B4B4B4] border border-[#383838] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#9B9B9B] shrink-0" />
                    <span>Upload &amp; Replace</span>
                  </button>
                )}
              </div>

              {/* Inline Custom File Creator (Add Unlimited Pasted/Typed Files to Pipeline) */}
              {showInlineFileCreator && (
                <div
                  data-testid="inline-custom-file-creator"
                  className="p-3 rounded-xl bg-[#161F1C] border border-[#10A37F]/50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#10A37F]">
                      Create &amp; Feed File #{uploadedDocsPipeline.length + 1} into Unlimited
                      Pipeline
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowInlineFileCreator(false)}
                      className="text-[#9B9B9B] hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customFileNameInput}
                    onChange={(e) => setCustomFileNameInput(e.target.value)}
                    placeholder={`File name (e.g. ${String(uploadedDocsPipeline.length + 1).padStart(2, '0')}_Client_Notes_&_Budget.txt)`}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#222E2A] border border-[#334740] text-xs text-white placeholder-[#8E8E8E] focus:outline-none focus:border-[#10A37F]"
                  />
                  <textarea
                    rows={2}
                    value={customFileContentInput}
                    onChange={(e) => setCustomFileContentInput(e.target.value)}
                    placeholder="Paste or type document text, numbers, requirements, or notes for this file..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#222E2A] border border-[#334740] text-xs text-white placeholder-[#8E8E8E] focus:outline-none focus:border-[#10A37F]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      data-testid="submit-custom-pipeline-file-btn"
                      onClick={handleAddInlineCustomFileToPipeline}
                      className="px-3 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-white font-semibold text-xs cursor-pointer"
                    >
                      Add File #{uploadedDocsPipeline.length + 1} &amp; Run All 5 Pipeline Steps →
                    </button>
                  </div>
                </div>
              )}

              {/* Active 5-Step Unlimited Multi-Document Pipeline Queue & Per-File Analysis Cards */}
              {uploadedDocsPipeline.length > 0 ? (
                <div
                  data-testid="multi-doc-pipeline-queue"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOverPipeline(true);
                  }}
                  onDragLeave={() => setIsDraggingOverPipeline(false)}
                  onDrop={handlePipelineDrop}
                  className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
                    isDraggingOverPipeline
                      ? 'bg-[#1B2B25] border-[#10A37F]'
                      : 'bg-[#141C19] border-[#10A37F]/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[#10A37F] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        5-Step Unlimited Pipeline Active: {uploadedDocsPipeline.length} File(s)
                        Read &amp; Analyzed (∞ No Limit)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[#B4B4B4]">
                        {uploadedDocsPipeline.reduce((s, d) => s + d.pageCount, 0)}p ·{' '}
                        {uploadedDocsPipeline.reduce((s, d) => s + d.wordCount, 0)}w ·{' '}
                        {uploadedDocsPipeline.reduce((s, d) => s + d.lockedFacts.length, 0)} facts
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedDocsPipeline([]);
                          setImportedPdfMeta(null);
                          setStatusMessage('Cleared all files from Unlimited Multi-Document Pipeline.');
                        }}
                        className="text-[11px] text-[#B4B4B4] hover:text-white px-2 py-0.5 rounded bg-[#1F2D28] border border-[#2E423B] cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Interactive 5-Step Complete Unlimited Pipeline Progress Bar */}
                  <div
                    data-testid="complete-5-step-pipeline-bar"
                    className="space-y-1.5"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px]">
                      {livePipelineAnalysis.pipelineSteps.map((pStep) => {
                        const isSelected = activePipelineStep === pStep.stepNumber;
                        return (
                          <button
                            key={pStep.stepNumber}
                            type="button"
                            data-testid={`pipeline-step-btn-${pStep.stepNumber}`}
                            onClick={() => setActivePipelineStep(pStep.stepNumber)}
                            className={`text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#1F352D] border-[#10A37F] text-white'
                                : 'bg-[#1A2622] border-[#2A3F38] text-[#E2E2E2] hover:border-[#10A37F]/50'
                            }`}
                          >
                            <div className="font-semibold text-[#10A37F] flex items-center justify-between gap-1">
                              <span>Step {pStep.stepNumber}</span>
                              <span>✓</span>
                            </div>
                            <div className="font-medium text-white truncate">
                              {pStep.stepTitle.replace(/^Step \d+:\s*/, '')}
                            </div>
                            <div className="font-mono text-[9px] text-[#B4B4B4] truncate">
                              {pStep.metricBadge}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected Pipeline Step Live Execution Detail */}
                    {(() => {
                      const currentStepObj =
                        livePipelineAnalysis.pipelineSteps.find(
                          (s) => s.stepNumber === activePipelineStep
                        ) || livePipelineAnalysis.pipelineSteps[0];
                      if (!currentStepObj) return null;
                      return (
                        <div
                          data-testid="active-pipeline-step-detail"
                          className="px-2.5 py-1.5 rounded-lg bg-[#18231F] border border-[#283B34] text-[11px] text-[#D4D4D4] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                        >
                          <div className="min-w-0 break-words">
                            <strong className="text-[#10A37F]">{currentStepObj.stepTitle}:</strong>{' '}
                            {currentStepObj.detailSummary}
                          </div>
                          <span className="font-mono text-[10px] text-[#10A37F] shrink-0">
                            {currentStepObj.metricBadge}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Per-Document Cards with 5-Step Verified Badge & Expandable "Read Text" Inspector */}
                  <div className="space-y-1.5 max-h-[225px] overflow-y-auto pr-0.5">
                    {uploadedDocsPipeline.map((doc, idx) => {
                      const isDocExpanded = Boolean(expandedPipelineDocIds[doc.id]);
                      return (
                        <div
                          key={doc.id}
                          data-testid={`pipeline-doc-card-${idx + 1}`}
                          className="p-2 rounded-lg bg-[#1A2420] border border-[#2A3A34] space-y-1.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-[#10A37F]/20 text-[#10A37F] font-mono text-[10px] font-semibold">
                                  Doc #{idx + 1} · {doc.fileType}
                                </span>
                                <span className="font-semibold text-white break-all sm:truncate max-w-full">
                                  {doc.fileName}
                                </span>
                                <span className="text-[10px] font-mono text-[#9B9B9B]">
                                  ({doc.pageCount}p · {doc.wordCount}w · {doc.lockedFacts.length}{' '}
                                  facts)
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[#141C19] text-[#10A37F] font-mono text-[9px] border border-[#2A3A34]">
                                  Steps 1–5 ✓
                                </span>
                              </div>
                              <p className="text-[11px] text-[#B4B4B4] line-clamp-2 break-words">
                                {doc.summaryInsight}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => togglePipelineDocReader(doc.id)}
                                className="px-1.5 py-0.5 text-[10px] font-medium text-[#10A37F] hover:text-white rounded bg-[#141C19] border border-[#2A3A34] cursor-pointer"
                              >
                                {isDocExpanded ? 'Hide Text' : 'Read Text'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocFromPipeline(doc.id)}
                                aria-label={`Remove ${doc.fileName} from pipeline`}
                                className="p-1 text-[#9B9B9B] hover:text-white rounded bg-[#141C19] shrink-0 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {isDocExpanded && (
                            <div className="p-2 rounded bg-[#121916] border border-[#24332D] space-y-1.5 text-[11px]">
                              <div className="font-semibold text-[#10A37F]">
                                Extracted Text Read from {doc.fileName}:
                              </div>
                              <div className="text-[#D4D4D4] whitespace-pre-wrap max-h-[120px] overflow-y-auto leading-relaxed font-sans">
                                {doc.rawText}
                              </div>
                              {doc.lockedFacts.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-[#22302B]">
                                  <span className="text-[10px] text-[#9B9B9B]">Locked Facts:</span>
                                  {doc.lockedFacts.map((lf, fIdx) => (
                                    <span
                                      key={fIdx}
                                      className="px-1.5 py-0.5 rounded bg-[#1C2824] text-[#10A37F] font-mono text-[10px]"
                                    >
                                      {lf}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 1-Click Multi-Doc Pipeline Prompts */}
                  <div className="pt-1 border-t border-[#263831] space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#D4D4D4]">
                      1-Click Execute Prompt Across All {uploadedDocsPipeline.length} Queued
                      Document(s):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {MULTI_DOC_PIPELINE_PROMPTS.map((mp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          data-testid={`multi-doc-prompt-btn-${idx}`}
                          onClick={() => handleSendPrompt(mp, '', 'generate_new')}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-[#1F2D28] hover:bg-[#283B34] text-[11px] text-white border border-[#10A37F]/30 transition-colors cursor-pointer leading-snug"
                        >
                          {mp} →
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOverPipeline(true);
                  }}
                  onDragLeave={() => setIsDraggingOverPipeline(false)}
                  onDrop={handlePipelineDrop}
                  className="p-3 rounded-xl bg-[#161D1A] border border-dashed border-[#10A37F]/40 text-xs text-[#B4B4B4] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <span>
                    Drag &amp; drop unlimited files (.pdf, .docx, .txt, .md, .csv) here or click{' '}
                    <strong className="text-white">+ Feed Next File</strong> to start the 5-step
                    unlimited pipeline.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleFeedUnlimitedFilesToPipeline(3)}
                    className="px-2.5 py-1 rounded bg-[#1F2D28] text-[#10A37F] font-semibold shrink-0 cursor-pointer"
                  >
                    + Feed First 3 Files
                  </button>
                </div>
              )}

              {/* Active Single Imported PDF Status Box (when not using multi-doc queue) */}
              {importedPdfMeta && uploadedDocsPipeline.length === 0 && (
                <div className="p-2.5 rounded-lg bg-[#1F2925] border border-[#10A37F]/40 flex items-center justify-between gap-2 text-xs">
                  <div className="text-[#ECECEC] truncate">
                    <span className="font-semibold text-[#10A37F]">Imported PDF Active:</span>{' '}
                    {importedPdfMeta.fileName} ({importedPdfMeta.sectionCount} sections)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImportedPdfMeta(null);
                      setChatActionMode('edit_current');
                    }}
                    className="text-[11px] text-[#B4B4B4] hover:text-white shrink-0 px-1.5 py-0.5 rounded bg-[#171F1C] cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* 1-Click Starter Prompts (Generate New Artifact) */}
              <div className="pt-0.5 space-y-1.5">
                <div className="text-[11px] font-medium text-[#9B9B9B]">
                  1-Click Start New Document Artifact (Then Refine by Prompt):
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

            {/* Conversation, Multi-Doc Analysis, Claude Extended Thinking Trace & AI Missing Details Suggestions */}
            <div
              ref={chatScrollContainerRef}
              className="p-3.5 sm:p-4 space-y-3.5 max-h-[480px] sm:max-h-[600px] overflow-y-auto"
            >
              {chatMessages.slice(-6).map((msg) => {
                const trace = msg.thinkingTrace || msg.canonicalDocument?.thinkingTrace;
                const isThinkingExpanded = Boolean(expandedThinkingMsgIds[msg.id]);

                return msg.role === 'user' ? (
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
                        {msg.detectedDocTypeName || 'Claude Document Artifact'}
                      </span>
                      <span>
                        AI Score: {msg.aiScoreBefore}% →{' '}
                        <strong className="text-[#10A37F]">{msg.aiScoreAfter}%</strong>
                      </span>
                    </div>

                    {/* Multi-Document Pipeline Analysis Badge (if multiple files were read & analyzed) */}
                    {msg.multiDocAnalysis && (
                      <div className="p-2.5 rounded-lg bg-[#14201C] border border-[#10A37F]/40 space-y-1.5 text-[11px]">
                        <div className="font-semibold text-[#10A37F] flex items-center justify-between gap-2">
                          <span>
                            Multi-Document Analysis ({msg.multiDocAnalysis.totalFiles} Files ·{' '}
                            {msg.multiDocAnalysis.totalPages} Pages ·{' '}
                            {msg.multiDocAnalysis.totalWords} Words)
                          </span>
                          <span className="font-mono text-white">
                            {msg.multiDocAnalysis.totalLockedFactsCount} Locked Facts
                          </span>
                        </div>
                        <p className="text-[#D4D4D4] leading-snug break-words">
                          {msg.multiDocAnalysis.promptExecutionSummary}
                        </p>
                      </div>
                    )}

                    {/* Direct Prompt Execution & Analysis Bullets (Immediate visible response to every user prompt) */}
                    {msg.directAnswerBullets && msg.directAnswerBullets.length > 0 && (
                      <div
                        data-testid="direct-prompt-execution-summary"
                        className="p-2.5 rounded-lg bg-[#202020] border border-[#343434] space-y-1.5 text-xs"
                      >
                        <div className="font-semibold text-white text-[11px] uppercase tracking-wider text-[#10A37F]">
                          Prompt Execution &amp; Document Analysis Summary:
                        </div>
                        <ul className="space-y-1 text-[11px] text-[#E2E2E2] list-disc pl-4 leading-snug">
                          {msg.directAnswerBullets.map((b, bIdx) => (
                            <li key={bIdx} className="break-words">
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Expandable Claude Extended Thinking (6 Stages · N Micro-Decisions) Block */}
                    {trace && (
                      <div
                        data-testid="claude-extended-thinking-box"
                        className="rounded-lg bg-[#141414] border border-amber-500/30 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleThinkingAccordion(msg.id)}
                          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[#1E1E1E] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-[11px] font-semibold text-amber-300 truncate">
                              Claude Extended Thinking ({trace.steps.length} Stages ·{' '}
                              {trace.microDecisionsCount} Micro-Decisions Verified)
                            </span>
                          </div>
                          {isThinkingExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          )}
                        </button>

                        {isThinkingExpanded && (
                          <div className="px-3 pb-3 pt-1.5 border-t border-[#2A2A2A] space-y-2.5 text-[11px]">
                            <p className="text-[#D4D4D4] leading-relaxed break-words">
                              {trace.executiveSummaryOfThought}
                            </p>
                            <div className="space-y-2">
                              {trace.steps.map((step, sIdx) => (
                                <div
                                  key={step.stepNumber}
                                  className="p-2 rounded bg-[#1C1C1C] border border-[#2C2C2C] space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-white">
                                      Stage {sIdx + 1}: {step.stageTitle}
                                    </span>
                                    <span className="font-mono text-[10px] text-amber-300 shrink-0">
                                      {step.microChecksPassed} checks ✓
                                    </span>
                                  </div>
                                  <div className="text-[#9B9B9B] break-words">
                                    <strong className="text-[#C4C4C4]">Focus:</strong>{' '}
                                    {step.cognitiveFocus}
                                  </div>
                                  <div className="text-[#B4B4B4] leading-snug break-words">
                                    {step.reasoningDetail}
                                  </div>
                                  <div className="text-[#10A37F] font-medium break-words">
                                    ✓ {step.verifiedOutcome}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-[#B4B4B4] leading-relaxed break-words">
                      {msg.assistantIntro ||
                        `Prepared ${
                          msg.autoGeneratedOutline?.length || 6
                        } structured sections on the live A4 Artifact sheet. Give any follow-up prompt to add sections or refine details, or send the finalized PDF to the Top Humanizer.`}
                    </p>

                    {msg.canonicalDocument && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isSendingToTopHumanizer}
                          onClick={() => handleSendToTopHumanizer(msg.canonicalDocument!)}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                          <span>Send Final PDF to Top Humanizer ↑</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRightView('thinking');
                            if (mobilePane === 'chat') {
                              setMobilePane('document');
                            }
                          }}
                          className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-[11px] font-semibold text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Brain className="w-3 h-3 shrink-0" />
                          <span>Inspect Section Thinking</span>
                        </button>

                        <button
                          type="button"
                          disabled={isExportingPdf}
                          onClick={() => handleExportPdf(true, msg.canonicalDocument!)}
                          className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-[11px] font-semibold text-[#ECECEC] border border-[#383838] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 shrink-0" />
                          <span>Download PDF</span>
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
                          View A4 Sheet ↓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* AI Missing Things Auto-Suggestions (1-Click Selection — Zero Manual Typing) */}
              {latestAssistantMsg?.detectedMissingDetails &&
                latestAssistantMsg.detectedMissingDetails.length > 0 && (
                  <div className="border-t border-[#2F2F2F] pt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        AI-Suggested Missing Details (Tap to Update Artifact)
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
                    1-Click Claude Extended Thinking Refinements
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Add a new section on 99.99% Uptime SLA & Enterprise Security',
                      ...latestAssistantMsg.followUpPrompts.slice(0, 2),
                    ].map((fp) => (
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

            {/* Bottom Unified Claude / ChatGPT Dark Composer Card */}
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
                    uploadedDocsPipeline.length > 0
                      ? `Ask anything or give any instruction across your ${uploadedDocsPipeline.length} uploaded file(s)...`
                      : chatActionMode === 'edit_current'
                      ? `Prompt Claude/ChatGPT to update "${currentDoc.title.slice(0, 28)}..." (e.g. 'Add section on ROI')`
                      : "Describe a new document to build from scratch (e.g. 'Business proposal for Nova')..."
                  }
                  className="w-full px-1.5 py-1 bg-transparent text-xs sm:text-sm text-white placeholder-[#9B9B9B] focus:outline-none"
                />

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#383838]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => pdfFileInputRef.current?.click()}
                      title="Upload 1 or multiple files (.pdf, .docx, .txt)"
                      aria-label="Upload 1 or multiple files (.pdf, .docx, .txt)"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#333333] text-[#ECECEC] border border-[#3D3D3D] flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
                      <span className="sm:hidden">+ Files</span>
                      <span className="hidden sm:inline">+ Upload Files</span>
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
                    data-testid="send-prompt-btn"
                    disabled={isGenerating}
                    onClick={() => handleSendPrompt()}
                    className="min-h-[36px] px-3.5 sm:px-4 py-1.5 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {uploadedDocsPipeline.length > 0
                        ? `Run on ${uploadedDocsPipeline.length} File(s)`
                        : chatActionMode === 'edit_current'
                        ? 'Update Document'
                        : 'Generate'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Claude-Style Live A4 Artifact Document Preview, Per-Section Thinking Blueprint, Section Refiner & Version History */}
          <div
            ref={rightColumnRef}
            className={`lg:col-span-7 min-w-0 bg-[#212121] border border-[#2F2F2F] rounded-xl flex flex-col overflow-hidden ${
              mobilePane === 'chat' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Right Panel Artifact Toolbar */}
            <div className="px-3.5 sm:px-4 py-3 border-b border-[#2F2F2F] bg-[#1B1B1B] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2.5">
              {/* Segmented View Control */}
              <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-[#141414] border border-[#2F2F2F] rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setRightView('preview')}
                  className={`min-h-[34px] px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors truncate text-center cursor-pointer ${
                    rightView === 'preview'
                      ? 'bg-[#2F2F2F] text-white shadow-xs'
                      : 'text-[#9B9B9B] hover:text-white'
                  }`}
                >
                  <span className="sm:hidden">A4 Sheet</span>
                  <span className="hidden sm:inline">A4 Artifact Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightView('thinking')}
                  className={`min-h-[34px] px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors truncate text-center flex items-center justify-center gap-1 cursor-pointer ${
                    rightView === 'thinking'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  <Brain className="w-3 h-3 shrink-0" />
                  <span>Thinking ({currentDoc.sections.length})</span>
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

              {/* Template, Micro-Thinking Toggle, Compare, Copy & Send to Top Humanizer Controls */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <select
                  aria-label="Document Template"
                  value={selectedTemplate.id}
                  onChange={(e) => {
                    const tpl = PROFESSIONAL_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) setSelectedTemplate(tpl);
                  }}
                  className="flex-1 sm:flex-initial min-w-[125px] truncate min-h-[34px] px-2.5 py-1.5 text-xs text-[#ECECEC] bg-[#2A2A2A] border border-[#383838] rounded-lg"
                >
                  {PROFESSIONAL_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id} className="bg-[#212121] text-[#ECECEC]">
                      Template: {tpl.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowMicroThinkingOnA4(!showMicroThinkingOnA4)}
                  className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                    showMicroThinkingOnA4
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                      : 'bg-[#2A2A2A] text-[#ECECEC] border-[#383838] hover:bg-[#343434]'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {showMicroThinkingOnA4 ? 'Micro-Thinking: ON' : 'Micro-Thinking: OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRawCompare(!showRawCompare)}
                  className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#343434] text-xs font-medium text-[#ECECEC] border border-[#383838] whitespace-nowrap cursor-pointer"
                >
                  {showRawCompare ? 'A4 Paper View' : 'Compare Raw vs Humanized'}
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
                  disabled={isSendingToTopHumanizer}
                  onClick={() => handleSendToTopHumanizer(currentDoc)}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span>Send to Top Humanizer ↑</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: Claude-Style Live A4 Paper Sheet Preview inside Dark Studio */}
            {rightView === 'preview' && (
              <div className="p-3 sm:p-5 lg:p-6 bg-[#141414] space-y-4 max-h-[600px] sm:max-h-[740px] overflow-y-auto">
                {showRawCompare ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 bg-[#1C1C1C] p-4 rounded-xl border border-[#2F2F2F]">
                    <div className="space-y-3 border-b md:border-b-0 md:border-r border-[#2F2F2F] pb-4 md:pb-0 md:pr-4">
                      <div className="text-xs font-semibold text-[#9B9B9B]">
                        Original Un-Humanized Draft (Sent to Top Humanizer for Before/After Proof)
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
                  /* Realistic Crisp A4 Paper Artifact Sheet (Matches Exported PDF Font & Shape 1:1) */
                  <div
                    data-testid="claude-a4-artifact-sheet"
                    className={`bg-white text-slate-900 rounded-lg shadow-xl border border-slate-300 p-5 sm:p-8 lg:p-10 mx-auto max-w-[780px] space-y-5 ${activeFontClass}`}
                  >
                    {/* Top A4 Paper Header */}
                    <div className="border-b-2 border-slate-800 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                      <div className="space-y-1">
                        <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-indigo-700">
                          {selectedTemplate.companyName} · {selectedTemplate.pageSize} ORIGINAL{' '}
                          {artifactFontStyle.toUpperCase()} PDF ARTIFACT
                        </div>
                        <h3 className="text-lg sm:text-2xl font-bold text-slate-950 leading-tight break-words">
                          {currentDoc.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 break-words">
                          {currentDoc.subtitle}
                        </p>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                        v{currentDoc.currentVersionNumber} · {currentDoc.sections.length} Sections ·{' '}
                        {totalMicroDecisionsCount} Checks
                      </div>
                    </div>

                    {/* Section 1 + Embedded Vector Shape Diagram (When Executive Figure or Technical Blueprint is selected) */}
                    {currentDoc.sections.map((sec, idx) => {
                      const showFigureBesideSection =
                        idx === 0 && artifactShapePreset !== 'clean_editorial';

                      return (
                        <div key={sec.id} className="space-y-2.5 pt-1">
                          {showFigureBesideSection ? (
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                              <div className="md:col-span-7 space-y-2">
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 break-words">
                                  {idx + 1}. {sec.heading}
                                </h4>
                                {sec.paragraphs.map((p, pIdx) => (
                                  <p
                                    key={pIdx}
                                    className="text-xs sm:text-[13px] text-slate-800 leading-relaxed break-words"
                                  >
                                    {p}
                                  </p>
                                ))}
                              </div>

                              {/* Embedded Vector Architecture / KPI Figure Box (Preserved as Visual Region in Top Humanizer) */}
                              <div className="md:col-span-5 rounded-lg border-2 border-indigo-900/80 bg-slate-50 p-3 space-y-2.5 self-start">
                                <div className="bg-indigo-950 text-white px-2.5 py-1.5 rounded text-[10px] font-sans font-bold tracking-wide uppercase flex items-center justify-between">
                                  <span>
                                    {artifactShapePreset === 'technical_blueprint'
                                      ? 'FIG 1. ARCHITECTURE TOPOLOGY'
                                      : 'FIG 1. EXECUTIVE KPI & ROI MODEL'}
                                  </span>
                                  <span className="text-emerald-300">LOCKED</span>
                                </div>
                                <div className="space-y-1.5 font-sans">
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] font-semibold text-slate-700">
                                      <span>Phase 1 Baseline</span>
                                      <span>52%</span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-200 rounded overflow-hidden">
                                      <div className="h-full w-[52%] bg-indigo-600 rounded" />
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] font-semibold text-slate-700">
                                      <span>Phase 2 Optimization</span>
                                      <span>78%</span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-200 rounded overflow-hidden">
                                      <div className="h-full w-[78%] bg-emerald-600 rounded" />
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] font-semibold text-slate-700">
                                      <span>Target SLA &amp; ROI</span>
                                      <span>96%</span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-200 rounded overflow-hidden">
                                      <div className="h-full w-[96%] bg-amber-500 rounded" />
                                    </div>
                                  </div>
                                </div>
                                <div className="text-[10px] font-sans text-slate-600 border-t border-slate-200 pt-1.5 leading-snug">
                                  Embedded vector diagram in PDF — automatically detected &amp;
                                  locked by Top PDF Humanizer.
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h4 className="text-sm sm:text-base font-bold text-slate-900 break-words">
                                {idx + 1}. {sec.heading}
                              </h4>
                              {sec.paragraphs.map((p, pIdx) => (
                                <p
                                  key={pIdx}
                                  className="text-xs sm:text-[13px] text-slate-800 leading-relaxed break-words"
                                >
                                  {p}
                                </p>
                              ))}
                            </>
                          )}

                          {sec.bullets && sec.bullets.length > 0 && (
                            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                              {sec.bullets.map((b, bIdx) => (
                                <li key={bIdx} className="break-words">
                                  {b}
                                </li>
                              ))}
                            </ul>
                          )}
                          {sec.table && sec.table.rows.length > 0 && (
                            <div className="overflow-x-auto pt-1.5 max-w-full">
                              <table className="w-full table-fixed sm:table-auto text-xs border border-slate-300 font-sans">
                                <thead className="bg-slate-100 text-slate-900">
                                  <tr>
                                    {sec.table.headers.map((h, hIdx) => (
                                      <th
                                        key={hIdx}
                                        className="p-2 text-left border-b border-slate-300 font-semibold break-words"
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sec.table.rows.map((r, rIdx) => (
                                    <tr key={rIdx} className="border-b border-slate-200">
                                      {r.map((cell, cIdx) => (
                                        <td
                                          key={cIdx}
                                          className={`p-2 break-words ${
                                            cIdx === 0
                                              ? 'font-medium text-slate-900 break-all sm:break-words'
                                              : 'text-slate-700'
                                          }`}
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Per-Section Claude Micro-Thinking Audit Banner (Visible when showMicroThinkingOnA4 is ON; excluded from exported PDF binary) */}
                          {showMicroThinkingOnA4 && sec.microThinking && (
                            <div
                              data-testid={`a4-micro-thinking-sec-${idx + 1}`}
                              className="mt-2 rounded-lg bg-slate-900 text-slate-100 p-3 font-sans text-[11px] space-y-2 border border-amber-500/40"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-1.5">
                                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                                  <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>
                                    Claude Micro-Thinking Blueprint · Section {idx + 1} (
                                    {sec.microThinking.confidenceScore}% Reasoning Confidence)
                                  </span>
                                </span>
                                <span className="font-mono text-[10px] text-emerald-300">
                                  {sec.metrics.aiScoreAfter}% AI · {sec.lockedFacts.length} Facts
                                  Locked
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-snug">
                                <div>
                                  <span className="font-semibold text-amber-200">
                                    Cognitive Goal:
                                  </span>{' '}
                                  <span className="text-slate-300">
                                    {sec.microThinking.cognitiveGoal}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-200">
                                    First-Principles Logic:
                                  </span>{' '}
                                  <span className="text-slate-300">
                                    {sec.microThinking.firstPrinciplesLogic}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-emerald-300">
                                    Fact-Lock Audit:
                                  </span>{' '}
                                  <span className="text-slate-300">
                                    {sec.microThinking.factLockAudit}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-indigo-300">
                                    Self-Critique Resolution:
                                  </span>{' '}
                                  <span className="text-slate-300">
                                    {sec.microThinking.selfCritiqueResolution}
                                  </span>
                                </div>
                              </div>

                              {/* 1-Click Deepen Section Thinking Chips */}
                              <div className="pt-1 border-t border-slate-800 flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-semibold text-amber-300 shrink-0">
                                  1-Click Deepen Section Thinking:
                                </span>
                                {sec.microThinking.thinkingUpgradePrompts.map((upPrompt, uIdx) => (
                                  <button
                                    key={uIdx}
                                    type="button"
                                    onClick={() => handleApplySectionPrompt(sec.id, upPrompt)}
                                    className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-100 border border-slate-600 transition-colors cursor-pointer whitespace-normal break-words max-w-full"
                                  >
                                    + {upPrompt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Clean Finalized Document Export & Top Humanizer Handoff Footer */}
                <div className="pt-3 sm:pt-4 border-t border-[#2F2F2F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[#B4B4B4]">
                    Original Font:{' '}
                    <strong className="text-white uppercase">{artifactFontStyle}</strong> · Shape:{' '}
                    <strong className="text-white">{artifactShapePreset}</strong> ·{' '}
                    <span className="font-mono font-semibold text-[#10A37F]">
                      {averageAiScoreAfter}% AI Score
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      disabled={isSendingToTopHumanizer}
                      onClick={() => handleSendToTopHumanizer(currentDoc)}
                      className="min-h-[38px] px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isSendingToTopHumanizer
                          ? 'Sending to Top Humanizer...'
                          : 'Send Final PDF to Top Humanizer ↑'}
                      </span>
                    </button>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isExportingPdf}
                        onClick={() => handleExportPdf(true)}
                        className="min-h-[38px] px-3 py-2 rounded-lg bg-[#10A37F] hover:bg-[#0E906F] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Download Clean PDF</span>
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

            {/* VIEW 2: Dedicated Claude Extended Thinking & Per-Section Micro-Thinking Inspector */}
            {rightView === 'thinking' && (
              <div
                data-testid="claude-thinking-inspector-view"
                className="p-3.5 sm:p-5 space-y-4 max-h-[580px] sm:max-h-[720px] overflow-y-auto"
              >
                {/* Document-Level 6-Stage Extended Thinking Trace Card */}
                {currentDoc.thinkingTrace && (
                  <div className="p-4 rounded-xl bg-[#181818] border border-amber-500/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2F2F2F] pb-2.5">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-bold text-white">
                          Claude 6-Stage Extended Thinking Trace ({currentDoc.thinkingTrace.depthMode.toUpperCase()})
                        </span>
                      </div>
                      <span className="text-xs font-mono text-amber-300">
                        {currentDoc.thinkingTrace.microDecisionsCount} Micro-Decisions Verified ✓
                      </span>
                    </div>

                    <p className="text-xs text-[#D4D4D4] leading-relaxed break-words">
                      {currentDoc.thinkingTrace.executiveSummaryOfThought}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {currentDoc.thinkingTrace.steps.map((step, idx) => (
                        <div
                          key={step.stepNumber}
                          className="p-3 rounded-lg bg-[#212121] border border-[#333333] space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-amber-300">
                              Stage {idx + 1}: {step.stageTitle}
                            </span>
                            <span className="font-mono text-[11px] text-[#10A37F]">
                              {step.microChecksPassed} checks
                            </span>
                          </div>
                          <div className="text-[11px] text-[#B4B4B4] break-words">
                            <strong className="text-white">Focus:</strong> {step.cognitiveFocus}
                          </div>
                          <div className="text-[11px] text-[#D4D4D4] leading-relaxed break-words">
                            {step.reasoningDetail}
                          </div>
                          <div className="text-[11px] text-[#10A37F] flex items-center gap-1 pt-0.5">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>{step.verifiedOutcome}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-Section Micro-Thinking Blueprint Cards */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Section-by-Section Micro-Thinking Blueprints ({currentDoc.sections.length}{' '}
                    Sections)
                  </div>

                  {currentDoc.sections.map((sec, idx) => (
                    <div
                      key={sec.id}
                      className="p-4 rounded-xl bg-[#1A1A1A] border border-[#2F2F2F] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2F2F2F] pb-2">
                        <span className="text-sm font-bold text-white">
                          {idx + 1}. {sec.heading}
                        </span>
                        <span className="text-xs font-mono text-amber-300">
                          Confidence: {sec.microThinking?.confidenceScore || 98}% ·{' '}
                          <strong className="text-[#10A37F]">{sec.metrics.aiScoreAfter}% AI</strong>
                        </span>
                      </div>

                      {sec.microThinking && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                          <div className="p-2.5 rounded-lg bg-[#222222] border border-[#333333]">
                            <div className="font-semibold text-amber-300 mb-0.5">
                              1. Cognitive Goal
                            </div>
                            <div className="text-[#D4D4D4] leading-relaxed">
                              {sec.microThinking.cognitiveGoal}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-[#222222] border border-[#333333]">
                            <div className="font-semibold text-amber-300 mb-0.5">
                              2. First-Principles Deductive Logic
                            </div>
                            <div className="text-[#D4D4D4] leading-relaxed">
                              {sec.microThinking.firstPrinciplesLogic}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-[#222222] border border-[#333333]">
                            <div className="font-semibold text-[#10A37F] mb-0.5">
                              3. Fact-Lock &amp; Entity Audit
                            </div>
                            <div className="text-[#D4D4D4] leading-relaxed">
                              {sec.microThinking.factLockAudit}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-[#222222] border border-[#333333]">
                            <div className="font-semibold text-indigo-300 mb-0.5">
                              4. Cadence, Burstiness &amp; Self-Critique
                            </div>
                            <div className="text-[#D4D4D4] leading-relaxed">
                              {sec.microThinking.cadenceAndBurstinessPlan}{' '}
                              {sec.microThinking.selfCritiqueResolution}
                            </div>
                          </div>
                        </div>
                      )}

                      {sec.microThinking?.thinkingUpgradePrompts && (
                        <div className="pt-1 flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-semibold text-amber-300">
                            Tap to Deepen Section {idx + 1} Thinking:
                          </span>
                          {sec.microThinking.thinkingUpgradePrompts.map((upPrompt, uIdx) => (
                            <button
                              key={uIdx}
                              type="button"
                              onClick={() => {
                                handleApplySectionPrompt(sec.id, upPrompt);
                                setRightView('preview');
                              }}
                              className="text-left px-2.5 py-1.5 rounded-lg bg-[#262626] hover:bg-[#343434] text-[11px] text-[#ECECEC] border border-[#383838] transition-colors cursor-pointer whitespace-normal break-words max-w-full"
                            >
                              + {upPrompt} →
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW 3: Clean Dark Section-by-Section Prompt Refiner */}
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

                    {sec.microThinking && (
                      <div className="p-2.5 rounded-lg bg-[#141414] border border-amber-500/30 text-[11px] text-[#D4D4D4] space-y-1">
                        <div className="font-semibold text-amber-300 flex items-center gap-1">
                          <Brain className="w-3 h-3 shrink-0" />
                          <span>Section Micro-Thinking Goal:</span>
                        </div>
                        <div>{sec.microThinking.cognitiveGoal}</div>
                      </div>
                    )}

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
                        placeholder={`Prompt Claude to update "${sec.heading}"...`}
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

            {/* VIEW 4: Clean Dark Version History */}
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
