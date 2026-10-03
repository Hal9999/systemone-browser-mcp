# SystemOne Browser MCP

Standalone MCP server adapting the autonomous browser loop from Cline's `jev-browser`. Playwright observes and operates the page; a configurable `/v1/systemone` backend selects actions. An OpenAI-compatible text model fills non-sensitive text fields. No Cline plugin or Typesafe Gateway key is required.

## Local setup

Requires Node.js 22.18+ (24 recommended), an active SystemOne API and a text model for search/form fields.

```bash
npm ci
npm run install-browser
cp .env.example .env
# Edit .env with your endpoints, keys and loaded text model name.
node --env-file=.env src/index.ts
```

On Linux you may need `npx playwright install --with-deps chromium`.
The transport is **stdio**; stdout is reserved for MCP messages.

## MCP client configuration

Replace the absolute path and values. This standard stdio configuration can be used in clients supporting MCP, including Cline, OpenCode and Unsloth (their configuration wrappers may differ).

```json
{
  "mcpServers": {
    "systemone-browser": {
      "command": "node",
      "args": ["--env-file=/absolute/path/systemone-browser-mcp/.env", "/absolute/path/systemone-browser-mcp/src/index.ts"]
    }
  }
}
```

For a native Windows process, use `http://127.0.0.1:8888` in `.env`. For Docker on Windows, use `http://host.docker.internal:8888`; Unsloth must be reachable from the container.

## Docker

```bash
docker build -t systemone-browser-mcp .
docker run --rm -i --env-file .env systemone-browser-mcp
```

Use `docker` as the MCP command with args `run`, `--rm`, `-i`, `--env-file`, the absolute `.env` path, and `systemone-browser-mcp`. Do not use `-t`: a terminal can corrupt stdio framing.

## Tools

- `browser_run(goal, url?, maxSteps?, minProbability?)`: starts a task and immediately returns a job ID. Supply a starting URL for the first task, such as a search engine or documentation site.
- `browser_status()`: returns running state, trace, outcome and, after the task stops, the current page observation.
- `browser_cancel()`: requests cancellation. Poll status until stopped before starting another task.

There is one browser and one active task per server process. Pages are retained between tasks; browser profiles are ephemeral. Each run has a 100-second browser-loop timeout and 1–60 action budget (default 20), with bounded stale-observation retries. Cancellation is cooperative; an in-flight Playwright call may finish first.

`done_unverified` is a model judgment, not proof of success. The calling agent must verify the returned page evidence. The original REVIEW behavior is retained for sensitive or consequential actions; it returns control to the caller rather than executing them. This is a policy safeguard, not a security sandbox. Only HTTP/HTTPS starting URLs are accepted; network access is not otherwise isolated.

SystemOne responses are checked against the offered actions. Truncated decisions are rejected: large pages may need a narrower goal or smaller observation. Text output must be a single JSON object with a nonempty `text` field. Missing `TEXT_MODEL` stops text entry rather than falling back to a hosted provider.

## Development

```bash
npm run check
npm test
```

Initial validation covers response parsing and TypeScript checks. Real Unsloth compatibility and navigation quality must be tested against your local server; they cannot be verified remotely here. HTTP MCP transport, persistent profiles and browser streaming are not included in this first version.

## Attribution

Adapted from https://github.com/cline/plugins/tree/main/plugins/jev-browser at commit `96bde661f630ec23c1ce0cd86a2361a9959ef65a`. See LICENSE and NOTICE. The upstream repository has Apache-2.0 licensing while the plugin package metadata declares MIT; this discrepancy is recorded rather than silently discarded.
