import type { LogLevel } from './types.js';

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => { value: Output } | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> };
  };
}

export type SchemaLike<T> =
  | { parse: (data: unknown) => T }
  | { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } }
  | ((data: unknown) => T)
  | StandardSchemaV1<unknown, T>;

export interface LogEventDefinition<TName extends string = string, TData = unknown> {
  name: TName;
  level?: LogLevel;
  schema?: SchemaLike<TData>;
}

export function defineLogEvent<TName extends string, TData>(
  definition: LogEventDefinition<TName, TData>
): LogEventDefinition<TName, TData> {
  return definition;
}

export function validateEventData<TData>(schema: SchemaLike<TData> | undefined, data: unknown): TData {
  if (!schema) {
    return data as TData;
  }

  if (typeof schema === 'function') {
    return schema(data);
  }

  // Standard Schema v1
  if (typeof schema === 'object' && '~standard' in schema && typeof schema['~standard']?.validate === 'function') {
    const result = schema['~standard'].validate(data);
    if ('issues' in result && result.issues && result.issues.length > 0) {
      const msg = result.issues.map((i) => i.message).join(', ');
      throw new TypeError(`Event validation failed: ${msg}`);
    }
    return ('value' in result ? result.value : data) as TData;
  }

  // Zod / Valibot safeParse
  if ('safeParse' in schema && typeof schema.safeParse === 'function') {
    const res = schema.safeParse(data);
    if (!res.success) {
      throw new TypeError(`Event validation failed: ${JSON.stringify(res.error)}`);
    }
    return (res.data ?? data) as TData;
  }

  // Zod / Yup / Superstruct parse
  if ('parse' in schema && typeof schema.parse === 'function') {
    return schema.parse(data);
  }

  return data as TData;
}
