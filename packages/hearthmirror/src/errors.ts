export enum MirrorErrorCode {
  ProcessNotFound = 1,
  AccessDenied = 2,
  MemoryReadFailed = 3,
  ClassNotFound = 4,
  FieldNotFound = 5,
  Timeout = 6,
  NotConnected = 7,
  Unknown = 99,
}

export class MirrorError extends Error {
  constructor(
    public readonly code: MirrorErrorCode,
    message: string,
    public readonly methodName?: string,
  ) {
    super(message);
    this.name = 'MirrorError';
  }
}
