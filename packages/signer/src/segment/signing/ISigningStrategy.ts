export interface SigningContext {
  representationId: string;
  filePath: string;
  initPattern: string | null;
  previousSegmentPath: string | undefined;
  isFirstSegment: boolean;
}

export interface SigningResult {
  signedSegmentPath: string;
  signedInitPath?: string;
}

export interface ISigningStrategy {
  sign(context: SigningContext): Promise<SigningResult>;
}
