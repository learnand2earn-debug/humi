'use client';

import React from 'react';
import { Lock, Sparkles, RotateCcw, Check } from 'lucide-react';
import {
  type PdfPageModel,
  type TextBlock,
  calculateAiRoboticMetrics,
} from '@/lib/humanizer-engine';

interface BlockInspectorPanelProps {
  page: PdfPageModel;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onUpdateBlockText: (pageNumber: number, blockId: string, newText: string) => void;
  onHumanizeSingleBlock: (blockId: string) => void;
  onResetBlock: (pageNumber: number, blockId: string) => void;
}

export default function BlockInspectorPanel({
  page,
  selectedBlockId,
  onSelectBlock,
  onUpdateBlockText,
  onHumanizeSingleBlock,
  onResetBlock,
}: BlockInspectorPanelProps) {
  return (
    <div className="space-y-6">
      {/* Section 1: Copy-Pasted Pictures & Visual Assets Inventory with Live Image Previews */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Copy-Pasted Pictures &amp; Diagrams on Page {page.pageNumber}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Every picture detected in the input PDF is automatically cropped and copy-pasted onto the output PDF at its exact coordinates.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-amber-700 flex items-center gap-1.5 shrink-0">
            <Lock className="w-3.5 h-3.5" />
            <span>{page.imageRegions.length} Picture{page.imageRegions.length === 1 ? '' : 's'} Copy-Pasted</span>
          </div>
        </div>

        {page.imageRegions.length === 0 ? (
          <div className="mt-3 text-xs text-slate-500">
            No separate picture blocks detected on this page — full page background graphics remain preserved.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {page.imageRegions.map((img) => (
              <div
                key={img.id}
                className="flex items-center gap-3.5 p-3 rounded-md bg-slate-50 border border-slate-200/80"
              >
                {img.croppedDataUrl ? (
                  <div className="w-24 h-16 bg-white border border-slate-200 rounded-xs overflow-hidden shrink-0 flex items-center justify-center p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.croppedDataUrl}
                      alt={img.label}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {img.label}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Copy-Pasted</span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{img.description}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                    X: {Math.round(img.bbox.x * page.widthPt)}pt · Y: {Math.round(img.bbox.y * page.heightPt)}pt · W: {Math.round(img.bbox.width * page.widthPt)}pt · H: {Math.round(img.bbox.height * page.heightPt)}pt
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Page-by-Page In-Place Text Blocks Editor */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Page {page.pageNumber} Aligned Text Blocks — In-Place Humanization
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              All text blocks are ordered top-to-bottom, aligned to uniform margins, and wrapped strictly inside the line boundaries.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {page.textBlocks.length} Aligned Blocks
          </div>
        </div>

        {page.textBlocks.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            This page contains only visual graphics or scanned images. Every picture is copy-pasted intact onto the output PDF.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {page.textBlocks.map((block: TextBlock, index: number) => {
              const isSelected = selectedBlockId === block.id;
              const liveMetrics = calculateAiRoboticMetrics(block.humanizedText);
              const humanScoreAfter = 100 - liveMetrics.roboticScore;
              const humanScoreBefore = 100 - block.metrics.roboticScoreBefore;

              return (
                <div
                  key={block.id}
                  onClick={() => onSelectBlock(block.id)}
                  className={`py-4 transition-colors ${
                    isSelected ? 'bg-blue-50/40 -mx-3 px-3 rounded-md' : ''
                  }`}
                >
                  {/* Block metadata header (Zero-pill discipline: unboxed text with separators) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">
                        Block {index + 1} ({block.isHeading ? 'Heading' : 'Paragraph'})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        Aligned X: {Math.round(block.pdfBbox.x)}pt · Width: {Math.round(block.pdfBbox.width)}pt
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        AI Score (GPTZero/ZeroGPT):{' '}
                        <strong className="text-slate-900">{block.metrics.roboticScoreBefore}% AI</strong> →{' '}
                        <strong className="text-emerald-700">{liveMetrics.roboticScore}% AI</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Human Tone: <strong className="text-slate-900">{humanScoreBefore}%</strong> →{' '}
                        <strong className="text-emerald-700">{humanScoreAfter}%</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onHumanizeSingleBlock(block.id);
                        }}
                        disabled={block.status === 'humanizing'}
                        className="px-3 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3 text-blue-600" />
                        <span>
                          {block.status === 'humanizing'
                            ? 'Humanizing...'
                            : block.status === 'done' || block.status === 'edited'
                            ? 'Re-Humanize Block'
                            : 'Humanize Block'}
                        </span>
                      </button>

                      {block.humanizedText !== block.originalText && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResetBlock(page.pageNumber, block.id);
                          }}
                          aria-label={`Reset Block ${index + 1} to original text`}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Side-by-side Original vs Editable Humanized Text */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500 mb-1">
                        Original PDF Text (Robotic AI Input)
                      </div>
                      <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed select-text">
                        {block.originalText}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 mb-1">
                        <label htmlFor={`editor-${block.id}`}>
                          Humanized &amp; Aligned Output (Stays Strictly Within Line Width)
                        </label>
                        {(block.status === 'done' || block.status === 'edited') && (
                          <span className="text-emerald-700 flex items-center gap-1 font-normal">
                            <Check className="w-3 h-3" />
                            <span>Aligned in PDF</span>
                          </span>
                        )}
                      </div>
                      <textarea
                        id={`editor-${block.id}`}
                        rows={block.isHeading ? 2 : 4}
                        value={block.humanizedText}
                        onChange={(e) =>
                          onUpdateBlockText(page.pageNumber, block.id, e.target.value)
                        }
                        className="w-full p-3 rounded-md bg-white border border-slate-300 focus:border-blue-600 focus:outline-none text-xs text-slate-900 leading-relaxed transition-colors"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
