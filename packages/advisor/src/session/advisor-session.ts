import type { AdvisorSuggestion } from '../types';

export interface AdvisorSuggestionRunner {
  runSuggestionPrompt(prompt: string, signal?: AbortSignal): Promise<AdvisorSuggestion>;
  ask?(question: string, context: string, signal?: AbortSignal): Promise<string>;
  abort?(): void;
}

export interface AdvisorSessionOptions {
  runner: AdvisorSuggestionRunner;
  stateProvider: () => string;
  historyLimit?: number;
}

export class AdvisorSession {
  private readonly runner: AdvisorSuggestionRunner;
  private readonly stateProvider: () => string;
  private readonly historyLimit: number;
  private summaries: string[] = [];
  private inFlight: AbortController | null = null;

  constructor(options: AdvisorSessionOptions) {
    this.runner = options.runner;
    this.stateProvider = options.stateProvider;
    this.historyLimit = options.historyLimit ?? 3;
  }

  get history(): string[] {
    return this.summaries.slice();
  }

  suggestMulligan(): Promise<AdvisorSuggestion> {
    return this.runWithAbort((signal) =>
      this.runner.runSuggestionPrompt(
        this.buildContext('Generate a mulligan AdvisorSuggestion. Focus on keep/replace decisions.'),
        signal,
      ),
    );
  }

  suggestTurn(): Promise<AdvisorSuggestion> {
    return this.runWithAbort((signal) =>
      this.runner.runSuggestionPrompt(
        this.buildContext('Generate the best current-turn AdvisorSuggestion.'),
        signal,
      ),
    );
  }

  ask(question: string): Promise<string> {
    if (!this.runner.ask) {
      throw new Error('Advisor runner does not support follow-up questions');
    }
    return this.runWithAbort((signal) => this.runner.ask!(question, this.buildContext(null), signal));
  }

  endTurn(summary: string): void {
    const trimmed = summary.trim();
    if (trimmed.length === 0) return;
    this.summaries = [...this.summaries, trimmed].slice(-this.historyLimit);
  }

  abortInFlight(): void {
    if (this.inFlight === null) return;
    this.inFlight.abort();
    this.runner.abort?.();
    this.inFlight = null;
  }

  private buildContext(request: string | null): string {
    const sections: string[] = [];
    if (this.summaries.length > 0) {
      sections.push(
        ['## Recent Turn Summaries', ...this.summaries.map((summary) => `- ${summary}`)].join('\n'),
      );
    }
    if (request !== null) {
      sections.push(['## Request', request].join('\n'));
    }
    sections.push(this.stateProvider());
    return sections.join('\n\n');
  }

  private async runWithAbort<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.abortInFlight();
    const controller = new AbortController();
    this.inFlight = controller;
    try {
      return await operation(controller.signal);
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }
}
