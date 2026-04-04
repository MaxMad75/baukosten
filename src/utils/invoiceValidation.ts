/**
 * Invoice validation utilities.
 */

/**
 * Validates that net + tax ≈ gross within a tolerance.
 */
export function validateNetTaxGross(
  net: number,
  tax: number,
  gross: number,
  tolerance: number = 0.02
): boolean {
  return Math.abs(net + tax - gross) <= tolerance;
}

/**
 * Validates that splits sum matches the invoice amount within a tolerance.
 */
export function validateSplitsSum(
  splits: { amount: number }[],
  invoiceAmount: number,
  tolerance: number = 0.01
): boolean {
  const total = splits.reduce((sum, s) => sum + s.amount, 0);
  return Math.abs(total - invoiceAmount) <= tolerance;
}
