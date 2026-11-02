'use client';

import React, { useEffect, useState } from 'react';
import { Lock, CheckCircle2, Sparkles, Eye } from 'lucide-react';
import {
  type PdfPageModel,
  type TextBlock,
} from '@/lib/humanizer-engine';
import { renderPageCanvasDataUrl } from '@/lib/pdf-processor';

interface PageReplicaCanvasProps {
  page: PdfPageModel;
  viewMode: 'side_by_side' | 'humanized_only' | 'original_only' | 'structured_flow';
  textAlignment: 'match_input' | 'justify' | 'left';
  showLayoutGuides: boolean;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onHumanizeSingleBlock: (blockId: string) => void;
}

export default function PageReplicaCanvas({
  page,
  viewMode,
  textAlignment,
  showLayoutGuides,
  selectedBlockId,
  onSelectBlock,
  onHumanizeSingleBlock,
}: PageReplicaCanvasProps) {
  const [humanizedDataUrl, setHumanizedDataUrl] = useState<string>('');
  const [isRendering, setIsRendering] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const runRender = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setIsRendering(true);

      const url = await renderPageCanvasDataUrl(
        page.widthPt,
        page.heightPt,
        page.textBlocks,
        'humanized',
        page.originalPageDataUrl,
        undefined,
        selectedBlockId,
        page.imageRegions,
        textAlignment
      );

      if (!cancelled) {
        setHumanizedDataUrl(url);
        setIsRendering(false);
      }
    };

    void runRender();

    return () => {
      cancelled = true;
    };
  }, [
    page.widthPt,
    page.heightPt,
    page.textBlocks,
    page.originalPageDataUrl,
    page.imageRegions,
    selectedBlockId,
    textAlignment,
  ]);

  const renderInteractiveOverlay = (isHumanizedPane: boolean) => {
    if (!showLayoutGuides) return null;

    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Locked Image Regions — Exact-Coordinate Copy-Paste Lock Overlay */}
        {page.imageRegions.map((img) => (
          <div
            key={img.id}
            style={{
              left: `${img.bbox.x * 100}%`,
              top: `${img.bbox.y * 100}%`,
              width: `${img.bbox.width * 100}%`,
              height: `${img.bbox.height * 100}%`,
            }}
            className="absolute border border-dashed border-amber-600/80 bg-amber-500/5 rounded-xs flex items-start justify-end p-1"
          >
            <span className="bg-slate-900/90 text-white text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs">
              <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span>
                {isHumanizedPane ? 'Pic Copy-Pasted' : 'Source Pic'} ({Math.round(img.bbox.x * page.widthPt)}pt, {Math.round(img.bbox.y * page.heightPt)}pt)
              </span>
            </span>
          </div>
        ))}

        {/* Interactive Text Block Regions */}
        {page.textBlocks.map((block: TextBlock, idx: number) => {
          const isSelected = selectedBlockId === block.id;
          const isDone = block.status === 'done' || block.status === 'edited';

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onSelectBlock(block.id)}
              aria-label={`Inspect Page ${page.pageNumber} Text Block ${idx + 1}`}
              style={{
                left: `${block.bbox.x * 100}%`,
                top: `${block.bbox.y * 100}%`,
                width: `${block.bbox.width * 100}%`,
                height: `${block.bbox.height * 100}%`,
              }}
              className={`pointer-events-auto absolute text-left rounded-xs transition-opacity focus-visible:outline-2 focus-visible:outline-blue-600 group ${
                isSelected
                  ? 'border-2 border-blue-600 bg-blue-600/10'
                  : isHumanizedPane && isDone
                  ? 'border border-emerald-600/60 hover:border-emerald-600 hover:bg-emerald-500/5'
                  : 'border border-slate-400/50 hover:border-blue-600 hover:bg-blue-500/5'
              }`}
            >
              <span
                className={`opacity-0 group-hover:opacity-100 ${
                  isSelected ? 'opacity-100' : ''
                } transition-opacity absolute -top-5 left-0 bg-slate-900 text-white text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1 shadow-xs`}
              >
                {isHumanizedPane && isDone ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                ) : (
                  <Eye className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                )}
                <span>
                  Block {idx + 1} · {isHumanizedPane ? (isDone ? 'Aligned & Humanized' : 'Aligned') : 'Source'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  // Build ordered page items (interleaving text blocks and copy-pasted pictures by top-to-bottom Y position)
  const orderedPageItems = [
    ...page.textBlocks.map((b) => ({
      type: 'text' as const,
      y: b.pdfBbox.y,
      x: b.pdfBbox.x,
      block: b,
    })),
    ...page.imageRegions.map((img) => ({
      type: 'image' as const,
      y: img.pdfBbox ? img.pdfBbox.y : img.bbox.y * page.heightPt,
      x: img.pdfBbox ? img.pdfBbox.x : img.bbox.x * page.widthPt,
      image: img,
    })),
  ].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 18) return a.y - b.y;
    return a.x - b.x;
  });

  if (viewMode === 'structured_flow') {
    return (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-xs text-slate-900 font-semibold">
            <span>Structured Page {page.pageNumber} Output — Copy-Pasted Pictures &amp; Unified Aligned Text</span>
          </div>
          <div className="text-xs text-emerald-700 font-mono tabular-nums">
            {page.imageRegions.length} Picture(s) Copy-Pasted · Strict Line Alignment
          </div>
        </div>

        <div className="p-6 sm:p-10 bg-slate-100/70">
          <div className="bg-white border border-slate-200 shadow-xs rounded-sm p-8 sm:p-12 max-w-[720px] mx-auto space-y-5">
            {orderedPageItems.map((item) => {
              if (item.type === 'image') {
                return (
                  <figure
                    key={item.image.id}
                    className="my-4 p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-col items-center"
                  >
                    {item.image.croppedDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image.croppedDataUrl}
                        alt={item.image.label}
                        referrerPolicy="no-referrer"
                        className="max-h-72 w-auto object-contain rounded-xs border border-slate-200 bg-white"
                      />
                    ) : null}
                    <figcaption className="mt-2 text-[11px] font-mono tabular-nums text-slate-500 flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>{item.image.label} — Copy-Pasted from Input PDF Page {page.pageNumber}</span>
                    </figcaption>
                  </figure>
                );
              }

              const b = item.block;
              return (
                <div
                  key={b.id}
                  onClick={() => onSelectBlock(b.id)}
                  className={`cursor-pointer rounded-xs transition-colors ${
                    selectedBlockId === b.id ? 'bg-blue-50/60 ring-1 ring-blue-500 px-2 py-1 -mx-2' : ''
                  }`}
                >
                  {b.isHeading ? (
                    <h3 className="text-lg font-bold text-slate-900 leading-snug tracking-tight break-words">
                      {b.humanizedText}
                    </h3>
                  ) : (
                    <p
                      className={`text-sm text-slate-800 leading-relaxed break-words ${
                        textAlignment === 'justify' ? 'text-justify' : 'text-left'
                      }`}
                    >
                      {b.humanizedText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className={`grid gap-6 ${
          viewMode === 'side_by_side' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 max-w-3xl mx-auto'
        }`}
      >
        {/* Left Pane: Original PDF Page */}
        {(viewMode === 'side_by_side' || viewMode === 'original_only') && (
          <div className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 text-xs text-slate-800 font-semibold whitespace-nowrap truncate">
                <span>Original PDF — Page {page.pageNumber}</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono tabular-nums font-normal text-slate-500">
                  {Math.round(page.widthPt)}×{Math.round(page.heightPt)}pt
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                {page.imageRegions.length} Pic{page.imageRegions.length === 1 ? '' : 's'} · {page.textBlocks.length} Blocks
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-100/70 flex items-center justify-center">
              <div
                className="relative w-full bg-white shadow-sm border border-slate-200/90 select-none overflow-hidden"
                style={{ aspectRatio: `${page.widthPt} / ${page.heightPt}` }}
                data-testid={`original-page-canvas-${page.pageNumber}`}
              >
                {page.originalPageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.originalPageDataUrl}
                    alt={`Original PDF Page ${page.pageNumber}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain block"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    Rendering original page...
                  </div>
                )}
                {renderInteractiveOverlay(false)}
              </div>
            </div>
          </div>
        )}

        {/* Right Pane: Humanized PDF Output (Copy-Pasted Pictures & Aligned Text) */}
        {(viewMode === 'side_by_side' || viewMode === 'humanized_only') && (
          <div className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 text-xs text-slate-900 font-semibold whitespace-nowrap truncate">
                <span>Humanized Output — Page {page.pageNumber}</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="text-emerald-700 font-normal">
                  Pics Copy-Pasted &amp; Text Aligned
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap shrink-0">
                {isRendering ? (
                  <span>Updating...</span>
                ) : (
                  <span>
                    {page.textBlocks.filter((b) => b.status === 'done' || b.status === 'edited').length}/
                    {page.textBlocks.length} Humanized
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-100/70 flex items-center justify-center">
              <div
                className="relative w-full bg-white shadow-sm border border-slate-200/90 select-none overflow-hidden"
                style={{ aspectRatio: `${page.widthPt} / ${page.heightPt}` }}
                data-testid={`humanized-page-canvas-${page.pageNumber}`}
              >
                {humanizedDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={humanizedDataUrl}
                    alt={`Humanized PDF Page ${page.pageNumber} with copy-pasted images and aligned text`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain block"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    Composing humanized replica...
                  </div>
                )}
                {renderInteractiveOverlay(true)}
              </div>
            </div>

            {/* Quick action footer for selected block */}
            {selectedBlockId && (
              <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                <div className="text-xs text-slate-600 truncate">
                  Selected block <span className="font-mono font-medium text-slate-900">{selectedBlockId}</span> — aligned inside page margins.
                </div>
                <button
                  type="button"
                  onClick={() => onHumanizeSingleBlock(selectedBlockId)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Re-Humanize Selected Block</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
