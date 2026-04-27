export type LoadingScreenEventType = 'game-scene-started' | 'game-scene-ended';

export interface LoadingScreenEvent {
  type: LoadingScreenEventType;
  raw: string;
  content: string;
  timestamp?: string;
}
