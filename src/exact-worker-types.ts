export interface ExactRequest {
  operation: 'integrate' | 'differentiate' | 'simplify' | 'expand' | 'factor' | 'solve';
  source: string;
  variable?: string;
  bounds?: [string, string];
  answer?: string;
}

export interface ExactResult {
  latex: string;
  expression: string;
  numeric: [number, number] | null;
}

export type ExactMessage = { id: number; request: ExactRequest };
export type ExactReply = { id: number; result?: ExactResult | null };
