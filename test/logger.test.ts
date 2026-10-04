import { test } from 'node:test';
import assert from 'node:assert/strict';
import { log, logContext } from '../src/logger.ts';
test('pretty logs color stderr only, retain debug bodies and support plain JSON', () => {
  const saved = {...process.env};
  const write = process.stderr.write;
  const lines: string[] = [];
  try {
    process.stderr.write = ((chunk: any) => { lines.push(String(chunk)); return true; }) as typeof write;
    Object.assign(process.env, {LOG_LEVEL:'debug', LOG_FORMAT:'pretty', LOG_COLOR:'always'});
    logContext.run({jobId:'job'}, () => log('warn', 'sample', {status:422, body:{error:'test'}}));
    assert.match(lines[0], /\x1b\[33mWARN/);
    assert.match(lines[0], /jobId=/);
    assert.match(lines[0], /error/);
    process.env.LOG_COLOR = 'never';
    log('info', 'plain');
    assert.ok(!lines[1].includes('\x1b'));
    process.env.LOG_COLOR = 'auto'; process.env.NO_COLOR = '1';
    log('info', 'no-color');
    assert.ok(!lines[2].includes('\x1b'));
    process.env.LOG_FORMAT = 'json'; process.env.LOG_COLOR = 'always';
    log('debug', 'structured', {body:{test:true}});
    assert.deepEqual(JSON.parse(lines[3]).body, {test:true});
    process.env.LOG_LEVEL = 'error';
    log('debug','filtered');
    assert.equal(lines.length,4);
  } finally {
    process.stderr.write = write;
    for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key];
    Object.assign(process.env,saved);
  }
});
