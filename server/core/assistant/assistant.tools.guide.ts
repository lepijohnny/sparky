import { validateBusEvent, BusValidationError } from "../bus";

export function guide(event: string, params: any): string | null {
  const err = validateBusEvent(event, params);
  if (!err) return null;
  return `${err.hint}\n\nYou sent: ${JSON.stringify(params)}\n\nExpected shape: ${JSON.stringify(err.expectedShape)}`;
}
