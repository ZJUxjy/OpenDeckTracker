export type HearthWatcherStatusKind =
  | 'ready'
  | 'waiting-for-lines'
  | 'missing-log'
  | 'parser-error'
  | 'lag'
  | 'rotation-or-truncation';

export interface HearthWatcherDiagnostic {
  kind: HearthWatcherStatusKind;
  message: string;
  path?: string;
  searchedPaths?: string[];
  recordType?: string;
  line?: string;
  droppedLines?: number;
  timestamp: number;
}

export interface ParserDiagnostics {
  malformedRecords: number;
  byRecordType: Record<string, number>;
}

export function createParserDiagnostics(): ParserDiagnostics {
  return {
    malformedRecords: 0,
    byRecordType: {},
  };
}

export function recordMalformedRecord(
  diagnostics: ParserDiagnostics,
  recordType: string,
): void {
  diagnostics.malformedRecords += 1;
  diagnostics.byRecordType[recordType] = (diagnostics.byRecordType[recordType] ?? 0) + 1;
}
