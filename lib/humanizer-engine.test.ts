import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAiRoboticMetrics,
  humanizeTextLocally,
  groupRawPdfItemsIntoBlocks,
  alignAndConstrainBlocksAroundImages,
  fitTextToBoundingBox,
  type RawPdfTextItem,
  type PreservedImageRegion,
} from './humanizer-engine';

test('calculateAiRoboticMetrics detects typical AI trigger vocabulary and lowers robotic score after humanizing', () => {
  const roboticSample =
    'Furthermore, it is crucial to note that the utilization of artificial intelligence delves into a multifaceted tapestry of operational efficiency. Moreover, this paradigm shift underscores the importance of leveraging automated pipelines.';

  const before = calculateAiRoboticMetrics(roboticSample);
  assert.ok(before.roboticScore >= 60, `Expected high robotic score, got ${before.roboticScore}`);
  assert.ok(before.aiTriggerWordsFound.includes('furthermore'));
  assert.ok(before.aiTriggerWordsFound.includes('moreover'));

  const humanized = humanizeTextLocally(roboticSample, 'warm_conversational');
  const after = calculateAiRoboticMetrics(humanized);

  assert.ok(
    after.roboticScore < 10,
    `Expected humanized text to achieve < 10% AI score, got ${after.roboticScore}%`
  );
  assert.equal(after.aiTriggerWordsFound.length, 0, 'Should leave zero AI trigger words');
  assert.ok(!/furthermore/i.test(humanized), 'Should remove "furthermore"');
  assert.ok(!/tapestry/i.test(humanized), 'Should remove "tapestry"');
  assert.ok(humanized.includes('artificial intelligence'), 'Should preserve captured subject "artificial intelligence"');
  assert.ok(!humanized.includes('$1'), 'Should never leave unexpanded $1 capture token');
});

test('humanizeTextLocally achieves < 10% AI detector score across all tones while preserving 100% of document meaning, figures, and numbers', () => {
  const sampleParagraphs = [
    'The system processes data using neural networks and generates accurate predictions for enterprise workflows. The model evaluates input parameters to improve performance.',
    'Additionally, empirical field measurements shown in Figure 1.2 serve as a testament to the transformative potential of adaptive load balancing. By utilizing real-time harmonic sensors, municipal engineers can seamlessly integrate electric vehicle charging stations without overloading neighborhood transformers.',
    'In summary, delving into localized energy architectures demonstrates significant improvements in grid reliability. Furthermore, it is important to note that community micro-grids reduce transmission losses by approximately eighteen percent across dense metropolitan corridors.',
  ];
  const ordinaryHeading = 'Introduction to System Architecture';

  for (const tone of [
    'warm_conversational',
    'natural_academic',
    'executive_editorial',
    'simple_direct',
    'storyteller',
  ] as const) {
    for (const para of sampleParagraphs) {
      const rewrittenBody = humanizeTextLocally(para, tone, false);
      assert.notEqual(
        rewrittenBody.trim().toLowerCase(),
        para.trim().toLowerCase(),
        `Expected paragraph to be humanized in tone ${tone}`
      );
      const metrics = calculateAiRoboticMetrics(rewrittenBody);
      assert.ok(
        metrics.roboticScore < 10,
        `Expected < 10% AI score in tone ${tone}, got ${metrics.roboticScore}% for: ${rewrittenBody}`
      );
      assert.equal(
        metrics.aiTriggerWordsFound.length,
        0,
        `Expected 0 AI trigger words in tone ${tone}, found: ${metrics.aiTriggerWordsFound.join(', ')}`
      );
    }

    // Verify exact facts, numbers, and figure references are untouched
    const figPara = humanizeTextLocally(sampleParagraphs[1], tone, false);
    assert.ok(figPara.includes('Figure 1.2'), 'Must preserve Figure 1.2 reference');
    assert.ok(figPara.includes('electric vehicle charging stations'), 'Must preserve core technical entities');

    const numPara = humanizeTextLocally(sampleParagraphs[2], tone, false);
    assert.ok(numPara.includes('eighteen percent'), 'Must preserve exact numerical facts');

    const rewrittenHeading = humanizeTextLocally(ordinaryHeading, tone, true);
    assert.notEqual(
      rewrittenHeading.trim().toLowerCase(),
      ordinaryHeading.trim().toLowerCase(),
      `Expected heading to be humanized in tone ${tone}`
    );
    const headingMetrics = calculateAiRoboticMetrics(rewrittenHeading);
    assert.ok(
      headingMetrics.roboticScore < 10,
      `Expected heading AI score < 10%, got ${headingMetrics.roboticScore}%`
    );
  }
});

