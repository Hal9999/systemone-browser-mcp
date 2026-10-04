import { createScreenshots } from './screenshots.ts';
import { log, logContext } from './logger.ts';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runJev } from './jev-run.ts';
import { observe } from './jev-browser.ts';

const server = new McpServer({ name: 'systemone-browser-mcp', version: '0.1.0' });
let browser: Browser | undefined;
let page: Page | undefined;
let job: { id: string; running: boolean; controller: AbortController; result?: unknown; trace: unknown[]; screenshots: string[] } | undefined;
const output = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
function validateUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  return url.href;
}
async function ensurePage() {
  if (!browser) {
    log('info', 'browser.starting');
    browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false });
    page = await context.newPage();
    context.on('page', newPage => { page = newPage; });
    log('info', 'browser.ready');
  }
  if (!page || page.isClosed()) page = await browser.newPage();
  return page;
}
server.registerTool('browser_run', {
  description: 'Start an autonomous browser task using SystemOne. Returns a job ID immediately; poll browser_status. Completion is unverified: inspect returned page evidence. One task at a time.',
  inputSchema: { goal: z.string().min(1).max(12000), url: z.string().url().optional(), maxSteps: z.number().int().min(1).max(60).default(20), minProbability: z.number().min(0).max(1).optional() }
}, async ({ goal, url, maxSteps, minProbability }) => {
  if (job?.running) return { ...output({ error: 'A task is already running.', jobId: job.id }), isError: true };
  const startUrl = url ? validateUrl(url) : undefined;
  const id = randomUUID();
  const screenshots = createScreenshots(id);
  const current = { screenshots: screenshots.files, id, running: true, controller: new AbortController(), trace: [] as unknown[], result: undefined as unknown };
  job = current;
  log('info', 'job.started', { jobId: current.id, maxSteps });
  void logContext.run({ jobId: current.id }, async () => {
    try {
      const active = await ensurePage();
      current.controller.signal.throwIfAborted();
      if (startUrl) {
        log('info', 'navigation.started', { host: new URL(startUrl).host });
        await active.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        log('info', 'navigation.completed');
      }
      current.controller.signal.throwIfAborted();
      await screenshots.capture(page, 'initial');
      current.result = await runJev({ goal, maxSteps, minProbability }, { page: () => page!, signal: current.controller.signal, onStep: async step => { current.trace.push(step); if (['decision', 'executed', 'stale'].includes(step.status)) await screenshots.capture(page, `step-${step.step}-${step.status}-${step.operation}`); log('info', 'browser.step', { step: step.step, operation: step.operation, status: step.status, probability: step.probability, latencyMs: step.latencyMs }); } });
    } catch (error) { log('error', 'browser.initialization_failed', { errorType: error instanceof Error ? error.name : 'UnknownError' }); current.result = { status: 'interrupted', message: 'Browser initialization or navigation failed. Check browser installation and URL.' }; }
    finally { await screenshots.capture(page, 'final'); current.running = false; const result = current.result as any; log(result?.failure ? 'error' : 'info', 'job.finished', { status: result?.status, failure: result?.failure, elapsedMs: result?.elapsedMs }); }
  });
  return output({ jobId: current.id, running: true });
});
server.registerTool('browser_status', { description: 'Get task trace and, once stopped, current page evidence to verify results.', inputSchema: {} }, async () => {
  let observation: unknown;
  if (page && !page.isClosed() && !job?.running) {
    const snapshot = await observe(page, AbortSignal.timeout(10000));
    try { observation = snapshot.data; } finally { await snapshot.dispose(); }
  }
  return output({ jobId: job?.id, running: job?.running ?? false, trace: job?.trace, screenshots: job?.screenshots, result: job?.result, observation });
});
server.registerTool('browser_cancel', { description: 'Request cancellation of the current task. Poll status until running is false.', inputSchema: {} }, async () => {
  log('info', 'job.cancel_requested', { jobId: job?.id });
  job?.controller.abort();
  return output({ jobId: job?.id, cancellationRequested: !!job?.running });
});
async function shutdown() { log('info', 'server.stopping'); job?.controller.abort(); await browser?.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await server.connect(new StdioServerTransport());

log('info', 'server.ready', { transport: 'stdio', version: '0.1.0' });
