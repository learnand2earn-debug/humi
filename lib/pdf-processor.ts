import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  groupRawPdfItemsIntoBlocks,
  alignAndConstrainBlocksAroundImages,
  fitTextToBoundingBox,
  calculateAiRoboticMetrics,
  humanizeTextLocally,
  type HumanTone,
  type PdfPageModel,
  type TextBlock,
  type PreservedImageRegion,
  type RawPdfTextItem,
  type PdfPointBBox,
} from './humanizer-engine';

/**
 * Draws a rich architectural / scientific visual figure onto a 2D canvas context
 * so sample PDF pages have authentic embedded pictures, charts, and diagrams in fixed coordinates.
 */
function drawEmbeddedFigureOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: 'solar_grid' | 'load_chart' | 'mri_pipeline' | 'cold_chain' | 'route_variance',
  scale: number
) {
  ctx.save();
  ctx.translate(x * scale, y * scale);
  ctx.scale(scale, scale);

  // Outer frame
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
  ctx.fill();
  ctx.stroke();

  if (variant === 'solar_grid') {
    const grad = ctx.createLinearGradient(8, 8, 8, h - 28);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(8, 8, w - 16, h - 34);

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(w - 42, 34, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const px = 22 + col * 62;
        const py = 46 + row * 34;
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(px, py, 50, 24);
        ctx.strokeRect(px, py, 50, 24);
        ctx.beginPath();
        ctx.moveTo(px + 25, py);
        ctx.lineTo(px + 25, py + 24);
        ctx.moveTo(px, py + 12);
        ctx.lineTo(px + 50, py + 12);
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#334155';
    ctx.font = '600 7.5px sans-serif';
    ctx.fillText('FIG 1.1 — SOLAR MICRO-GRID TOPOLOGY', 12, h - 10);
  } else if (variant === 'load_chart') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(8, 8, w - 16, h - 32);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let gy = 24; gy < h - 36; gy += 20) {
      ctx.beginPath();
      ctx.moveTo(20, gy);
      ctx.lineTo(w - 20, gy);
      ctx.stroke();
    }

    const heights = [38, 54, 46, 72, 65, 84, 58, 76];
    heights.forEach((bh, idx) => {
      const bx = 24 + idx * ((w - 56) / heights.length);
      const by = h - 32 - bh;
      ctx.fillStyle = idx % 2 === 0 ? '#10b981' : '#3b82f6';
      ctx.fillRect(bx, by, 14, bh);
    });

    ctx.fillStyle = '#334155';
    ctx.font = '600 7.5px sans-serif';
    ctx.fillText('FIG 1.2 — 24H HARMONIC LOAD TELEMETRY', 12, h - 10);
  } else if (variant === 'mri_pipeline') {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(8, 8, w - 16, h - 32);

    const stages = [
      { title: 'K-Space Raw', color: '#6366f1' },
      { title: 'Wavelet Filter', color: '#06b6d4' },
      { title: 'Voxel Tensor', color: '#10b981' },
      { title: 'Clinical Output', color: '#f59e0b' },
    ];

    stages.forEach((st, idx) => {
      const sx = 22 + idx * 118;
      const sy = 22;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, 92, h - 64);

      ctx.beginPath();
      ctx.arc(sx + 46, sy + 36, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx + 46, sy + 36, 11, 0, Math.PI * 2);
      ctx.fillStyle = st.color;
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 8px sans-serif';
      ctx.fillText(st.title, sx + 16, sy + h - 74);

      if (idx < stages.length - 1) {
        ctx.strokeStyle = '#64748b';
        ctx.beginPath();
        ctx.moveTo(sx + 96, sy + 36);
        ctx.lineTo(sx + 114, sy + 36);
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#334155';
    ctx.font = '600 7.5px sans-serif';
    ctx.fillText('FIG 2.1 — MULTI-SPECTRAL TENSOR RECONSTRUCTION PIPELINE', 12, h - 10);
  } else if (variant === 'cold_chain') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(8, 8, w - 16, h - 32);

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, h - 55);
    ctx.bezierCurveTo(70, 25, 130, h - 35, w - 24, 38);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    [20, 85, 150, w - 24].forEach((px, i) => {
      const py = i % 2 === 0 ? h - 55 : 38;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#334155';
    ctx.font = '600 7.5px sans-serif';
    ctx.fillText('FIG 3.1 — THERMAL SENSOR TELEMETRY', 12, h - 10);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(8, 8, w - 16, h - 32);

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 22, w - 48, h - 64);
    ctx.beginPath();
    ctx.moveTo(24, 48);
    ctx.lineTo(w - 24, 48);
    ctx.moveTo(w / 2, 22);
    ctx.lineTo(w / 2, h - 42);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(w / 2, 48, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.font = '600 7.5px sans-serif';
    ctx.fillText('FIG 3.2 — CORRIDOR DISTRIBUTION MAP', 12, h - 10);
  }

  ctx.restore();
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Crops a rectangular region (in PDF points) from a rendered 2x page canvas into a standalone PNG Data URL
 * so every picture in the input PDF can be directly copy-pasted onto the output page and shown in the UI.
 */
function cropRegionFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  bboxPt: PdfPointBBox,
  renderScale: number
): string {
  const sx = Math.max(0, Math.round(bboxPt.x * renderScale));
  const sy = Math.max(0, Math.round(bboxPt.y * renderScale));
  const sw = Math.max(16, Math.min(sourceCanvas.width - sx, Math.round(bboxPt.width * renderScale)));
  const sh = Math.max(16, Math.min(sourceCanvas.height - sy, Math.round(bboxPt.height * renderScale)));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return '';

  cropCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropCanvas.toDataURL('image/png');
}

/**
 * Automatically detects all non-text visual regions (embedded pictures, photos, charts, diagrams)
 * on a rendered PDF page canvas by masking out the tight text line strips first and finding
 * connected visual bounding boxes. Each detected picture is cropped from the input canvas so it
 * is guaranteed to be copy-pasted onto the output page!
 */
function detectAndCropVisualRegionsFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  rawTextItems: RawPdfTextItem[],
  pageNumber: number,
  renderScale: number
): PreservedImageRegion[] {
  // Create a scratch canvas where text strips are erased with page background color
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = sourceCanvas.width;
  scratchCanvas.height = sourceCanvas.height;
  const sCtx = scratchCanvas.getContext('2d');
  if (!sCtx) return [];

  sCtx.drawImage(sourceCanvas, 0, 0);

  // Sample background color at top-left margin
  const bgSample = sCtx.getImageData(4, 4, 1, 1).data;
  const bgR = bgSample ? bgSample[0] : 255;
  const bgG = bgSample ? bgSample[1] : 255;
  const bgB = bgSample ? bgSample[2] : 255;

  sCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
  for (const item of rawTextItems) {
    const rx = Math.max(0, (item.x - 3) * renderScale);
    const ry = Math.max(0, (item.yTop - 3) * renderScale);
    const rw = (item.width + 6) * renderScale;
    const rh = (item.height + 6) * renderScale;
    sCtx.fillRect(rx, ry, rw, rh);
  }

  // Scan on an 8pt x 8pt grid to find non-background visual cells
  const cellPt = 8;
  const cols = Math.ceil(pageWidthPt / cellPt);
  const rows = Math.ceil(pageHeightPt / cellPt);
  const imgData = sCtx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height).data;
  const wPx = scratchCanvas.width;
  const hPx = scratchCanvas.height;

  const activeGrid = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startX = Math.floor(c * cellPt * renderScale);
      const startY = Math.floor(r * cellPt * renderScale);
      const endX = Math.min(wPx, Math.floor((c + 1) * cellPt * renderScale));
      const endY = Math.min(hPx, Math.floor((r + 1) * cellPt * renderScale));

      let nonBgPixels = 0;
      const step = 2;
      for (let py = startY; py < endY; py += step) {
        for (let px = startX; px < endX; px += step) {
          const idx = (py * wPx + px) * 4;
          const dr = Math.abs(imgData[idx] - bgR);
          const dg = Math.abs(imgData[idx + 1] - bgG);
          const db = Math.abs(imgData[idx + 2] - bgB);
          if (dr + dg + db > 28) {
            nonBgPixels++;
          }
        }
      }
      if (nonBgPixels >= 5) {
        activeGrid[r * cols + c] = 1;
      }
    }
  }

  // Dilate grid by 1 cell to connect nearby parts of a diagram or photo
  const dilated = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (activeGrid[r * cols + c]) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              dilated[nr * cols + nc] = 1;
            }
          }
        }
      }
    }
  }

  // Connected components BFS
  const visited = new Uint8Array(cols * rows);
  const detectedBoxes: PdfPointBBox[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startIdx = r * cols + c;
      if (!dilated[startIdx] || visited[startIdx]) continue;

      let minC = c;
      let maxC = c;
      let minR = r;
      let maxR = r;
      const queue: number[] = [startIdx];
      visited[startIdx] = 1;

      while (queue.length > 0) {
        const curr = queue.pop()!;
        const cr = Math.floor(curr / cols);
        const cc = curr % cols;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;

        const neighbors = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const nIdx = nr * cols + nc;
            if (dilated[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }
      }

      const boxX = Math.max(0, minC * cellPt);
      const boxY = Math.max(0, minR * cellPt);
      const boxW = Math.min(pageWidthPt - boxX, (maxC - minC + 1) * cellPt);
      const boxH = Math.min(pageHeightPt - boxY, (maxR - minR + 1) * cellPt);

      // Keep substantial visual regions (pictures, photos, figures, logos; ignore tiny 1px page rules)
      if (boxW >= 32 && boxH >= 26 && !(boxW > pageWidthPt * 0.92 && boxH < 18)) {
        detectedBoxes.push({ x: boxX, y: boxY, width: boxW, height: boxH });
      }
    }
  }

  return detectedBoxes.map((box, idx) => {
    // Crop from scratchCanvas so any stray overlapping text on top of the image isn't duplicated,
    // or from sourceCanvas if it's a pure photo region
    const croppedDataUrl = cropRegionFromCanvas(scratchCanvas, box, renderScale);
    return {
      id: `p${pageNumber}-img${idx + 1}`,
      pageNumber,
      label: `Page ${pageNumber} Picture / Figure ${idx + 1}`,
      description: `Copy-pasted from input PDF at (${Math.round(box.x)}pt, ${Math.round(box.y)}pt)`,
      bbox: {
        x: box.x / pageWidthPt,
        y: box.y / pageHeightPt,
        width: box.width / pageWidthPt,
        height: box.height / pageHeightPt,
      },
      pdfBbox: box,
      croppedDataUrl,
      locked: true,
    };
  });
}

