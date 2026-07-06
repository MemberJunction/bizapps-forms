/**
 * Small typed helpers for reading/writing MJ Action params.
 *
 * `ActionParam.Value` is `any` in the framework's base type — we cannot change that,
 * but we contain it here so no `any` leaks into the action implementations. Every
 * accessor coerces to a concrete type at the boundary.
 */
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

/** Case/space-insensitive param lookup (matches the convention in MJ's demo actions). */
export function findParam(params: RunActionParams, name: string): ActionParam | undefined {
  const target = name.trim().toLowerCase();
  return params.Params.find((p) => p.Name.trim().toLowerCase() === target);
}

/** Read a required string param; returns undefined when missing/blank. */
export function getStringParam(params: RunActionParams, name: string): string | undefined {
  const value: unknown = findParam(params, name)?.Value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** Read a boolean param, accepting real booleans and the strings "true"/"false". */
export function getBooleanParam(params: RunActionParams, name: string): boolean | undefined {
  const value: unknown = findParam(params, name)?.Value;
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

/**
 * Set (or append) an Output param on the run so callers can read structured results.
 * Mutates `params.Params` in place, matching how MJ surfaces outputs.
 */
export function setOutputParam(params: RunActionParams, name: string, value: unknown): void {
  const existing = findParam(params, name);
  if (existing) {
    existing.Value = value;
    existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type;
    return;
  }
  params.Params.push({ Name: name, Value: value, Type: 'Output' });
}
