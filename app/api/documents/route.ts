import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  buildStructuredDocumentFromInputs,
  generateChatGptStyleResponse,
  DOCUMENT_TYPE_CATALOG,
  AgentRewriteTone,
  AudienceLevel,
  runControlledHumanizePipeline,
  CanonicalDocumentModel,
  ClaudeThinkingDepthMode,
  synthesizeSectionProseAndMicroThinking,
} from '@/lib/document-agent-engine';

/**
 * Section 4, 9, 10, 12 & 13 — Backend API Flow (`POST /api/documents`):
 * Supports both:
 * 1. ChatGPT / Claude Extended Thinking Conversational Content & Document Generation (`mode: 'chatgpt'`)
 * 2. Smart Form + Outline Wizard Generation (`mode: 'wizard'`)
 * Uses `gemini-3.8-flash` on the server with automatic deterministic Controlled Humanizer fallback.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode = 'wizard',
      prompt: chatPrompt = '',
      inputContext = '',
      documentTypeId = 'business_proposal',
      inputs = {},
      customPrompt = '',
      tone = 'Professional',
      audience = 'Executive / C-Suite',
      lengthTarget = 'Medium (2–3 Pages)',
      customOutline,
      useGeminiRefinement = true,
      depthMode = 'extended_deep',
    } = body as {
      mode?: 'wizard' | 'chatgpt';
      prompt?: string;
      inputContext?: string;
      documentTypeId?: string;
      inputs?: Record<string, string>;
      customPrompt?: string;
      tone?: AgentRewriteTone;
      audience?: AudienceLevel;
      lengthTarget?: string;
      customOutline?: string[];
      useGeminiRefinement?: boolean;
      depthMode?: ClaudeThinkingDepthMode;
    };

    const apiKey = process.env.GEMINI_API_KEY;

    // MODE 1: ChatGPT / Claude Extended Thinking Conversational AI Content Generator + Humanizer
    if (mode === 'chatgpt') {
      const baseChatReply = generateChatGptStyleResponse({
        prompt: chatPrompt,
        inputContext,
        tone,
        audience,
        lengthTarget,
        depthMode,
      });

      let engineUsed = 'controlled-humanizer-pipeline';
      let inputTokens = Math.max(180, Math.round((chatPrompt.length + inputContext.length) / 4));
      let outputTokens = 760;

      if (
        useGeminiRefinement &&
        apiKey &&
        apiKey !== 'MY_GEMINI_API_KEY' &&
        apiKey.trim().length > 10
      ) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const systemInstruction = `You are a Claude Extended Thinking + ChatGPT-style AI Document & Content Architect with a built-in Controlled Humanizer (<10% AI detector score).
Follow the user's prompt in English, Urdu, or Roman Urdu and transform any provided input content accurately using deep first-principles reasoning (${depthMode}).
STRICT RULES:
1. Never invent fake statistics or alter numbers/dates/names from the user's input.
2. Make every section genuinely distinct with non-repetitive, first-principles prose.
3. Write in a natural, grounded human voice (${tone} tone for ${audience}) with varied sentence lengths, contractions where natural, and zero robotic clichés ("delve", "testament", "tapestry", "furthermore", "moreover", "underscore").
4. Return valid JSON matching the requested schema.`;

          const userMessage = `User Prompt: ${chatPrompt}
${inputContext ? `\nInput Content / Source Text to Process:\n${inputContext}` : ''}
Target Tone: ${tone}
Target Audience: ${audience}
Target Length: ${lengthTarget}
Claude Thinking Depth Mode: ${depthMode}

Return JSON:
{
  "title": "Document or Content Title",
  "assistantIntro": "1-2 sentence helpful conversational intro (in the same language style as the user)",
  "sections": [
    {
      "heading": "Section Heading",
      "paragraphs": ["Paragraph 1...", "Paragraph 2..."],
      "bullets": ["Key point 1", "Key point 2"]
    }
  ],
  "followUpPrompts": ["Follow-up suggestion 1", "Follow-up suggestion 2", "Follow-up suggestion 3"]
}`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: userMessage,
            config: {
              systemInstruction,
              temperature: 0.7,
              responseMimeType: 'application/json',
            },
          });

          const rawJson = response.text?.trim();
          if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && baseChatReply.canonicalDocument) {
              engineUsed = 'gemini-3.8-flash + controlled-humanizer-lock';
              inputTokens = Math.round(userMessage.length / 4);
              outputTokens = Math.round(rawJson.length / 4);

              const docType =
                DOCUMENT_TYPE_CATALOG.find(
                  (d) => d.id === baseChatReply.canonicalDocument!.documentTypeId
                ) || DOCUMENT_TYPE_CATALOG[3];

              const updatedSections = parsed.sections.map(
                (
                  sec: { heading?: string; paragraphs?: string[]; bullets?: string[] },
                  idx: number
                ) => {
                  const rawParas =
                    Array.isArray(sec.paragraphs) && sec.paragraphs.length > 0
                      ? sec.paragraphs
                      : baseChatReply.canonicalDocument!.sections[idx]?.originalParagraphs || [];
                  const pipeline = runControlledHumanizePipeline(rawParas, tone, audience);
                  const existingMicro =
                    baseChatReply.canonicalDocument!.sections[idx]?.microThinking ||
                    synthesizeSectionProseAndMicroThinking({
                      heading: sec.heading || `Section ${idx + 1}`,
                      sectionIndex: idx,
                      totalSections: parsed.sections.length,
                      docType,
                      topicOrPrompt: chatPrompt || docType.name,
                      primaryFactLabel: docType.fields[0]?.label || 'Primary Specification',
                      primaryFactValue:
                        baseChatReply.detectedMissingDetails?.[0]?.aiAutoFilledValue ||
                        docType.name,
                      tone,
                      audience,
                      depthMode,
                    }).microThinking;

                  return {
                    id: `chat-sec-${idx + 1}`,
                    heading: sec.heading || `Section ${idx + 1}`,
                    originalParagraphs: rawParas,
                    paragraphs: pipeline.humanizedParagraphs,
                    bullets: Array.isArray(sec.bullets) ? sec.bullets : [],
                    humanizeStatus: 'humanized' as const,
                    pipelineStage: 'Final Humanized Text' as const,
                    lockedFacts: pipeline.lockedFacts,
                    metrics: {
                      aiScoreBefore: pipeline.aiScoreBefore,
                      aiScoreAfter: pipeline.aiScoreAfter,
                      burstinessAfter: pipeline.burstinessAfter,
                      meaningPreserved: pipeline.meaningPreserved,
                    },
                    microThinking: existingMicro,
                  };
                }
              );

              baseChatReply.canonicalDocument.title =
                parsed.title || baseChatReply.canonicalDocument.title;
              baseChatReply.canonicalDocument.sections = updatedSections;
              baseChatReply.assistantIntro = parsed.assistantIntro || baseChatReply.assistantIntro;
              baseChatReply.rawAiContent = updatedSections
                .map((s: { heading: string; originalParagraphs: string[] }) => `### ${s.heading}\n${s.originalParagraphs.join('\n\n')}`)
                .join('\n\n');
              baseChatReply.humanizedContent = updatedSections
                .map((s: { heading: string; paragraphs: string[]; bullets: string[] }) => {
                  const bulletsStr =
                    s.bullets.length > 0 ? `\n${s.bullets.map((b) => `• ${b}`).join('\n')}` : '';
                  return `### ${s.heading}\n${s.paragraphs.join('\n\n')}${bulletsStr}`;
                })
                .join('\n\n');
              if (Array.isArray(parsed.followUpPrompts) && parsed.followUpPrompts.length > 0) {
                baseChatReply.followUpPrompts = parsed.followUpPrompts;
              }
            }
          }
        } catch {
          engineUsed = 'controlled-humanizer-fallback';
        }
      }

      return NextResponse.json({
        chatReply: baseChatReply,
        document: baseChatReply.canonicalDocument,
        usage: {
          operation: 'Draft Generation',
          engine: engineUsed,
          inputTokens,
          outputTokens,
          estimatedCostUsd: Number(
            ((inputTokens * 0.00015 + outputTokens * 0.0006) / 1000).toFixed(5)
          ),
          timestamp: new Date().toISOString(),
        },
      });
    }

    // MODE 2: Structured Wizard + Smart Form Generation
    const docType =
      DOCUMENT_TYPE_CATALOG.find((d) => d.id === documentTypeId) || DOCUMENT_TYPE_CATALOG[3];

    const approvedOutline =
      Array.isArray(customOutline) && customOutline.length > 0
        ? customOutline
        : docType.defaultOutline;

    const baseCanonicalDoc: CanonicalDocumentModel = buildStructuredDocumentFromInputs({
      docType,
      formValues: inputs,
      customPrompt,
      approvedOutline,
      tone,
      audience,
      lengthTarget,
      depthMode,
    });

    let engineUsed = 'controlled-humanizer-pipeline';
    let inputTokens = 420;
    let outputTokens = 890;

    if (
      useGeminiRefinement &&
      apiKey &&
      apiKey !== 'MY_GEMINI_API_KEY' &&
      apiKey.trim().length > 10
    ) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const filledContext = Object.entries(inputs)
          .filter(([, v]) => v && v.trim().length > 0)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n');

        const outlineHeadings = baseCanonicalDoc.sections.map((s) => s.heading);

        const systemInstruction = `You are a professional document architect and human editor.
Create structured, accurate, practical documents based strictly on user data.
STRICT RULES (Section 10 & 11):
1. Never invent fake experience, fake companies, fake client names, fake certificates, or fake numbers.
2. Preserve every exact number, date, percentage, currency amount, and proper noun from the user inputs.
3. Write in a natural, grounded human voice (${tone} tone for ${audience}) that scores under 10% on AI detectors (high burstiness, varied sentence lengths, contractions where natural, zero robotic clichés like "delve", "testament", "tapestry", "furthermore", "moreover", "underscore").
4. Return valid JSON matching the requested schema.`;

        const prompt = `Document Type: ${docType.name} (${docType.category})
Target Audience: ${audience}
Tone: ${tone}
Length Target: ${lengthTarget}
Required Section Headings: ${JSON.stringify(outlineHeadings)}

Verified User Inputs:
${filledContext || 'No specific custom fields entered; use conservative professional placeholders clearly marked for user confirmation.'}
${customPrompt ? `\nAdditional User Instructions: ${customPrompt}` : ''}

Return a JSON object with:
{
  "title": "Document Title",
  "sections": [
    {
      "heading": "Section Heading",
      "paragraphs": ["Paragraph 1...", "Paragraph 2..."],
      "bullets": ["Actionable bullet 1", "Actionable bullet 2"]
    }
  ],
  "warnings": ["Optional warning if any detail should be verified"]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
            responseMimeType: 'application/json',
          },
        });

        const rawJson = response.text?.trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            engineUsed = 'gemini-3.8-flash + controlled-humanizer-lock';
            inputTokens = Math.round(prompt.length / 4);
            outputTokens = Math.round(rawJson.length / 4);

            baseCanonicalDoc.title = parsed.title || baseCanonicalDoc.title;
            baseCanonicalDoc.sections = parsed.sections.map(
              (
                sec: { heading?: string; paragraphs?: string[]; bullets?: string[] },
                idx: number
              ) => {
                const rawParas =
                  Array.isArray(sec.paragraphs) && sec.paragraphs.length > 0
                    ? sec.paragraphs
                    : baseCanonicalDoc.sections[idx]?.originalParagraphs || [];
                const pipeline = runControlledHumanizePipeline(rawParas, tone, audience);

                return {
                  id: `sec-${idx + 1}`,
                  heading: sec.heading || outlineHeadings[idx] || `Section ${idx + 1}`,
                  originalParagraphs: rawParas,
                  paragraphs: pipeline.humanizedParagraphs,
                  bullets:
                    Array.isArray(sec.bullets) && sec.bullets.length > 0
                      ? sec.bullets
                      : baseCanonicalDoc.sections[idx]?.bullets || [],
                  table: baseCanonicalDoc.sections[idx]?.table,
                  humanizeStatus: 'humanized' as const,
                  pipelineStage: 'Final Humanized Text' as const,
                  lockedFacts: pipeline.lockedFacts,
                  metrics: {
                    aiScoreBefore: pipeline.aiScoreBefore,
                    aiScoreAfter: pipeline.aiScoreAfter,
                    burstinessAfter: pipeline.burstinessAfter,
                    meaningPreserved: pipeline.meaningPreserved,
                  },
                  microThinking: baseCanonicalDoc.sections[idx]?.microThinking,
                };
              }
            );
          }
        }
      } catch {
        engineUsed = 'controlled-humanizer-fallback';
      }
    }

    return NextResponse.json({
      document: baseCanonicalDoc,
      usage: {
        operation: 'Draft Generation',
        engine: engineUsed,
        inputTokens,
        outputTokens,
        estimatedCostUsd: Number(
          ((inputTokens * 0.00015 + outputTokens * 0.0006) / 1000).toFixed(5)
        ),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
