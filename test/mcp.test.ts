import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('stdio MCP initializes, lists tools and returns idle state', async () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.ts'] }));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name).sort(), ['browser_cancel', 'browser_run', 'browser_status']);
    const state = await client.callTool({ name: 'browser_status', arguments: {} });
    assert.equal(JSON.parse((state.content as any[])[0].text).running, false);
    const missingUrl = await client.callTool({ name: 'browser_run', arguments: { goal: 'Go to subito.it' } });
    assert.equal(missingUrl.isError, true);
    assert.equal(JSON.parse((missingUrl.content as any[])[0].text).error, 'url_required');
  } finally { await client.close(); }
});
