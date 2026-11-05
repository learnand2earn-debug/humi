'use client';

import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  DOCUMENT_TYPE_CATALOG,
  PROFESSIONAL_TEMPLATES,
  AgentRewriteTone,
  AudienceLevel,
  CanonicalDocumentModel,
  DocumentVersionRecord,
  TemplateStyleConfig,
  ChatGptMessage,
  generateChatGptStyleResponse,
  applyPromptToDocumentOrSection,
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
    'Ready — Type any prompt or click a suggestion below. AI automatically suggests missing details, generates the document, and humanizes it under 10% AI score.'
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

  const handleSendPrompt = async (overridePrompt?: string, overrideContext?: string) => {
    const promptToUse = (overridePrompt !== undefined ? overridePrompt : chatInputPrompt).trim();
    const contextToUse = (
      overrideContext !== undefined ? overrideContext : chatAttachedContext
    ).trim();

    if (!promptToUse && !contextToUse) return;

    const finalPrompt =
      promptToUse ||
      'Analyze this input text, suggest missing details, structure it into headings, and humanize it under 10% AI score.';

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
    setStatusMessage('Generating structured document, auto-filling missing details, and humanizing (<10% AI score)...');

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
      className="w-full bg-[#F8FAFC] text-slate-900 border-t border-slate-200 py-10"
    >
      <div className="max-w-[1440px] mx-auto px-6 space-y-6">
        {/* Clean Minimal Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500">
              Prompt-Driven AI Content &amp; Document Studio
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Generate &amp; Humanize Complete Documents from a Single Prompt
            </h2>
            <p className="text-sm text-slate-600 max-w-3xl">
              Just describe what you need like ChatGPT. The agent automatically suggests missing
              details, builds the outline, locks facts, humanizes text under 10% AI score, and
              exports to PDF or Word.
            </p>
          </div>

          {/* Clean Inline Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <select
              aria-label="Document Type Preset"
              onChange={(e) => {
                const found = DOCUMENT_TYPE_CATALOG.find((d) => d.id === e.target.value);
                if (found) {
                  handleSendPrompt(
                    `Generate a complete ${found.name} (${found.category}) with all required sections and suggested details.`
                  );
                }
              }}
              value={currentDoc.documentTypeId}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            >
              {DOCUMENT_TYPE_CATALOG.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.category}: {d.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Humanizer Tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as AgentRewriteTone)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  Tone: {t}
                </option>
              ))}
            </select>

            <select
              aria-label="Target Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceLevel)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            >
              {AUDIENCES.map((aud) => (
                <option key={aud} value={aud}>
                  {aud}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={() => handleExportPdf(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isExportingPdf ? 'Exporting PDF...' : 'Export Clean Humanized PDF'}
              </span>
            </button>

            <button
              type="button"
              disabled={isExportingDocx}
              onClick={handleExportDocx}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingDocx ? 'Exporting...' : 'Download Word (.docx)'}</span>
            </button>
          </div>
        </div>

        {/* Clean Unboxed Status & Telemetry Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span>
              AI Detector: <strong className="text-slate-900">{averageAiScoreAfter}% AI</strong>{' '}
              (&lt;10% Target)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Locked Facts: <strong className="text-slate-900">{totalLockedFactsCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Sections: <strong className="text-slate-900">{currentDoc.sections.length}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Version: <strong className="text-slate-900">v{currentDoc.currentVersionNumber}</strong>
            </span>
          </div>
          <div className="text-slate-500 truncate max-w-xl">{statusMessage}</div>
        </div>

        {/* Main 2-Column Workspace: Left = ChatGPT Prompt & Missing-Details Assistant, Right = Live Document */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (5 cols): ChatGPT Prompt Composer & AI Missing-Details Suggestions */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
            {/* Quick Starter Prompts */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                1-Click Starter Prompts (No Manual Typing Needed)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleSendPrompt(item.prompt, item.context)}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation & AI Missing Details Suggestions */}
            <div className="p-4 space-y-4 max-h-[540px] overflow-y-auto">
              {chatMessages.slice(-4).map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[90%] rounded-xl bg-slate-900 text-white px-3.5 py-2.5 text-xs leading-relaxed">
                      {msg.promptText}
                    </div>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums border-b border-slate-200 pb-2">
                      <span className="font-sans font-semibold text-slate-800">
                        {msg.detectedDocTypeName || 'Generated Document'}
                      </span>
                      <span>
                        AI Score: {msg.aiScoreBefore}% →{' '}
                        <strong className="text-emerald-700">{msg.aiScoreAfter}%</strong>
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      AI automatically generated {msg.autoGeneratedOutline?.length || 6} sections,
                      locked all numbers/facts, and filled missing details from your prompt.
                    </p>

                    {msg.canonicalDocument && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isExportingPdf}
                          onClick={() => handleExportPdf(true, msg.canonicalDocument!)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export Clean PDF (Preserve Structure)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* AI Missing Things Auto-Suggestions (1-Click Selection — Zero Manual Typing) */}
              {latestAssistantMsg?.detectedMissingDetails &&
                latestAssistantMsg.detectedMissingDetails.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">
                        AI-Suggested Missing Details (Click Any Option to Update)
                      </span>
                      <span className="text-[11px] text-slate-500">Auto-Filled</span>
                    </div>

                    <div className="space-y-2">
                      {latestAssistantMsg.detectedMissingDetails.slice(0, 4).map((md) => (
                        <div
                          key={md.fieldKey}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                        >
                          <div className="text-xs font-medium text-slate-700">
                            {md.label}:{' '}
                            <span className="font-normal text-slate-500">
                              {md.aiAutoFilledValue.slice(0, 65)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {md.promptOptions.map((opt, idx) => (
                              <button
                                key={`${md.fieldKey}-${idx}`}
                                type="button"
                                onClick={() =>
                                  handleSendPrompt(
                                    `${latestAssistantMsg.promptText} — Set ${md.label} to "${opt}" and update the document.`
                                  )
                                }
                                className="text-left px-2 py-1 rounded bg-white hover:bg-slate-100 text-[11px] text-slate-700 border border-slate-200 transition-colors cursor-pointer"
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
                <div className="border-t border-slate-200 pt-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700">
                    1-Click Follow-Up Refinements
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {latestAssistantMsg.followUpPrompts.slice(0, 3).map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => handleSendPrompt(fp)}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                      >
                        {fp} →
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom ChatGPT Prompt Input Bar */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50/50 space-y-2.5">
              {showContextBox && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">Paste Source Text / Notes (Optional)</span>
                    <button
                      type="button"
                      onClick={() => setShowContextBox(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      Hide
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={chatAttachedContext}
                    onChange={(e) => setChatAttachedContext(e.target.value)}
                    placeholder="Paste existing notes, article, or PDF text here..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-400"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                {!showContextBox && (
                  <button
                    type="button"
                    onClick={() => setShowContextBox(true)}
                    title="Paste Source Text"
                    className="p-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shrink-0 cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}

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
                  placeholder="Write a prompt (e.g. 'Business proposal for Nova Retail' or 'Make it 1 page')..."
                  className="flex-1 px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                />

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleSendPrompt()}
                  className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Generate</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Clean Live Document Preview, Section Refiner & Version History */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
            {/* Right Panel Toolbar */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
              {/* Segmented View Control */}
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRightView('preview')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    rightView === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Document Preview
                </button>
                <button
                  type="button"
                  onClick={() => setRightView('sections')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    rightView === 'sections'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Refine Sections ({currentDoc.sections.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightView('versions')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    rightView === 'versions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  History (v{versionHistory.length})
                </button>
              </div>

              {/* Template & Copy Controls */}
              <div className="flex items-center gap-2">
                <select
                  aria-label="Document Template"
                  value={selectedTemplate.id}
                  onChange={(e) => {
                    const tpl = PROFESSIONAL_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) setSelectedTemplate(tpl);
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg"
                >
                  {PROFESSIONAL_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      Template: {tpl.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowRawCompare(!showRawCompare)}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 whitespace-nowrap cursor-pointer"
                >
                  {showRawCompare ? 'Single View' : 'Compare Raw vs Humanized'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFullDocument}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedDoc ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => handleExportPdf(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Clean PDF</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: Clean Document Preview */}
            {rightView === 'preview' && (
              <div className="p-6 sm:p-8 space-y-6 max-h-[700px] overflow-y-auto">
                {showRawCompare ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 border-r border-slate-200 pr-4">
                      <div className="text-xs font-semibold text-slate-500">
                        Original Un-Humanized Draft
                      </div>
                      {currentDoc.sections.map((sec, idx) => (
                        <div key={sec.id} className="space-y-1.5">
                          <h4 className="text-xs font-bold text-slate-700">
                            {idx + 1}. {sec.heading}
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {sec.originalParagraphs.join('\n\n')}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-emerald-700">
                        Humanized Output ({averageAiScoreAfter}% AI Score · Natural Human Tone)
                      </div>
                      {currentDoc.sections.map((sec, idx) => (
                        <div key={sec.id} className="space-y-1.5">
                          <h4 className="text-xs font-bold text-slate-900">
                            {idx + 1}. {sec.heading}
                          </h4>
                          <p className="text-xs text-slate-800 leading-relaxed">
                            {sec.paragraphs.join('\n\n')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="border-b border-slate-200 pb-4">
                      <div className="text-xs text-slate-500">
                        {selectedTemplate.companyName} · {selectedTemplate.pageSize}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">{currentDoc.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{currentDoc.subtitle}</p>
                    </div>

                    {currentDoc.sections.map((sec, idx) => (
                      <div key={sec.id} className="space-y-2">
                        <h4 className="text-sm font-bold text-slate-900">
                          {idx + 1}. {sec.heading}
                        </h4>
                        {sec.paragraphs.map((p, pIdx) => (
                          <p key={pIdx} className="text-sm text-slate-700 leading-relaxed">
                            {p}
                          </p>
                        ))}
                        {sec.bullets && sec.bullets.length > 0 && (
                          <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                            {sec.bullets.map((b, bIdx) => (
                              <li key={bIdx}>{b}</li>
                            ))}
                          </ul>
                        )}
                        {sec.table && sec.table.rows.length > 0 && (
                          <div className="overflow-x-auto pt-2">
                            <table className="w-full text-xs border border-slate-200">
                              <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                  <th className="p-2 text-left border-b border-slate-200">
                                    {sec.table.headers[0]}
                                  </th>
                                  <th className="p-2 text-left border-b border-slate-200">
                                    {sec.table.headers[1]}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {sec.table.rows.map((r, rIdx) => (
                                  <tr key={rIdx} className="border-b border-slate-100">
                                    <td className="p-2 font-medium text-slate-800">{r[0]}</td>
                                    <td className="p-2 text-slate-600">{r[1]}</td>
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
                <div className="pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Structure preserved ({currentDoc.sections.length} numbered sections, bullet lists &amp; tables ·{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      {averageAiScoreAfter}% AI Score
                    </span>
                    )
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isExportingPdf}
                      onClick={() => handleExportPdf(true)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isExportingPdf
                          ? 'Exporting PDF...'
                          : 'Export Clean Humanized PDF (Preserve Structure)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isExportingPdf}
                      onClick={() => handleExportPdf(false)}
                      className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Template PDF</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExportingDocx}
                      onClick={handleExportDocx}
                      className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Word (.docx)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: Clean Section-by-Section Prompt Refiner */}
            {rightView === 'sections' && (
              <div className="p-5 space-y-4 max-h-[700px] overflow-y-auto">
                {currentDoc.sections.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-bold text-slate-900">
                        {idx + 1}. {sec.heading}
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
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAcceptOrRejectSection(sec.id, 'accepted')}
                          className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-xs text-emerald-700 border border-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptOrRejectSection(sec.id, 'rejected')}
                          className="px-2 py-1 rounded bg-white hover:bg-rose-50 text-xs text-rose-700 border border-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                      {sec.paragraphs.join('\n\n')}
                    </p>

                    {/* Prompt input for this section (Zero manual text editing) */}
                    <div className="flex items-center gap-2">
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
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
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
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        Update via Prompt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VIEW 3: Clean Version History */}
            {rightView === 'versions' && (
              <div className="p-5 space-y-2.5 max-h-[700px] overflow-y-auto">
                {versionHistory.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        v{ver.versionNumber} — {ver.label}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
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
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 flex items-center gap-1 cursor-pointer"
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
