export interface EnglishKnowledgeDraft {
  title: string;
  reasoning: string;
}

export function isLikelyEnglish(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const latin = value.match(/[A-Za-z]/g) ?? [];
  return latin.length / letters.length >= 0.8;
}

export function needsEnglishTranslation(draft: EnglishKnowledgeDraft): boolean {
  return !isLikelyEnglish(draft.title) || !isLikelyEnglish(draft.reasoning);
}

export async function translateKnowledgeDraftToEnglish(
  draft: EnglishKnowledgeDraft,
  fetcher: typeof fetch = fetch,
): Promise<EnglishKnowledgeDraft> {
  const response = await fetcher('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'en', fields: draft }),
  });
  if (!response.ok) throw new Error(`Translation service returned ${response.status}`);
  const body = await response.json() as { fields?: Partial<EnglishKnowledgeDraft> };
  const title = body.fields?.title?.trim();
  const reasoning = body.fields?.reasoning?.trim();
  if (!title || !reasoning || !isLikelyEnglish(title) || !isLikelyEnglish(reasoning)) {
    throw new Error('Translation service returned an invalid English draft');
  }
  return { title, reasoning };
}
