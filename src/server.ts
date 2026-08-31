import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import type { ProgressEvent, ExtractorOptions } from './types.js';
import { cloneToStaticHtml } from './pipeline.js';
import { sanitizeFileName } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_FILE = path.join(__dirname, 'ui.html');
const REACT_STATUS_FILE = path.join(__dirname, 'react-cloner-status.html');

export interface WebUIOptions {
  port?: number;
  hostname?: string;
}

interface Job {
  id: string;
  status: 'idle' | 'running' | 'done' | 'error';
  events: ProgressEvent[];
  outputDir?: string;
  error?: string;
  subscribers: Array<(event: ProgressEvent) => void>;
}

let activeJob: Job | null = null;

function emit(job: Job, event: ProgressEvent): void {
  job.events.push(event);
  for (const sub of job.subscribers) {
    try {
      sub(event);
    } catch {
      /* listener threw — ignore */
    }
  }
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  spawn(cmd, args as string[], { detached: true, windowsHide: false }).on('error', () => {
    /* best-effort; we also print the URL manually */
  });
}

function optionalInteger(body: Record<string, unknown>, key: string, minimum: number): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`"${key}" must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function optionalBoolean(body: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = body[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') throw new Error(`"${key}" must be a boolean`);
  return value;
}

export function parseCloneOptions(body: unknown): ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body must be an object');
  const input = body as Record<string, unknown>;
  const opts: ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean } = {
    headless: optionalBoolean(input, 'headless', true),
    safeMode: optionalBoolean(input, 'safeMode', false),
    skipDeps: optionalBoolean(input, 'skipDeps', false),
    purge: !optionalBoolean(input, 'noPurge', false),
    keepAnalytics: optionalBoolean(input, 'keepAnalytics', false),
    respectRobots: optionalBoolean(input, 'respectRobots', true),
    priorityOnly: optionalBoolean(input, 'priorityOnly', false),
  };
  const maxPages = optionalInteger(input, 'maxPages', 1);
  const timeout = optionalInteger(input, 'timeout', 1000);
  const maxMemory = optionalInteger(input, 'maxMemory', 0);
  const maxDepth = optionalInteger(input, 'maxDepth', 0);
  if (maxPages !== undefined) opts.maxPages = maxPages;
  if (timeout !== undefined) opts.timeout = timeout;
  if (maxMemory !== undefined) opts.maxMemory = maxMemory;
  if (maxDepth !== undefined) opts.maxDepth = maxDepth;
  return opts;
}

export function startWebUI({ port = 8787, hostname = 'localhost' }: WebUIOptions = {}): void {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    const sendJSON = (status: number, payload: unknown) => {
      const body = JSON.stringify(payload);
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
    };

    // GET /  → UI page
    if (req.method === 'GET' && pathname === '/') {
      void fs.readFile(UI_FILE, 'utf-8').then(
        (content) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        },
        () => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html><body><h1>Uncage UI</h1><p>UI file not found.</p></body></html>');
        }
      );
      return;
    }

    // GET /react-cloner-status → public status page for the paused React exporter
    if (req.method === 'GET' && pathname === '/react-cloner-status') {
      void fs.readFile(REACT_STATUS_FILE, 'utf-8').then(
        (content) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        },
        () => {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html><body><h1>Page not found</h1></body></html>');
        }
      );
      return;
    }

    // GET /api/status → current job state
    if (req.method === 'GET' && pathname === '/api/status') {
      sendJSON(200, activeJob || { status: 'idle' });
      return;
    }

    // POST /api/clone → start a clone job
    if (req.method === 'POST' && pathname === '/api/clone') {
      if (activeJob && activeJob.status === 'running') {
        sendJSON(409, { error: 'A clone job is already running' });
        return;
      }
      let rawBody = '';
      req.on('data', (chunk) => {
        rawBody += chunk;
        if (rawBody.length > 1_000_000) {
          // too large; reject
          rawBody = '';
          void res.destroy();
          sendJSON(413, { error: 'Payload too large' });
        }
      });
      req.on('end', () => {
        let body: any;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          sendJSON(400, { error: 'Invalid JSON body' });
          return;
        }

        const url = typeof body?.url === 'string' ? body.url : '';
        if (!url.trim()) {
          sendJSON(400, { error: 'Missing "url" field' });
          return;
        }

        // Normalize scheme like the CLI
        let target = url.trim();
        if (!target.startsWith('http://') && !target.startsWith('https://')) target = `https://${target}`;
        let outputName = typeof body.outputName === 'string' ? body.outputName : '';
        try {
          const parsedTarget = new URL(target);
          if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') throw new Error('URL must use HTTP or HTTPS');
          outputName = outputName || parsedTarget.hostname;
        } catch {
          sendJSON(400, { error: '"url" must be a valid HTTP or HTTPS URL' });
          return;
        }
        outputName = sanitizeFileName(outputName) || 'cloned-site';

        let opts: ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean };
        try {
          opts = parseCloneOptions(body);
        } catch (error) {
          sendJSON(400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }

        const jobId = `${Date.now()}`;
        const job: Job = {
          id: jobId,
          status: 'running',
          events: [],
          subscribers: [],
        };
        activeJob = job;

        sendJSON(202, { jobId });

        void cloneToStaticHtml(target, outputName, opts, (event) => {
          emit(job, event);
        })
          .then((result) => {
            job.outputDir = result.outputDir;
            job.status = 'done';
            emit(job, { kind: 'done', message: `Done! Output at ${result.outputDir}` });
          })
          .catch((err: any) => {
            job.status = 'error';
            job.error = err instanceof Error ? err.message : String(err);
            emit(job, {
              kind: 'error',
              message: err instanceof Error ? err.message : String(err),
            });
          });
      });
      return;
    }

    // GET /api/events?jobId= → SSE stream
    if (req.method === 'GET' && pathname === '/api/events') {
      const jobId = url.searchParams.get('jobId') || activeJob?.id;
      const job = jobId === activeJob?.id ? activeJob : null;
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active job with that id' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // send a ping to keep the connection alive and establish the stream
      res.write('data: {"kind":"phase","message":"connected"}\n\n');

      // replay buffered events
      for (const event of job.events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      const onEvent = (event: ProgressEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      job.subscribers.push(onEvent);

      req.on('close', () => {
        job.subscribers = job.subscribers.filter((s) => s !== onEvent);
      });
      return;
    }

    // fallback
    sendJSON(404, { error: 'Not found' });
  });

  server.on('error', (err: any) => {
    console.error(`  ❌ Web UI server error: ${err.message}`);
  });

  server.listen(port, hostname, () => {
    const addr = `http://${hostname}:${port}`;
    console.log(`  🎨 Web UI ready at ${addr}`);
    console.log('  🚀 Tip: paste a URL and click "Clone" to get started.');
    openBrowser(addr);
  });
}