test('groupRawPdfItemsIntoBlocks merges adjacent lines into exact page bounding boxes and does not merge across wide image gaps', () => {
  const rawItems: RawPdfTextItem[] = [
    { str: 'Figure 1.2 Architecture Overview', x: 50, yTop: 40, width: 240, height: 18, fontSize: 16 },
    { str: 'Furthermore, the system utilizes', x: 50, yTop: 90, width: 200, height: 12, fontSize: 11 },
    { str: 'high-density neural pathways.', x: 255, yTop: 90, width: 170, height: 12, fontSize: 11 },
    { str: 'Moreover, it facilitates rapid data', x: 50, yTop: 105, width: 220, height: 12, fontSize: 11 },
    { str: 'synchronization across nodes.', x: 275, yTop: 105, width: 150, height: 12, fontSize: 11 },
  ];

  const blocks = groupRawPdfItemsIntoBlocks(rawItems, 600, 800, 1);
  assert.equal(blocks.length, 2, 'Should form 1 heading block and 1 merged paragraph block');
  assert.equal(blocks[0].isHeading, true);
  assert.equal(blocks[0].pdfBbox.x, 50);
  assert.equal(blocks[0].pdfBbox.y, 40);

  assert.equal(blocks[1].isHeading, false);
  assert.equal(blocks[1].pdfBbox.x, 50);
  assert.equal(blocks[1].pdfBbox.y, 90);
  assert.ok(blocks[1].sourceLineRects && blocks[1].sourceLineRects.length === 2);
  assert.ok(blocks[1].originalText.includes('Furthermore, the system utilizes high-density neural pathways.'));
  assert.ok(blocks[1].originalText.includes('Moreover, it facilitates rapid data synchronization across nodes.'));
});

test('alignAndConstrainBlocksAroundImages preserves exact input (x, y) positions and original alignment while preventing image overlap', () => {
  const rawItems: RawPdfTextItem[] = [
    { str: 'Centered Document Title', x: 180, yTop: 45, width: 235, height: 20, fontSize: 16 },
    { str: 'Left column text next to an image that should not cross into the image.', x: 42, yTop: 100, width: 310, height: 60, fontSize: 11 },
    { str: 'Indented paragraph below image that keeps its exact x position.', x: 64, yTop: 300, width: 560, height: 50, fontSize: 11 },
  ];

  const rawBlocks = groupRawPdfItemsIntoBlocks(rawItems, 595, 842, 1);
  const imageRegions: PreservedImageRegion[] = [
    {
      id: 'p1-img1',
      pageNumber: 1,
      label: 'Embedded Photo',
      description: 'Right side image',
      bbox: { x: 310 / 595, y: 90 / 842, width: 240 / 595, height: 160 / 842 },
      pdfBbox: { x: 310, y: 90, width: 240, height: 160 },
      locked: true,
    },
  ];

  const aligned = alignAndConstrainBlocksAroundImages(rawBlocks, imageRegions, 595, 842);

  // Every block keeps its exact input (x, y) position without jumping to a different place
  assert.equal(aligned[0].pdfBbox.x, 180);
  assert.equal(aligned[0].pdfBbox.y, 45);
  assert.equal(aligned[0].textAlign, 'center');

  assert.equal(aligned[1].pdfBbox.x, 42);
  assert.equal(aligned[1].pdfBbox.y, 100);

  assert.equal(aligned[2].pdfBbox.x, 64);
  assert.equal(aligned[2].pdfBbox.y, 300);

  // Block 2 (next to image at x=310) is clamped so x + width <= 310 - 8 = 302
  assert.ok(
    aligned[1].pdfBbox.x + aligned[1].pdfBbox.width <= 302,
    `Expected side block right edge <= 302, got ${aligned[1].pdfBbox.x + aligned[1].pdfBbox.width}`
  );

  // Block 3 right edge is clamped inside page right boundary (595 - 42 = 553)
  assert.equal(aligned[2].pdfBbox.x + aligned[2].pdfBbox.width, 553);
});

test('fitTextToBoundingBox wraps text and breaks long tokens to stay strictly inside target box width', () => {
  const sampleText =
    'This is a natural human paragraph with SuperCalifragilisticExpialidociousLongToken1234567890 that needs to fit inside the exact bounding box.';
  const fitted = fitTextToBoundingBox(sampleText, 220, 80, 12);

  assert.ok(fitted.lines.length >= 3);
  assert.ok(fitted.fittedFontSize <= 12 && fitted.fittedFontSize >= 7.5);
});
