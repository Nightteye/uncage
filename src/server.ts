import http from 'http';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';
import type { ProgressEvent, ExtractorOptions } from './types.js';
import { cloneToStaticHtml } from './pipeline.js';
import { sanitizeFileName } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, 'ui');
const UI_FILE = path.join(UI_DIR, 'index.html');
const REACT_STATUS_FILE = path.join(UI_DIR, 'react-cloner-status.html');
const TOS_FILE = path.join(UI_DIR, 'tos.html');
const CHANGELOG_FILE = path.join(UI_DIR, 'changelog.html');
const BG_VIDEO_FILE = path.join(UI_DIR, 'bg.mp4');
const BG2_VIDEO_FILE = path.join(UI_DIR, 'bg2.mp4');

export interface WebUIOptions {
  port?: number;
  hostname?: string;
}

let nextPreviewPort = 7000;

const PREVIEW_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};

function startPreviewServer(dir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        let pathname = decodeURIComponent(reqUrl.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';

        let filepath = path.join(dir, pathname);
        const resolvedDir = path.resolve(dir);
        if (!path.resolve(filepath).startsWith(resolvedDir)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }

        let stat: any;
        try {
          stat = await fs.stat(filepath);
          if (stat.isDirectory()) {
            filepath = path.join(filepath, 'index.html');
            stat = await fs.stat(filepath);
          }
        } catch {
          // 1. Try appending .html for clean routes
          try {
            const htmlPath = filepath + '.html';
            stat = await fs.stat(htmlPath);
            filepath = htmlPath;
          } catch {
            // 2. Universal hashed module resolution:
            // If requesting unhashed or mismatched module (e.g. foo.mjs), find foo-[hash].js/mjs
            try {
              const fileDir = path.dirname(filepath);
              const { name } = path.parse(filepath);
              const entries = await fs.readdir(fileDir);
              const fuzzyMatch = entries.find(
                (f) => f.startsWith(name + '-') || f.startsWith(name + '.')
              );
              if (fuzzyMatch) {
                const candidate = path.join(fileDir, fuzzyMatch);
                stat = await fs.stat(candidate);
                filepath = candidate;
              } else {
                throw new Error('Not found');
              }
            } catch {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              return res.end('Not found');
            }
          }
        }

        const ext = path.extname(filepath).toLowerCase();
        const contentType = PREVIEW_MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Access-Control-Allow-Origin': '*',
        });
        const stream = createReadStream(filepath);
        stream.pipe(res);
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    function tryListen(port: number) {
      if (port > 7099) return reject(new Error('No available ports in 7000-7099 range'));
      srv.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      srv.listen(port, () => {
        nextPreviewPort = port + 1;
        resolve(port);
      });
    }

    tryListen(nextPreviewPort);
  });
}

interface Job {
  id: string;
  url: string;
  outputName: string;
  status: 'queued' | 'running' | 'done' | 'error';
  events: ProgressEvent[];
  outputDir?: string | undefined;
  previewUrl?: string | undefined;
  error?: string | undefined;
  subscribers: Array<(event: ProgressEvent) => void>;
}

const jobs = new Map<string, Job>();
const JOBS_STORAGE_FILE = path.join(process.cwd(), 'output', '.jobs.json');

