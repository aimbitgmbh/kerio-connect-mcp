/**
 * Normalize common JSON type mistakes made by tool-calling models.
 *
 * Some OpenAI-compatible models serialize values inside the tool arguments a
 * second time, for example `{ "limit": "5" }` or
 * `{ "to": "[\"person@example.com\"]" }`. MCP still receives a valid
 * arguments object, but strict runtime validation would reject those values.
 * This normalizer uses the advertised JSON Schema and only coerces values when
 * the target type is unambiguous. Invalid values remain unchanged so the
 * existing Zod schemas can report them normally.
 */

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonContainer(value: string, expectedType: 'array' | 'object'): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    if (expectedType === 'array' ? Array.isArray(parsed) : isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // Leave malformed JSON untouched so downstream validation reports it.
  }

  return value;
}

function normalizeValue(value: unknown, schema: JsonSchema): unknown {
  let normalized = value;

  if (typeof normalized === 'string') {
    if (schema.type === 'number' || schema.type === 'integer') {
      const trimmed = normalized.trim();
      if (trimmed !== '') {
        const number = Number(trimmed);
        if (Number.isFinite(number) && (schema.type !== 'integer' || Number.isInteger(number))) {
          normalized = number;
        }
      }
    } else if (schema.type === 'boolean') {
      const lower = normalized.trim().toLowerCase();
      if (lower === 'true') normalized = true;
      if (lower === 'false') normalized = false;
    } else if (schema.type === 'array' || schema.type === 'object') {
      normalized = parseJsonContainer(normalized, schema.type);
    }
  }

  if (schema.type === 'array' && Array.isArray(normalized) && schema.items) {
    return normalized.map((item) => normalizeValue(item, schema.items!));
  }

  if (schema.type === 'object' && isRecord(normalized) && schema.properties) {
    return Object.fromEntries(
      Object.entries(normalized).map(([key, item]) => [
        key,
        schema.properties?.[key]
          ? normalizeValue(item, schema.properties[key])
          : item,
      ])
    );
  }

  return normalized;
}

export function normalizeToolArguments(
  args: Record<string, unknown>,
  inputSchema: unknown
): Record<string, unknown> {
  if (!isRecord(inputSchema)) return args;

  const normalized = normalizeValue(args, inputSchema as JsonSchema);
  return isRecord(normalized) ? normalized : args;
}
