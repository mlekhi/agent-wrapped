export type Source = 'claude' | 'codex';
export type ToolCategory = 'read' | 'write' | 'edit' | 'shell' | 'search' | 'web' | 'agent' | 'other';

/** internal event: never pass this to a renderer or serialize it for sharing. */
export interface ToolEvent {
  source: Source;
  session: string;
  callId?: string;
  timestamp: number;
  tool: ToolCategory;
  files: string[];
  cwd?: string;
}

export interface ParsedRecord {
  events: ToolEvent[];
  malformed: number;
  ignored: number;
}

export interface UsageOptions {
  source?: Source | 'all';
  claudeDir?: string;
  codexDir?: string;
  year?: number;
  from?: string;
  to?: string;
}

/** share-safe data only: no paths, ids, arbitrary labels, or transcript text. */
export interface UsageSummary {
  period: { from: string; to: string };
  timezone: string;
  totalCalls: number;
  observedFiles: number;
  activeDays: number;
  longestStreakDays: number;
  months: { month: string; sources: Record<Source, number> }[];
  tools: Record<ToolCategory, number>;
  sources: Record<Source, number>;
  hours: number[];
  diagnostics: {
    filesRead: number;
    malformedRecords: number;
    ignoredRecords: number;
    duplicateCalls: number;
    oversizedRecords: number;
  };
}