async function saveJobsToDisk(): Promise<void> {
  try {
    const dir = path.join(process.cwd(), 'output');
    await fs.mkdir(dir, { recursive: true });
    const serializable = Array.from(jobs.values()).map((j) => ({
      id: j.id,
      url: j.url,
      outputName: j.outputName,
      status: j.status === 'running' || j.status === 'queued' ? 'error' : j.status,
      outputDir: j.outputDir,
      previewUrl: j.previewUrl,
      error: j.status === 'running' || j.status === 'queued' ? 'Interrupted by server restart' : j.error,
      events: j.events.slice(-30),
    }));
    await fs.writeFile(JOBS_STORAGE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch {
    /* non-blocking best-effort */
  }
}

async function loadJobsFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(JOBS_STORAGE_FILE, 'utf-8');
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item.id || !item.url) continue;
        let previewUrl: string | undefined = item.previewUrl || undefined;
        if (item.status === 'done' && item.outputDir) {
          try {
            const st = await fs.stat(item.outputDir);
            if (st.isDirectory()) {
              const port = await startPreviewServer(item.outputDir);
              previewUrl = `http://localhost:${port}`;
            } else {
              continue;
            }
          } catch {
            continue;
          }
        }
        const job: Job = {
          id: item.id,
          url: item.url,
          outputName: item.outputName || 'cloned-site',
          status: item.status,
          events: Array.isArray(item.events) ? item.events : [],
          outputDir: item.outputDir || undefined,
          previewUrl,
          error: item.error || undefined,
          subscribers: [],
        };
        jobs.set(job.id, job);
      }
    }
  } catch {
    /* file may not exist yet */
  }

  try {
    const baseOutputDir = path.join(process.cwd(), 'output');
    const entries = await fs.readdir(baseOutputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const folderPath = path.join(baseOutputDir, entry.name);
        const existing = Array.from(jobs.values()).find((j) => j.outputName === entry.name);
        if (!existing) {
          try {
            await fs.stat(path.join(folderPath, 'index.html'));
            const port = await startPreviewServer(folderPath);
            const restoredId = `restored-${entry.name}`;
            const restoredJob: Job = {
              id: restoredId,
              url: `https://${entry.name}`,
              outputName: entry.name,
              status: 'done',
              outputDir: folderPath,
              previewUrl: `http://localhost:${port}`,
              events: [
                {
                  kind: 'done',
                  message: `Export restored! Preview running at http://localhost:${port}`,
                  previewUrl: `http://localhost:${port}`,
                },
              ],
              subscribers: [],
            };
            jobs.set(restoredId, restoredJob);
          } catch {
            /* no index.html */
          }
        }
      }
    }
  } catch {
    /* output dir may not exist yet */
  }
}

const MAX_CONCURRENT_JOBS = 3;
let runningJobsCount = 0;
const jobQueue: Array<() => void> = [];

function processNextQueueItem(): void {
  if (runningJobsCount >= MAX_CONCURRENT_JOBS || jobQueue.length === 0) return;
  const next = jobQueue.shift();
  if (next) {
    runningJobsCount++;
    next();
  }
}

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

