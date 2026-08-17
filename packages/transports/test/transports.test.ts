import { describe, expect, it, vi } from 'vitest';
import { createLogger } from 'aegislog';
import { OpenTelemetrySink } from '../src/otel.js';
import { HttpBatchSink } from '../src/http.js';

describe('AegisLog Transports', () => {
  it('batches and flushes OpenTelemetry OTLP log entries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));

    const otelSink = new OpenTelemetrySink({
      endpoint: 'http://localhost:4318/v1/logs',
      serviceName: 'order-service',
      serviceVersion: '2.0.0',
    });

    const logger = createLogger({ sinks: [otelSink] });

    logger.info('Payment authorization started', { orderId: 'ord_991' });
    await otelSink.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4318/v1/logs');
    const body = JSON.parse(requestInit.body as string);
    expect(body.resourceLogs[0]?.resource?.attributes[0]?.value?.stringValue).toBe('order-service');
    expect(body.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.body?.stringValue).toBe('Payment authorization started');

    fetchSpy.mockRestore();
  });

  it('batches and flushes HTTP batch sink entries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));

    const httpSink = new HttpBatchSink({
      url: 'https://logs.example.com/ingest',
      batchSize: 2,
    });

    const logger = createLogger({ sinks: [httpSink] });

    logger.info('First message');
    logger.warn('Second message triggering batch flush');

    // Batch size reached, auto flush
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://logs.example.com/ingest');
    const body = JSON.parse(requestInit.body as string);
    expect(body.logs.length).toBe(2);

    fetchSpy.mockRestore();
  });
});