/**
 * Draws a single line of text with optional full justification so paragraphs form a clean,
 * aligned block and NEVER exceed maxAllowedWidth ("line sa bahir na jai").
 */
function drawAlignedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  maxAllowedWidth: number,
  alignMode: 'left' | 'center' | 'right' | 'justify'
) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (alignMode === 'center') {
    const measured = Math.min(maxAllowedWidth, ctx.measureText(trimmed).width);
    const centerX = x + Math.max(0, (maxAllowedWidth - measured) / 2);
    ctx.fillText(trimmed, centerX, y, maxAllowedWidth);
    return;
  }

  if (alignMode === 'right') {
    const measured = Math.min(maxAllowedWidth, ctx.measureText(trimmed).width);
    const rightX = x + Math.max(0, maxAllowedWidth - measured);
    ctx.fillText(trimmed, rightX, y, maxAllowedWidth);
    return;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || alignMode === 'left') {
    ctx.fillText(trimmed, x, y, maxAllowedWidth);
    return;
  }

  const totalWordsWidth = words.reduce((acc, w) => acc + ctx.measureText(w).width, 0);
  const availableSpace = maxAllowedWidth - totalWordsWidth;
  const normalSpaceWidth = ctx.measureText(' ').width;

  // Only justify if the line fills at least 72% of the box width so short lines don't stretch awkwardly
  if (
    availableSpace <= 0 ||
    totalWordsWidth < maxAllowedWidth * 0.72 ||
    availableSpace > normalSpaceWidth * words.length * 3.2
  ) {
    ctx.fillText(trimmed, x, y, maxAllowedWidth);
    return;
  }

  const gapWidth = availableSpace / (words.length - 1);
  let cursorX = x;
  for (let i = 0; i < words.length; i++) {
    ctx.fillText(words[i], cursorX, y);
    cursorX += ctx.measureText(words[i]).width + gapWidth;
  }
}

