import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_TYPE_CATALOG,
  PROFESSIONAL_TEMPLATES,
  analyzeRequirementsAndMissingInfo,
  extractLockedFacts,
  runControlledHumanizePipeline,
  buildStructuredDocumentFromInputs,
  applyEditorQuickAction,
  exportCanonicalDocumentToPdfBytes,
  exportCanonicalDocumentToDocxBytes,
  detectDocumentTypeFromPrompt,
  generateChatGptStyleResponse,
} from './document-agent-engine';

test('Step B & C: analyzeRequirementsAndMissingInfo detects missing required fields and generates Roman Urdu + English questions', () => {
  const proposalType = DOCUMENT_TYPE_CATALOG.find((d) => d.id === 'business_proposal')!;
  const partialInputs = {
    agencyName: 'Apex Cloud Systems',
    clientName: '', // missing required
    projectGoal: '', // missing required
    budgetRange: '', // missing required
  };

  const analysis = analyzeRequirementsAndMissingInfo(proposalType, partialInputs, '');
  assert.ok(analysis.missingQuestions.length >= 3);
  assert.ok(
    analysis.missingQuestions.some((f) => f.questionUrdu.toLowerCase().includes('budget'))
  );
});

test('Section 5: runControlledHumanizePipeline locks numbers/dates/currencies and achieves <10% AI score', () => {
  const original = [
    'Furthermore, the organization is a testament to scalable digital transformation. In Q4 2026, revenue increased by 34.8% to $120,000 across 14 enterprise accounts.',
  ];
  const locked = extractLockedFacts(original.join(' '));
  assert.ok(locked.some((f) => f.includes('34.8%')));
  assert.ok(locked.some((f) => f.includes('$120,000')));

  const result = runControlledHumanizePipeline(
    original,
    'Professional',
    'Executive / C-Suite'
  );
  assert.ok(
    result.aiScoreAfter < 10,
    `Expected AI score < 10%, got ${result.aiScoreAfter}%`
  );
  const finalJoined = result.humanizedParagraphs.join(' ');
  assert.ok(finalJoined.includes('34.8%'), 'Must preserve exact percentage 34.8%');
  assert.ok(finalJoined.includes('$120,000'), 'Must preserve exact currency $120,000');
  assert.equal(result.meaningPreserved, true);
});

test('Step E–G: buildStructuredDocumentFromInputs produces CanonicalDocumentModel with zero fabricated facts', () => {
  const cvType = DOCUMENT_TYPE_CATALOG.find((d) => d.id === 'cv_resume')!;
  const formValues: Record<string, string> = {};
  for (const f of cvType.fields) {
    formValues[f.key] = f.placeholder.replace(/^e\.g\.?\s*/i, '');
  }

  const doc = buildStructuredDocumentFromInputs({
    docType: cvType,
    formValues,
    customPrompt: 'Preserve all metrics and technologies.',
    approvedOutline: cvType.defaultOutline,
    tone: 'Professional',
    audience: 'Executive / C-Suite',
    lengthTarget: 'Medium (2–3 Pages)',
  });

  assert.equal(doc.documentTypeId, 'cv_resume');
  assert.equal(doc.sections.length, cvType.defaultOutline.length);
  assert.equal(doc.qualityCheck.noFabricatedClaims, true);
  for (const sec of doc.sections) {
    assert.ok(sec.metrics.aiScoreAfter < 10);
  }
});

test('Section 6 & 14: applyEditorQuickAction and Canonical PDF + DOCX exporters produce valid binaries', async () => {
  const proposalType = DOCUMENT_TYPE_CATALOG.find((d) => d.id === 'business_proposal')!;
  const formValues: Record<string, string> = {};
  for (const f of proposalType.fields) {
    formValues[f.key] = f.placeholder.replace(/^e\.g\.?\s*/i, '');
  }

  const doc = buildStructuredDocumentFromInputs({
    docType: proposalType,
    formValues,
    customPrompt: '',
    approvedOutline: proposalType.defaultOutline,
    tone: 'Persuasive',
    audience: 'Client / Small Business Owner',
    lengthTarget: 'Medium (2–3 Pages)',
  });

  const expandedParas = applyEditorQuickAction(
    doc.sections[0].paragraphs,
    'expand',
    'Persuasive',
    'Client / Small Business Owner'
  );
  const pipeline = runControlledHumanizePipeline(
    expandedParas,
    'Persuasive',
    'Client / Small Business Owner'
  );
  assert.ok(pipeline.aiScoreAfter < 10);

  const pdfBytes = await exportCanonicalDocumentToPdfBytes(doc, PROFESSIONAL_TEMPLATES[0]);
  assert.ok(pdfBytes.byteLength > 800, 'Expected valid PDF binary');

  const docxBytes = exportCanonicalDocumentToDocxBytes(doc, PROFESSIONAL_TEMPLATES[0]);
  // ZIP header magic bytes PK\x03\x04
  assert.equal(docxBytes[0], 0x50);
  assert.equal(docxBytes[1], 0x4b);
  assert.ok(docxBytes.byteLength > 500, 'Expected valid OpenXML DOCX ZIP archive');
});

test('ChatGPT Studio: generateChatGptStyleResponse takes prompt + input content and generates humanized <10% AI response + CanonicalDocumentModel', () => {
  const detected = detectDocumentTypeFromPrompt(
    'Mujhe digital marketing agency ke liye business proposal chahiye'
  );
  assert.equal(detected.id, 'business_proposal');

  const reply = generateChatGptStyleResponse({
    prompt:
      'Mujhe digital marketing agency ke liye business proposal chahiye ($8,500/month retainer)',
    inputContext:
      'Furthermore, the campaign delves into a multifaceted tapestry of 24.5% conversion growth in 2026.',
    tone: 'Persuasive',
    audience: 'Client / Small Business Owner',
  });

  assert.equal(reply.role, 'assistant');
  assert.ok((reply.aiScoreAfter ?? 100) < 10, `Expected AI score < 10%, got ${reply.aiScoreAfter}%`);
  assert.ok(reply.humanizedContent?.includes('24.5%'));
  assert.ok(reply.canonicalDocument);
  assert.ok(reply.canonicalDocument!.sections.length >= 2);
});
