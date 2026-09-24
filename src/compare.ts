/**
 * Pure string-comparison helpers and the model-name validator.
 * No framework, no disk, no external state.
 */

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Normalize code string for fuzzy comparison
 */
export function normalizeCode(code: string): string {
  return code
    .replace(/\s+/g, " ")
    .replace(/\s*([(){}:,])\s*/g, "$1")
    .trim()
    .toLowerCase();
}

/**
 * Validate model name to prevent command injection
 */
export function validateModelName(model: string): boolean {
  // Allow alphanumeric, slashes, colons, hyphens, underscores, dots
  // This is a basic validation - adjust pattern based on your model naming conventions
  const pattern = /^[a-zA-Z0-9_\-\.\/:]+$/;
  return pattern.test(model) && model.length > 0 && model.length <= 100;
}