export async function startWebUI({ port = 8787, hostname = 'localhost' }: WebUIOptions = {}): Promise<void> {
  await loadJobsFromDisk();
  const server = http.createServer(async (req, res) => {
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

    if (req.method === 'GET' && pathname === '/tos') {
      void fs.readFile(TOS_FILE, 'utf-8').then(
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

    if (req.method === 'GET' && pathname === '/changelog') {
      void fs.readFile(CHANGELOG_FILE, 'utf-8').then(
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

    if (req.method === 'GET' && (pathname === '/bg.mp4' || pathname === '/bg2.mp4')) {
      const file = pathname === '/bg.mp4' ? BG_VIDEO_FILE : BG2_VIDEO_FILE;
      const stat = fs.stat(file);
      stat.then(
        (s) => {
          res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': s.size });
          const stream = createReadStream(file);
          stream.pipe(res);
        },
        () => {
          const body = JSON.stringify({ error: 'Video not found' });
          res.writeHead(404, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
          res.end(body);
        }
      );
      return;
    }

    // GET /api/status → current job state or list of all jobs
    if (req.method === 'GET' && pathname === '/api/status') {
      const jobId = url.searchParams.get('jobId');
      if (jobId) {
        const job = jobs.get(jobId);
        if (!job) {
          sendJSON(404, { error: 'Job not found' });
          return;
        }
        sendJSON(200, {
          id: job.id,
          url: job.url,
          outputName: job.outputName,
          status: job.status,
          outputDir: job.outputDir,
          previewUrl: job.previewUrl,
          error: job.error,
          events: job.events.slice(-20),
        });
        return;
      }
      const allJobs = Array.from(jobs.values()).map((j) => ({
        id: j.id,
        url: j.url,
        outputName: j.outputName,
        status: j.status,
        outputDir: j.outputDir,
        previewUrl: j.previewUrl,
        error: j.error,
        events: j.events.slice(-20),
      }));
      sendJSON(200, allJobs);
      return;
    }

    // GET /api/download?jobId=... or ?folder=... → stream zip archive of cloned site
    if (req.method === 'GET' && pathname === '/api/download') {
      const jobId = url.searchParams.get('jobId');
      const folderParam = url.searchParams.get('folder');
      let targetDir = '';
      let zipName = 'exported-site.zip';

      if (jobId && jobs.has(jobId)) {
        const job = jobs.get(jobId)!;
        if (job.outputDir) {
          targetDir = job.outputDir;
          zipName = `${job.outputName || 'exported-site'}.zip`;
        }
      } else if (folderParam) {
        const safeFolder = sanitizeFileName(folderParam);
        const resolved = path.join(process.cwd(), 'output', safeFolder);
        const baseOutputDir = path.join(process.cwd(), 'output');
        if (path.resolve(resolved).startsWith(path.resolve(baseOutputDir))) {
          targetDir = resolved;
          zipName = `${safeFolder}.zip`;
        }
      }

      if (!targetDir) {
        sendJSON(400, { error: 'Valid "jobId" or "folder" required' });
        return;
      }

      try {
        const stat = await fs.stat(targetDir);
        if (!stat.isDirectory()) {
          sendJSON(404, { error: 'Folder not found' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
        });

        const archive = new ZipArchive({
          zlib: { level: 6 },
        });

        archive.on('error', (err: Error) => {
          console.error(`  ⚠️ Archive streaming error: ${err.message}`);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });

        archive.pipe(res);
        archive.directory(targetDir, false);
        await archive.finalize();
      } catch {
        sendJSON(404, { error: 'Output folder not found on disk' });
      }
      return;
    }

    // POST /api/clone → start or queue a clone job
    if (req.method === 'POST' && pathname === '/api/clone') {
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

        const urlInput = typeof body?.url === 'string' ? body.url : '';
        if (!urlInput.trim()) {
          sendJSON(400, { error: 'Missing "url" field' });
          return;
        }

        // Normalize scheme like the CLI
        let target = urlInput.trim();
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

        // Deduplicate outputName if a job is already using this output folder name
        let finalOutputName = outputName;
        let suffix = 2;
        const inUseOutputNames = new Set(
          Array.from(jobs.values())
            .filter((j) => j.status === 'running' || j.status === 'queued')
            .map((j) => j.outputName)
        );
        while (inUseOutputNames.has(finalOutputName)) {
          finalOutputName = `${outputName}-${suffix++}`;
        }

        let opts: ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean };
        try {
          opts = parseCloneOptions(body);
        } catch (error) {
          sendJSON(400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }

        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const job: Job = {
          id: jobId,
          url: target,
          outputName: finalOutputName,
          status: 'queued',
          events: [],
          subscribers: [],
        };
        jobs.set(jobId, job);
        void saveJobsToDisk();

        sendJSON(202, { jobId, outputName: finalOutputName });

        const executeJob = () => {
          job.status = 'running';
          void saveJobsToDisk();
          emit(job, { kind: 'phase', message: `Starting export for ${target}` });

          void cloneToStaticHtml(target, finalOutputName, opts, (event) => {
            emit(job, event);
          })
            .then(async (result) => {
              job.outputDir = result.outputDir;
              job.status = 'done';
              let previewUrl = '';
              try {
                const port = await startPreviewServer(result.outputDir);
                previewUrl = `http://localhost:${port}`;
                job.previewUrl = previewUrl;
              } catch (err: any) {
                console.error(`  ⚠️ Could not start preview server: ${err.message}`);
              }

              emit(job, {
                kind: 'done',
                message: previewUrl
                  ? `Clone complete! Preview running at ${previewUrl}`
                  : `Done! Output at ${result.outputDir}`,
                previewUrl: previewUrl || undefined,
              });
              void saveJobsToDisk();

              console.log(`\n  ✅ [Web UI] Export complete for ${target}!`);
              console.log(`  📁 Files saved to: ${result.outputDir}`);
              if (previewUrl) {
                console.log(`  🌐 Live preview: ${previewUrl}`);
              }
              console.log(`  🚀 Manual preview: cd output/${finalOutputName} && npm run preview\n`);
            })
            .catch((err: any) => {
              job.status = 'error';
              job.error = err instanceof Error ? err.message : String(err);
              emit(job, {
                kind: 'error',
                message: err instanceof Error ? err.message : String(err),
              });
              void saveJobsToDisk();
              console.error(`\n  ❌ [Web UI] Export failed for ${target}: ${job.error}\n`);
            })
            .finally(() => {
              runningJobsCount--;
              processNextQueueItem();
            });
        };

        if (runningJobsCount < MAX_CONCURRENT_JOBS) {
          runningJobsCount++;
          executeJob();
        } else {
          jobQueue.push(executeJob);
          emit(job, { kind: 'phase', message: 'Job queued — waiting for an available worker slot' });
        }
      });
      return;
    }

    // GET /api/events?jobId= → SSE stream for specific job
    if (req.method === 'GET' && pathname === '/api/events') {
      const jobId = url.searchParams.get('jobId');
      const job = jobId ? jobs.get(jobId) : null;
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No job with that id' }));
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
