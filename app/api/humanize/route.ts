import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import {
  humanizeTextLocally,
  calculateAiRoboticMetrics,
  type HumanTone,
} from '@/lib/humanizer-engine';

interface IncomingBlock {
  id: string;
  originalText: string;
  isHeading?: boolean;
}

const TONE_INSTRUCTIONS: Record<HumanTone, string> = {
  warm_conversational:
    'Write in a warm, natural, human voice—like an experienced writer explaining ideas clearly to a colleague. Vary sentence lengths (mix short punchy sentences with medium flowing ones). Eliminate all AI clichés ("furthermore", "moreover", "delve into", "tapestry", "testament to", "underscores", "pivotal", "utilize") and replace stiff verbs ("demonstrates", "generates", "processes", "requires") with natural everyday human language.',
  natural_academic:
    'Write in a natural, authentic human scholar voice. Keep the rigor and technical accuracy, but remove stiff LLM transition words ("furthermore", "moreover", "it is important to note", "delve into"). Use active voice and natural academic transitions.',
  executive_editorial:
    'Write like a sharp magazine editor or senior executive. Crisp, direct, active voice, zero fluff, zero robotic phrasing.',
  simple_direct:
    'Write in plain, everyday human English. Replace bloated vocabulary ("utilize", "facilitate", "multifaceted", "paradigm shift", "demonstrates", "subsequently") with simple, direct words while keeping every fact intact.',
  storyteller:
    'Write with engaging human rhythm, natural flow, and vivid clarity while keeping the exact meaning and facts.',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const blocks: IncomingBlock[] = Array.isArray(body?.blocks) ? body.blocks : [];
    const tone: HumanTone = body?.tone || 'warm_conversational';

    if (blocks.length === 0) {
      return NextResponse.json({ results: [], source: 'empty' });
    }

    const buildFallbackResults = () =>
      blocks.map((b) => {
        const humanizedText = humanizeTextLocally(b.originalText, tone, Boolean(b.isHeading));
        const afterMetrics = calculateAiRoboticMetrics(humanizedText);
        return {
          id: b.id,
          humanizedText,
          roboticScoreAfter: afterMetrics.roboticScore,
          burstinessAfter: afterMetrics.burstiness,
        };
      });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return NextResponse.json({
        results: buildFallbackResults(),
        source: 'universal-humanizer-engine',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `You are an expert Human Editor and PDF Layout-Preserving Text Humanizer.
Your job is to rewrite EVERY text block from a PDF page into 100% natural, authentic human writing while strictly preserving:
1. The exact meaning, facts, numbers, figure references (e.g., "Figure 1", "Table 2"), and language of the input.
2. Approximately the SAME character/word length (+/- 10%) as the original block so that when pasted back into the exact PDF bounding box, it fits cleanly without overlapping any pictures or diagrams on the page.
3. NEVER return the exact same text unchanged—always rephrase stiff, formal, or AI-sounding sentences and headings into natural human prose.
4. Tone guideline: ${TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.warm_conversational}`;

    const promptPayload = blocks.map((b) => ({
      id: b.id,
      isHeading: Boolean(b.isHeading),
      targetLengthChars: b.originalText.length,
      originalText: b.originalText,
    }));

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];
    let parsed: Array<{ id: string; humanizedText: string }> | null = null;
    let usedModel = 'gemini-3.8-flash';

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: `Rewrite and humanize every one of the following PDF page text blocks into a natural human tone while keeping their approximate character length so the page layout and image positions remain unchanged:\n${JSON.stringify(
            promptPayload,
            null,
            2
          )}`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: {
                    type: Type.STRING,
                    description: 'The exact id of the text block.',
                  },
                  humanizedText: {
                    type: Type.STRING,
                    description:
                      'The humanized text written in a natural human tone, matching the approximate length of the original text.',
                  },
                },
                required: ['id', 'humanizedText'],
              },
            },
          },
        });

        parsed = JSON.parse((response.text ?? '[]').trim());
        usedModel = modelName;
        if (Array.isArray(parsed) && parsed.length > 0) {
          break;
        }
      } catch (modelErr) {
        console.warn(`Model ${modelName} failed in /api/humanize, trying next fallback:`, modelErr);
      }
    }

    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({
        results: buildFallbackResults(),
        source: 'universal-humanizer-fallback',
      });
    }

    const mapById = new Map(parsed.map((item) => [item.id, item.humanizedText]));

    const results = blocks.map((b) => {
      const rawHumanized = mapById.get(b.id)?.trim();
      const isUnchanged =
        !rawHumanized ||
        rawHumanized.toLowerCase() === b.originalText.trim().toLowerCase();

      let humanizedText = isUnchanged
        ? humanizeTextLocally(b.originalText, tone, Boolean(b.isHeading))
        : rawHumanized;

      let afterMetrics = calculateAiRoboticMetrics(humanizedText);
      // Guarantee <10% AI detector score by polishing any residual AI triggers or uniform cadence
      if (afterMetrics.roboticScore >= 10 || afterMetrics.aiTriggerWordsFound.length > 0) {
        humanizedText = humanizeTextLocally(humanizedText, tone, Boolean(b.isHeading));
        afterMetrics = calculateAiRoboticMetrics(humanizedText);
      }

      return {
        id: b.id,
        humanizedText,
        roboticScoreAfter: afterMetrics.roboticScore,
        burstinessAfter: afterMetrics.burstiness,
      };
    });

    return NextResponse.json({ results, source: usedModel });
  } catch (error) {
    console.error('Error in /api/humanize:', error);
    return NextResponse.json(
      { error: 'Failed to process text blocks for humanization.' },
      { status: 500 }
    );
  }
}