/**
 * Renders a complete page (background + explicitly copy-pasted pictures + aligned text blocks)
 * onto a canvas and returns a PNG data URL.
 */
export async function renderPageCanvasDataUrl(
  pageWidthPt: number,
  pageHeightPt: number,
  textBlocks: TextBlock[],
  mode: 'original' | 'humanized',
  basePageDataUrl?: string,
  figureDrawCallback?: (ctx: CanvasRenderingContext2D, scale: number) => void,
  highlightActiveBlockId?: string | null,
  imageRegions: PreservedImageRegion[] = [],
  textAlignment: 'match_input' | 'justify' | 'left' = 'match_input'
): Promise<string> {
  const scale = 2; // Crisp 2x Retina DPI
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageWidthPt * scale);
  canvas.height = Math.round(pageHeightPt * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Step 1: Draw the base page (or fresh white page)
  if (basePageDataUrl) {
    const baseImg = await loadImageElement(basePageDataUrl);
    if (baseImg) {
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(42, 32);
    ctx.lineTo(pageWidthPt - 42, 32);
    ctx.moveTo(42, pageHeightPt - 34);
    ctx.lineTo(pageWidthPt - 42, pageHeightPt - 34);
    ctx.stroke();
    ctx.restore();

    if (figureDrawCallback) {
      figureDrawCallback(ctx, scale);
    }
  }

  // If rendering the original input view and we already drew basePageDataUrl, only draw highlight if needed
  if (mode === 'original' && basePageDataUrl) {
    if (highlightActiveBlockId) {
      const active = textBlocks.find((b) => b.id === highlightActiveBlockId);
      if (active) {
        ctx.save();
        ctx.scale(scale, scale);
        const { x, y, width, height } = active.pdfBbox;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        ctx.restore();
      }
    }
    return canvas.toDataURL('image/png');
  }

  // Step 2: Mask out the original text lines cleanly
  ctx.save();
  ctx.scale(scale, scale);
  for (const block of textBlocks) {
    ctx.fillStyle = block.bgColor || '#ffffff';
    if (block.sourceLineRects && block.sourceLineRects.length > 0) {
      for (const lr of block.sourceLineRects) {
        ctx.fillRect(lr.x - 2.5, lr.y - 2.5, lr.width + 5, lr.height + 5);
      }
    }
    const { x, y, width, height } = block.pdfBbox;
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
  }
  ctx.restore();

  // Step 3: EXPLICITLY COPY-PASTE every picture/image region from the input PDF onto the output page!
  // This guarantees 100% that no text mask can ever hide or erase any picture from the input PDF.
  for (const imgRegion of imageRegions) {
    if (imgRegion.croppedDataUrl) {
      const pic = await loadImageElement(imgRegion.croppedDataUrl);
      if (pic) {
        const box = imgRegion.pdfBbox || {
          x: imgRegion.bbox.x * pageWidthPt,
          y: imgRegion.bbox.y * pageHeightPt,
          width: imgRegion.bbox.width * pageWidthPt,
          height: imgRegion.bbox.height * pageHeightPt,
        };
        ctx.drawImage(
          pic,
          box.x * scale,
          box.y * scale,
          box.width * scale,
          box.height * scale
        );
      }
    }
  }

  // Step 4: Render each humanized text block in clean vertical order and strict horizontal alignment
  ctx.save();
  ctx.scale(scale, scale);

  // Align blocks around images and page margins so all text shares a clean alignment ("aik tarteeb / aik alignment")
  const alignedBlocks = alignAndConstrainBlocksAroundImages(
    textBlocks,
    imageRegions,
    pageWidthPt,
    pageHeightPt
  );

  for (const block of alignedBlocks) {
    const { x, y, width, height } = block.pdfBbox;
    const textToRender = mode === 'humanized' ? block.humanizedText : block.originalText;
    const maxLineWidth = Math.max(20, width);
    const sourceLines =
      block.sourceLineRects && block.sourceLineRects.length > 0 ? block.sourceLineRects : null;
    const targetLineCount = sourceLines ? sourceLines.length : 0;

    if (highlightActiveBlockId && highlightActiveBlockId === block.id) {
      ctx.fillStyle = mode === 'humanized' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)';
      ctx.strokeStyle = mode === 'humanized' ? '#10b981' : '#3b82f6';
      ctx.lineWidth = 1;
      ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
      ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    }

    const weight = block.isHeading || block.fontWeight === 'bold' ? '700' : '400';
    const fitted = fitTextToBoundingBox(textToRender, maxLineWidth, height, block.fontSize);
    let fontSize = fitted.fittedFontSize;

    // Exact canvas measurement line wrapper with long-word splitting so NO character ever goes outside maxLineWidth
    const wrapExactCanvasLines = (fSize: number): string[] => {
      ctx.font = `${weight} ${fSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
      const rawWords = textToRender.trim().split(/\s+/).filter(Boolean);
      const safeWords: string[] = [];

      for (const word of rawWords) {
        if (ctx.measureText(word).width <= maxLineWidth) {
          safeWords.push(word);
        } else {
          // Split ultra-long word/token so it never exceeds maxLineWidth
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(`${chunk}${ch}-`).width <= maxLineWidth) {
              chunk += ch;
            } else {
              if (chunk) safeWords.push(`${chunk}-`);
              chunk = ch;
            }
          }
          if (chunk) safeWords.push(chunk);
        }
      }

      const wrapped: string[] = [];
      let current = '';
      for (const word of safeWords) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxLineWidth || !current) {
          current = candidate;
        } else {
          wrapped.push(current);
          current = word;
        }
      }
      if (current) wrapped.push(current);
      return wrapped;
    };

    let exactLines = wrapExactCanvasLines(fontSize);
    let lineHeightPt = fontSize * 1.24;
    const minSize = Math.max(6.8, block.fontSize * 0.65);

    while (
      (exactLines.length * lineHeightPt > height * 1.06 ||
        (targetLineCount === 1 && exactLines.length > 1) ||
        (targetLineCount > 1 && exactLines.length > targetLineCount && fontSize > block.fontSize * 0.78)) &&
      fontSize > minSize
    ) {
      fontSize = Math.round((fontSize - 0.4) * 10) / 10;
      lineHeightPt = fontSize * 1.2;
      exactLines = wrapExactCanvasLines(fontSize);
    }

    // If this block was a single line in the input PDF, guarantee it stays a single line at the exact same (x, y)
    if (targetLineCount === 1 && exactLines.length > 1) {
      exactLines = [textToRender.trim()];
    }

    ctx.fillStyle = block.textColor || '#0f172a';
    ctx.font = `${weight} ${fontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'top';

    const inputAlign = block.textAlign || (block.isHeading ? 'left' : 'justify');
    const resolvedBlockAlign: 'left' | 'center' | 'right' | 'justify' =
      textAlignment === 'match_input'
        ? inputAlign
        : inputAlign === 'center' || inputAlign === 'right'
        ? inputAlign
        : textAlignment === 'justify'
        ? block.isHeading
          ? 'left'
          : 'justify'
        : 'left';

    exactLines.forEach((line, lineIdx) => {
      // When the humanized block has <= the original number of lines in sourceLines,
      // place each line at the EXACT vertical y coordinate of that line in the input PDF!
      let lineY = y + lineIdx * lineHeightPt;
      let lineX = x;
      let lineMaxWidth = maxLineWidth;

      if (sourceLines && exactLines.length <= sourceLines.length) {
        lineY = sourceLines[lineIdx].y;
        // Preserve any first-line indent if left-aligned
        if (resolvedBlockAlign === 'left' && Math.abs(sourceLines[lineIdx].x - x) <= 28) {
          lineX = sourceLines[lineIdx].x;
          lineMaxWidth = Math.max(20, x + maxLineWidth - lineX);
        }
      } else if (exactLines.length > 1 && exactLines.length * lineHeightPt > height) {
        const fittedStep = Math.max(fontSize * 1.02, (height - fontSize) / (exactLines.length - 1));
        lineY = y + lineIdx * fittedStep;
      }

      if (lineY + fontSize <= y + height + 14) {
        const isLastLine = lineIdx === exactLines.length - 1;
        const lineAlign: 'left' | 'center' | 'right' | 'justify' =
          resolvedBlockAlign === 'justify' && (isLastLine || exactLines.length === 1)
            ? 'left'
            : resolvedBlockAlign;
        drawAlignedLine(ctx, line, lineX, lineY, lineMaxWidth, lineAlign);
      }
    });
  }

  ctx.restore();
  return canvas.toDataURL('image/png');
}

/**
 * Generates a realistic 3-page sample PDF document model with embedded visual figures/diagrams
 * and robotic AI text blocks so the user can test page-by-page layout-locked humanization immediately.
 */
export async function createSamplePdfDocumentModel(
  initialTone: HumanTone = 'warm_conversational'
): Promise<{
  fileName: string;
  pages: PdfPageModel[];
}> {
  const widthPt = 595; // Standard A4 width in points
  const heightPt = 842; // Standard A4 height in points
  const renderScale = 2;

  const pageConfigs: Array<{
    pageNumber: number;
    blocks: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      isHeading: boolean;
      text: string;
    }>;
    figures: Array<{
      id: string;
      label: string;
      description: string;
      x: number;
      y: number;
      width: number;
      height: number;
      variant: 'solar_grid' | 'load_chart' | 'mri_pipeline' | 'cold_chain' | 'route_variance';
    }>;
  }> = [
    {
      pageNumber: 1,
      blocks: [
        {
          x: 42,
          y: 48,
          width: 511,
          height: 26,
          fontSize: 17,
          isHeading: true,
          text: 'A Comprehensive Overview of Decentralized Solar Micro-Grids',
        },
        {
          x: 42,
          y: 86,
          width: 255,
          height: 155,
          fontSize: 10.5,
          isHeading: false,
          text: 'Furthermore, it is crucial to note that the utilization of urban solar micro-grids delves into a multifaceted tapestry of energy resilience. Moreover, this paradigm shift underscores the importance of leveraging automated inverter telemetry in order to facilitate seamless power distribution across residential neighborhoods.',
        },
        {
          x: 42,
          y: 256,
          width: 511,
          height: 118,
          fontSize: 10.5,
          isHeading: false,
          text: 'It is worth noting that traditional centralized utility grids exhibit a high degree of vulnerability during peak thermal events. Consequently, the intricate interplay between rooftop photovoltaic arrays and local lithium-iron-phosphate storage banks plays a pivotal role in optimizing operational efficiency.',
        },
        {
          x: 295,
          y: 392,
          width: 258,
          height: 165,
          fontSize: 10.5,
          isHeading: false,
          text: 'Additionally, empirical field measurements shown in Figure 1.2 serve as a testament to the transformative potential of adaptive load balancing. By utilizing real-time harmonic sensors, municipal engineers can seamlessly integrate electric vehicle charging stations without overloading neighborhood transformers.',
        },
        {
          x: 42,
          y: 578,
          width: 511,
          height: 110,
          fontSize: 10.5,
          isHeading: false,
          text: 'In summary, delving into localized energy architectures demonstrates significant improvements in grid reliability. Furthermore, it is important to note that community micro-grids reduce transmission losses by approximately eighteen percent across dense metropolitan corridors.',
        },
      ],
      figures: [
        {
          id: 'p1-img1',
          label: 'Figure 1.1: Photovoltaic Array Topology',
          description: 'Copy-pasted from input PDF at (312pt, 86pt)',
          x: 312,
          y: 86,
          width: 241,
          height: 152,
          variant: 'solar_grid',
        },
        {
          id: 'p1-img2',
          label: 'Figure 1.2: 24-Hour Harmonic Load Chart',
          description: 'Copy-pasted from input PDF at (42pt, 392pt)',
          x: 42,
          y: 392,
          width: 238,
          height: 162,
          variant: 'load_chart',
        },
      ],
    },
    {
      pageNumber: 2,
      blocks: [
        {
          x: 42,
          y: 48,
          width: 511,
          height: 26,
          fontSize: 17,
          isHeading: true,
          text: 'Delving into Multi-Spectral Clinical MRI Reconstruction',
        },
        {
          x: 42,
          y: 88,
          width: 511,
          height: 124,
          fontSize: 10.5,
          isHeading: false,
          text: 'Furthermore, in the ever-evolving landscape of diagnostic radiology, the utilization of accelerated magnetic resonance imaging plays a pivotal role in patient care. It is crucial to understand that conventional k-space sampling requires prolonged scan durations, which subsequently facilitates motion artifacts.',
        },
        {
          x: 42,
          y: 396,
          width: 511,
          height: 132,
          fontSize: 10.5,
          isHeading: false,
          text: 'Moreover, as illustrated in Figure 2.1 above, the paradigm shift toward wavelet-regularized tensor reconstruction underscores a testament to modern computational imaging. By leveraging sparse signal recovery, clinical departments can seamlessly reduce patient table time by forty percent while preserving anatomical fidelity.',
        },
        {
          x: 42,
          y: 546,
          width: 511,
          height: 120,
          fontSize: 10.5,
          isHeading: false,
          text: 'In conclusion, it is important to note that the intricate interplay between hardware coil sensitivity and iterative denoising facilitates a comprehensive overview of microvascular tissue structures without utilizing higher contrast agent dosages.',
        },
      ],
      figures: [
        {
          id: 'p2-img1',
          label: 'Figure 2.1: Multi-Spectral MRI Tensor Pipeline',
          description: 'Copy-pasted from input PDF at (42pt, 224pt)',
          x: 42,
          y: 224,
          width: 511,
          height: 152,
          variant: 'mri_pipeline',
        },
      ],
    },
    {
      pageNumber: 3,
      blocks: [
        {
          x: 42,
          y: 48,
          width: 511,
          height: 26,
          fontSize: 17,
          isHeading: true,
          text: 'The Transformative Potential of Cold-Chain Logistics',
        },
        {
          x: 42,
          y: 88,
          width: 511,
          height: 118,
          fontSize: 10.5,
          isHeading: false,
          text: 'Furthermore, it is worth noting that global pharmaceutical distribution delves into a multifaceted tapestry of thermal compliance challenges. Moreover, the utilization of continuous IoT sensor telemetry underscores the importance of monitoring vaccine shipments across intercontinental transit hubs.',
        },
        {
          x: 42,
          y: 388,
          width: 511,
          height: 128,
          fontSize: 10.5,
          isHeading: false,
          text: 'Additionally, the side-by-side telemetry diagrams in Figure 3.1 and Figure 3.2 serve as a testament to how predictive routing facilitates operational efficiency. Due to the fact that ambient warehouse temperatures fluctuate, automated refrigeration units must seamlessly adjust compressor output.',
        },
        {
          x: 42,
          y: 534,
          width: 511,
          height: 116,
          fontSize: 10.5,
          isHeading: false,
          text: 'In summary, leveraging decentralized cold-storage corridors plays a pivotal role in eliminating spoilage. Consequently, this paradigm shift demonstrates significant improvements in last-mile delivery reliability across rural clinics.',
        },
      ],
      figures: [
        {
          id: 'p3-img1',
          label: 'Figure 3.1: Cold-Chain Sensor Telemetry Curve',
          description: 'Copy-pasted from input PDF at (42pt, 218pt)',
          x: 42,
          y: 218,
          width: 246,
          height: 150,
          variant: 'cold_chain',
        },
        {
          id: 'p3-img2',
          label: 'Figure 3.2: Regional Distribution Corridor Map',
          description: 'Copy-pasted from input PDF at (306pt, 218pt)',
          x: 306,
          y: 218,
          width: 247,
          height: 150,
          variant: 'route_variance',
        },
      ],
    },
  ];

  const pages: PdfPageModel[] = [];

  for (const cfg of pageConfigs) {
    const textBlocks: TextBlock[] = cfg.blocks.map((b, idx) => {
      const before = calculateAiRoboticMetrics(b.text);
      const humanized = humanizeTextLocally(b.text, initialTone, b.isHeading);
      const after = calculateAiRoboticMetrics(humanized);
      return {
        id: `p${cfg.pageNumber}-b${idx + 1}`,
        pageNumber: cfg.pageNumber,
        bbox: {
          x: b.x / widthPt,
          y: b.y / heightPt,
          width: b.width / widthPt,
          height: b.height / heightPt,
        },
        pdfBbox: {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        },
        sourceLineRects: b.isHeading ? [{ x: b.x, y: b.y, width: b.width, height: b.height }] : undefined,
        textAlign: b.isHeading ? 'left' : 'justify',
        originalText: b.text,
        humanizedText: humanized,
        fontSize: b.fontSize,
        fontWeight: b.isHeading ? 'bold' : 'normal',
        isHeading: b.isHeading,
        bgColor: '#ffffff',
        textColor: '#0f172a',
        status: 'done',
        metrics: {
          roboticScoreBefore: before.roboticScore,
          roboticScoreAfter: after.roboticScore,
          burstinessAfter: after.burstiness,
        },
      };
    });

    // Render figures onto an offscreen canvas so we can crop each picture's exact PNG data URL
    const figCanvas = document.createElement('canvas');
    figCanvas.width = widthPt * renderScale;
    figCanvas.height = heightPt * renderScale;
    const figCtx = figCanvas.getContext('2d');
    if (figCtx) {
      figCtx.fillStyle = '#ffffff';
      figCtx.fillRect(0, 0, figCanvas.width, figCanvas.height);
      for (const fig of cfg.figures) {
        drawEmbeddedFigureOnCanvas(figCtx, fig.x, fig.y, fig.width, fig.height, fig.variant, renderScale);
      }
    }

    const imageRegions: PreservedImageRegion[] = cfg.figures.map((f) => {
      const pdfBbox: PdfPointBBox = { x: f.x, y: f.y, width: f.width, height: f.height };
      const croppedDataUrl = cropRegionFromCanvas(figCanvas, pdfBbox, renderScale);
      return {
        id: f.id,
        pageNumber: cfg.pageNumber,
        label: f.label,
        description: f.description,
        bbox: {
          x: f.x / widthPt,
          y: f.y / heightPt,
          width: f.width / widthPt,
          height: f.height / heightPt,
        },
        pdfBbox,
        croppedDataUrl,
        locked: true,
      };
    });

    const originalPageDataUrl = await renderPageCanvasDataUrl(
      widthPt,
      heightPt,
      textBlocks,
      'original',
      undefined,
      (ctx, scale) => {
        for (const fig of cfg.figures) {
          drawEmbeddedFigureOnCanvas(ctx, fig.x, fig.y, fig.width, fig.height, fig.variant, scale);
        }
      },
      null,
      imageRegions,
      'justify'
    );

    pages.push({
      pageNumber: cfg.pageNumber,
      widthPt,
      heightPt,
      originalPageDataUrl,
      textBlocks,
      imageRegions,
      status: 'completed',
    });
  }

  return {
    fileName: 'AI-Research-Report-With-Figures.pdf',
    pages,
  };
}

/**
 * Parses a user-uploaded PDF file page-by-page in the browser:
 * 1. Renders each page at 2x DPI to capture all embedded images, graphics, tables, and backgrounds.
 * 2. Automatically detects and crops every picture/diagram on the page (`croppedDataUrl`) so it is
 *    explicitly copy-pasted onto the output page at its exact coordinates.
 * 3. Extracts all text blocks, aligns them into a uniform vertical alignment, and clamps them inside margins.
 */
export async function parseUploadedPdfFile(
  file: File,
  initialTone: HumanTone = 'warm_conversational'
): Promise<{
  fileName: string;
  pages: PdfPageModel[];
}> {
  const arrayBuffer = await file.arrayBuffer();

  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: PdfPageModel[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport1x = page.getViewport({ scale: 1.0 });
    const renderScale = 2.0;
    const viewport2x = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport2x.width);
    canvas.height = Math.round(viewport2x.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        canvas,
        viewport: viewport2x,
      }).promise;
    }

    const originalPageDataUrl = canvas.toDataURL('image/png');
    const textContent = await page.getTextContent();
    const rawItems: RawPdfTextItem[] = [];

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
        const tx = pdfjsLib.Util.transform(viewport1x.transform, item.transform);
        const fontHeight = Math.max(
          8,
          Math.hypot(tx[2], tx[3]) || Math.abs(item.height) || 11
        );
        const x = tx[4];
        const yBottom = tx[5];
        const yTop = yBottom - fontHeight * 0.88;
        const rawWidth = Math.max(3, item.width || item.str.length * fontHeight * 0.52);
        const clampedWidth = Math.min(viewport1x.width - Math.max(4, x) - 4, rawWidth);

        rawItems.push({
          str: item.str,
          x,
          yTop,
          width: Math.max(3, clampedWidth),
          height: fontHeight * 1.18,
          fontSize: fontHeight,
        });
      }
    }

    // 1. Detect and crop every visual picture/diagram on the page so it can be copy-pasted onto the output!
    const imageRegions = detectAndCropVisualRegionsFromCanvas(
      canvas,
      viewport1x.width,
      viewport1x.height,
      rawItems,
      pageNum,
      renderScale
    );

    // 2. Group text items into paragraph/heading blocks and align them cleanly around detected pictures
    const groupedBlocks = groupRawPdfItemsIntoBlocks(
      rawItems,
      viewport1x.width,
      viewport1x.height,
      pageNum
    );

    const alignedBlocks = alignAndConstrainBlocksAroundImages(
      groupedBlocks,
      imageRegions,
      viewport1x.width,
      viewport1x.height
    );

    // 3. Humanize every block immediately so the output page displays natural human text right away
    const textBlocks: TextBlock[] = alignedBlocks.map((block) => {
      const humanized = humanizeTextLocally(block.originalText, initialTone, block.isHeading);
      const after = calculateAiRoboticMetrics(humanized);
      return {
        ...block,
        humanizedText: humanized,
        status: 'done',
        metrics: {
          ...block.metrics,
          roboticScoreAfter: after.roboticScore,
          burstinessAfter: after.burstiness,
        },
      };
    });

    // Sample background color at the corner of each text block so masking blends seamlessly
    if (ctx) {
      for (const block of textBlocks) {
        const sampleX = Math.max(
          2,
          Math.min(canvas.width - 3, Math.round(block.pdfBbox.x * renderScale) - 3)
        );
        const sampleY = Math.max(
          2,
          Math.min(canvas.height - 3, Math.round(block.pdfBbox.y * renderScale) - 3)
        );
        const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        if (pixel && pixel[3] > 200) {
          block.bgColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          const luminance = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2];
          block.textColor = luminance < 110 ? '#f8fafc' : '#0f172a';
        }
      }
    }

    pages.push({
      pageNumber: pageNum,
      widthPt: viewport1x.width,
      heightPt: viewport1x.height,
      originalPageDataUrl,
      textBlocks,
      imageRegions,
      status: 'completed',
    });
  }

  return {
    fileName: file.name,
    pages,
  };
}

