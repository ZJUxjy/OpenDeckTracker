export interface LogLine {
  raw: string;
  content: string;
  timestamp?: string;
}

const LOG_PREFIX_RE = /^[A-Z]\s+([0-9:.]+)\s+.*? -\s?(.*)$/;

export function parseLogLine(raw: string): LogLine {
  const match = LOG_PREFIX_RE.exec(raw);
  if (!match) {
    return { raw, content: raw.trim() };
  }
  const timestamp = match[1];
  if (timestamp === undefined) {
    return { raw, content: (match[2] ?? '').trim() };
  }
  return {
    raw,
    content: (match[2] ?? '').trim(),
    timestamp,
  };
}
