export type CpuThoughtStage =
  | 'start'
  | 'setup'
  | 'legal'
  | 'evaluate'
  | 'order'
  | 'depth'
  | 'search'
  | 'select'
  | 'done';

export interface CpuThought {
  stage: CpuThoughtStage;
  message: string;
  detail?: string;
  progress?: number;
}

export type CpuThoughtReporter = (thought: CpuThought) => void;
