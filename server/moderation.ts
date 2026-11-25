const BLOCKED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'cunt',
  'slut',
  'whore',
  'nigger',
  'faggot',
  'retard',
  'kys',
  'kill yourself',
  'scam link',
  'free robux',
];

export interface ModerationResult {
  cleaned: string;
  flagged: boolean;
  severity: 'none' | 'mild' | 'severe';
  matchedTerms: string[];
}

export function filterChatMessage(input: string): ModerationResult {
  const trimmed = input.trim().slice(0, 260);
  let cleaned = trimmed;
  const matched: string[] = [];

  for (const term of BLOCKED_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (regex.test(cleaned)) {
      matched.push(term);
      cleaned = cleaned.replace(regex, (m) => '#'.repeat(m.length));
    }
  }

  const severity = matched.some((t) => ['nigger', 'faggot', 'kys', 'kill yourself'].includes(t))
    ? 'severe'
    : matched.length > 0
      ? 'mild'
      : 'none';

  return {
    cleaned,
    flagged: matched.length > 0,
    severity,
    matchedTerms: matched,
  };
}
