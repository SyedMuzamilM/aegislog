import type { ShieldOptions } from './types.js';

const DEFAULT_SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'passwd',
  'secret',
  'token',
  'bearer',
  'authorization',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'id_token',
  'private_key',
  'privatekey',
  'certificate',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'pan',
  'ssn',
  'social_security',
  'cookie',
  'set-cookie',
  'session_token',
  'session_secret',
  'webhook_secret',
]);

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9\-_.]{10,}/gi;
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g;
const API_KEY_REGEX = /(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,})/g;
const AWS_KEY_REGEX = /AKIA[0-9A-Z]{16}/g;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

export class SecurityShield {
  private sensitiveKeys: Set<string>;
  private maskString: string;
  private maxDepth: number;
  private maxStringLength: number;
  private enabled: boolean;
  private customMasker?: (key: string, value: unknown) => unknown;

  constructor(options: ShieldOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.maskString = options.maskString ?? '[REDACTED]';
    this.maxDepth = options.maxDepth ?? 6;
    this.maxStringLength = options.maxStringLength ?? 10000;
    this.customMasker = options.customMasker;

    this.sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS);
    if (options.additionalKeys) {
      for (const key of options.additionalKeys) {
        this.sensitiveKeys.add(key.toLowerCase());
      }
    }
  }

  public isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (this.sensitiveKeys.has(key.toLowerCase()) || this.sensitiveKeys.has(normalized)) {
      return true;
    }
    return (
      normalized.includes('password') ||
      normalized.includes('secret') ||
      normalized.includes('apikey') ||
      normalized.includes('privkey')
    );
  }

  public sanitizeString(val: string): string {
    if (!this.enabled) return val;

    let result = val;
    if (result.length > this.maxStringLength) {
      result = `${result.slice(0, this.maxStringLength)}... [TRUNCATED]`;
    }

    result = result.replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]');
    result = result.replace(JWT_REGEX, '[REDACTED_JWT]');
    result = result.replace(API_KEY_REGEX, 'sk-[REDACTED_KEY]');
    result = result.replace(AWS_KEY_REGEX, 'AKIA[REDACTED_KEY]');
    result = result.replace(CREDIT_CARD_REGEX, (match) => {
      const cleaned = match.replace(/[-\s]/g, '');
      return `****-****-****-${cleaned.slice(-4)}`;
    });

    return result;
  }

  public sanitize<T>(data: T): T {
    if (!this.enabled || data === null || data === undefined) {
      return data;
    }

    const seen = new WeakSet();
    return this.walk(data, '', 0, seen) as T;
  }

  private walk(val: unknown, key: string, depth: number, seen: WeakSet<object>): unknown {
    if (depth > this.maxDepth) {
      return '[MAX_DEPTH_EXCEEDED]';
    }

    if (this.customMasker && key) {
      const customResult = this.customMasker(key, val);
      if (customResult !== undefined) {
        return customResult;
      }
    }

    if (key && this.isSensitiveKey(key)) {
      return this.maskString;
    }

    if (val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'string') {
      return this.sanitizeString(val);
    }

    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
      return val;
    }

    if (val instanceof Error) {
      return this.serializeError(val, depth, seen);
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    if (typeof val === 'object') {
      if (seen.has(val)) {
        return '[CIRCULAR_REF]';
      }
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map((item) => this.walk(item, key, depth + 1, seen));
      }

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        result[k] = this.walk(v, k, depth + 1, seen);
      }
      return result;
    }

    return String(val);
  }

  private serializeError(err: Error, depth: number, seen: WeakSet<object>): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      name: err.name,
      message: this.sanitizeString(err.message),
      stack: err.stack ? this.sanitizeString(err.stack) : undefined,
    };

    if ('code' in err) {
      serialized.code = (err as unknown as { code: unknown }).code;
    }

    if ('cause' in err && err.cause) {
      serialized.cause = this.walk(err.cause, 'cause', depth + 1, seen);
    }

    // Attach any custom properties on the error object
    for (const [k, v] of Object.entries(err)) {
      if (!(k in serialized)) {
        serialized[k] = this.walk(v, k, depth + 1, seen);
      }
    }

    return serialized;
  }
}
