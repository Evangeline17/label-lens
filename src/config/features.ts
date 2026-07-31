export function isLabelRecognitionBetaAvailable(value: unknown): boolean {
  return value === 'true'
}

export function initialLabelRecognitionBetaEnabled(
  available: boolean,
  restored: boolean | undefined,
): boolean {
  return available && (restored ?? true)
}

export const LABEL_RECOGNITION_BETA_AVAILABLE =
  import.meta.env.VITE_ENABLE_LABEL_RECOGNITION_BETA === 'true'
