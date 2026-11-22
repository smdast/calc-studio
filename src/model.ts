export type Angle = 'DEG' | 'RAD' | 'GRAD';
export type DisplayFormat = 'exact' | 'decimal' | 'mixed' | 'polar';
export type CasOperation = 'simplify' | 'expand' | 'factor' | 'differentiate' | 'integrate' | 'definite';
export type CalculatorOperation = 'calculate' | CasOperation | 'polynomial' | 'interval' | 'system';
export type MatrixOperation = 'add' | 'subtract' | 'multiply' | 'transpose' | 'det' | 'inv' | 'norm' | 'dot' | 'cross';
export type GraphType = 'cartesian' | 'polar' | 'parametric' | 'implicit';
export type Range = [number, number];

export interface Calculation {
  exact: string;
  decimal?: string;
  mixed?: string;
  polar?: string;
  answer: string;
  approximate: boolean;
  operation?: 'calculate' | CasOperation | 'equation';
  note?: string;
  condition?: string;
}

export interface HistoryEntry extends Calculation {
  id: string;
  input: string;
  angle: Angle;
  previousAnswer: string;
  settings?: CalculatorSettings;
  displayInput?: string;
}

export interface CalculatorSettings {
  operation: CalculatorOperation;
  variable: string;
  lower: string;
  upper: string;
  systemRows: string[][];
}

export interface Series {
  x: Array<number | null>;
  y: Array<number | null>;
}

export interface Contour {
  x: number[];
  y: number[];
  z: Array<Array<number | null>>;
}

export interface GraphData {
  series?: Series;
  contour?: Contour;
  tangent?: Series;
  slope?: number;
  point?: [number, number];
  roots?: number[];
  extrema?: Array<{ x: number; y: number; kind: 'min' | 'max' }>;
}

export interface Requests {
  calculate: { input: string; angle: Angle; ans: string };
  system: { a: string[][]; b: string[] };
  matrix: { operation: MatrixOperation; a: string[][]; b: string[][] };
  graph: { type: GraphType; first: string; second: string; x: Range; y: Range; parameter: Range; probe?: number };
}

export interface Responses {
  calculate: Calculation;
  system: { values: string[]; approximate: boolean; condition?: string };
  matrix: { latex: string; condition?: string; note?: string };
  graph: GraphData;
}

type RequestName = keyof Requests;
export type WorkerRequest = { [K in RequestName]: { id: number; kind: K; payload: Requests[K] } }[RequestName];
export type WorkerResponse = { id: number } & ({ data: Responses[RequestName] } | { error: string });
