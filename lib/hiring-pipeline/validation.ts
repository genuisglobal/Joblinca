export interface PipelineOrderStage {
  id: string;
  label: string;
  stageType: string;
  isTerminal: boolean;
  orderIndex: number;
}

export interface PipelineOrderValidationResult {
  valid: boolean;
  message: string | null;
}

export function validatePipelineStageOrder(
  stages: PipelineOrderStage[]
): PipelineOrderValidationResult {
  if (stages.length === 0) {
    return {
      valid: false,
      message: 'A hiring pipeline must contain at least one stage.',
    };
  }

  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);

  let encounteredTerminal = false;
  let firstTerminal: PipelineOrderStage | null = null;

  for (const stage of orderedStages) {
    if (!stage.label.trim()) {
      return {
        valid: false,
        message: 'Every stage must have a label.',
      };
    }

    if (stage.isTerminal) {
      encounteredTerminal = true;
      firstTerminal = firstTerminal || stage;
      continue;
    }

    if (encounteredTerminal) {
      return {
        valid: false,
        message: `${stage.label} cannot come after terminal stage ${firstTerminal?.label || 'the terminal stage'}. Move terminal stages to the end.`,
      };
    }
  }

  return {
    valid: true,
    message: null,
  };
}
