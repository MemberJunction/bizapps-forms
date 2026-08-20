import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { readCappedBody, sendJsonError, type ReadableRequest, type JsonErrorResponse } from '../request-body';

/** A request stub: an emitter plus headers, which is all the reader touches. */
function requestStub(headers: Record<string, string> = {}): EventEmitter & ReadableRequest {
  const emitter = new EventEmitter() as EventEmitter & ReadableRequest;
  emitter.headers = headers;
  return emitter;
}

/** Records what was sent so the assertions can read status + body back. */
function responseStub(headersSent = false): JsonErrorResponse & { sent: { status?: number; body?: unknown } } {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    headersSent,
    sent,
    status(code: number) {
      sent.status = code;
      return res;
    },
    set() {
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return res;
}

describe('readCappedBody', () => {
  it('concatenates the streamed chunks in order', async () => {
    const req = requestStub();
    const pending = readCappedBody(req, 1024);
    req.emit('data', Buffer.from('hello '));
    req.emit('data', Buffer.from('world'));
    req.emit('end');

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.body?.toString()).toBe('hello world');
  });

  it('rejects on Content-Length alone, before a byte is read', async () => {
    // The cheap gate. Without it a hostile client with an honest header still gets to stream
    // the whole oversized body into memory before being told no.
    const req = requestStub({ 'content-length': '5000' });
    let dataListenerAttached = false;
    req.on('newListener', (event: string) => {
      if (event === 'data') dataListenerAttached = true;
    });

    const result = await readCappedBody(req, 1024);

    expect(result).toEqual({ ok: false, status: 413, error: 'Upload exceeds the maximum size of 1024 bytes.' });
    expect(dataListenerAttached).toBe(false);
  });

  it('aborts mid-stream once the cap trips, and stops buffering', async () => {
    // A lying Content-Length (or a chunked body with none) has to be caught here instead.
    const req = requestStub();
    const pending = readCappedBody(req, 8);
    req.emit('data', Buffer.from('12345'));
    req.emit('data', Buffer.from('67890'));

    const result = await pending;
    expect(result.status).toBe(413);

    // Anything arriving after the abort must be dropped, not accumulated — the whole point of
    // the cap is that memory stays bounded even when the client keeps sending.
    expect(() => req.emit('data', Buffer.alloc(1_000_000))).not.toThrow();
    req.emit('end');
    await expect(pending).resolves.toEqual(result);
  });

  it('reports a stream error as a 400 rather than rejecting', async () => {
    const req = requestStub();
    const pending = readCappedBody(req, 1024);
    req.emit('error', new Error('socket hang up'));

    await expect(pending).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Failed to read request body: socket hang up',
    });
  });

  it('ignores an unparseable Content-Length and falls through to the streamed cap', async () => {
    const req = requestStub({ 'content-length': 'not-a-number' });
    const pending = readCappedBody(req, 4);
    req.emit('data', Buffer.from('too long'));

    await expect(pending).resolves.toMatchObject({ ok: false, status: 413 });
  });

  it('returns an empty buffer for an empty body', async () => {
    const req = requestStub();
    const pending = readCappedBody(req, 16);
    req.emit('end');

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.body?.length).toBe(0);
  });
});

describe('sendJsonError', () => {
  it('sends the status and a JSON error body', () => {
    const res = responseStub();
    sendJsonError(res, 415, 'Nope.');
    expect(res.sent).toEqual({ status: 415, body: { error: 'Nope.' } });
  });

  it('is a no-op once the response has started', () => {
    // Writing a second time throws ERR_HTTP_HEADERS_SENT and takes down the request handler,
    // which is exactly the situation an error path must not create.
    const res = responseStub(true);
    sendJsonError(res, 500, 'Too late.');
    expect(res.sent).toEqual({});
  });
});