/**
 * Exports the humanized multi-page PDF document where every page explicitly copy-pastes
 * the original pictures/diagrams and renders the aligned humanized text inside page bounds.
 */
export async function exportHumanizedPdfBytes(
  pages: PdfPageModel[],
  textAlignment: 'match_input' | 'justify' | 'left' = 'match_input'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const pageModel of pages) {
    const compositeDataUrl = await renderPageCanvasDataUrl(
      pageModel.widthPt,
      pageModel.heightPt,
      pageModel.textBlocks,
      'humanized',
      pageModel.originalPageDataUrl,
      undefined,
      null,
      pageModel.imageRegions,
      textAlignment
    );

    const pdfPage = pdfDoc.addPage([pageModel.widthPt, pageModel.heightPt]);

    if (compositeDataUrl) {
      const pngImage = await pdfDoc.embedPng(compositeDataUrl);
      pdfPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pageModel.widthPt,
        height: pageModel.heightPt,
      });
    } else {
      for (const block of pageModel.textBlocks) {
        const fitted = fitTextToBoundingBox(
          block.humanizedText,
          block.pdfBbox.width,
          block.pdfBbox.height,
          block.fontSize
        );
        const font = block.isHeading ? boldFont : regularFont;
        fitted.lines.forEach((line, idx) => {
          const pdfY =
            pageModel.heightPt -
            block.pdfBbox.y -
            fitted.fittedFontSize -
            idx * fitted.lineHeightPt;
          if (pdfY > 12) {
            pdfPage.drawText(line, {
              x: block.pdfBbox.x,
              y: pdfY,
              size: fitted.fittedFontSize,
              font,
              color: rgb(0.06, 0.09, 0.16),
            });
          }
        });
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Generates a real downloadable multi-page PDF binary with embedded graphics and AI text
 * so users can test uploading a real .pdf file from disk as well.
 */
export async function generateSamplePdfBytes(): Promise<Uint8Array> {
  const sample = await createSamplePdfDocumentModel();
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const pageModel of sample.pages) {
    const page = pdfDoc.addPage([pageModel.widthPt, pageModel.heightPt]);
    if (pageModel.originalPageDataUrl) {
      const pngImage = await pdfDoc.embedPng(pageModel.originalPageDataUrl);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pageModel.widthPt,
        height: pageModel.heightPt,
      });
    }

    for (const block of pageModel.textBlocks) {
      const fitted = fitTextToBoundingBox(
        block.originalText,
        block.pdfBbox.width,
        block.pdfBbox.height,
        block.fontSize
      );
      const font = block.isHeading ? boldFont : regularFont;
      fitted.lines.forEach((line, idx) => {
        const pdfY =
          pageModel.heightPt -
          block.pdfBbox.y -
          fitted.fittedFontSize -
          idx * fitted.lineHeightPt;
        if (pdfY > 12) {
          page.drawText(line, {
            x: block.pdfBbox.x,
            y: pdfY,
            size: fitted.fittedFontSize,
            font,
            color: rgb(0.06, 0.09, 0.16),
            opacity: 0.01,
          });
        }
      });
    }
  }

  return await pdfDoc.save();
}
