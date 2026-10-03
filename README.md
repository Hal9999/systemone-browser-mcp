# internal-laya branch

This branch embeds the official Laya HTTP runtime inside the MCP container. Decisions run on CPU using only the multilingual checkpoint (`convaiinnovations/laya-multilingual`, loaded explicitly from the requested standalone repository). Text generation still uses your configured OpenAI-compatible endpoint.

Every decision explicitly sends `max_len=8192`. `head_max_len=2048` increases the shared question/option budget from 256 tokens and is configurable. These are maximum budgets, not padding lengths or a guarantee of navigation accuracy. The SDK can still shorten inputs/options beyond these budgets.

```powershell
git switch internal-laya
git pull
docker build -t systemone-browser-mcp:internal-laya .
docker run --rm -i --env-file .env -v laya-cache:/home/node/.cache/huggingface systemone-browser-mcp:internal-laya
```

Update the MCP client's Docker image argument to `systemone-browser-mcp:internal-laya`. Add `-v`, `laya-cache:/home/node/.cache/huggingface` to its Docker args to retain downloaded weights between runs. The existing `.env` can retain old SystemOne values: the entrypoint overrides them for internal decisions. Keep `OPENAI_API_KEY` explicitly set for Unsloth text generation.

The first connection downloads and loads the model before MCP starts; it may exceed the client's connection timeout. Run the command above manually once to warm the cache, then stop it and connect from your client. No host port mapping is required. Laya listens only on container loopback. Its logs go to stderr alongside MCP diagnostics. `tini` and the Python supervisor stop both processes on container shutdown; the MCP process inherits stdin/stdout directly.

CPU threads default to PyTorch's setting. Set `LAYA_THREADS` to an appropriate physical-core count (example: 6). Full-length CPU requests may take longer: the browser run timeout defaults to 300 seconds on this branch, configurable through `RUN_TIMEOUT_MS`. Startup/download timeout is 900 seconds, configurable through `LAYA_STARTUP_TIMEOUT`.

Dependencies: CPU PyTorch 2.8.0, Laya 0.3.26. Weights are fetched at first startup, not embedded into the image. This branch's Docker build and real model inference require local validation; TypeScript, protocol and unit checks are separate.

---

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

## Docker logs

Structured JSON logs go to **stderr**. MCP protocol messages remain on stdout. Logs contain timestamps, event names, job IDs, action types, HTTP status and latency. They exclude API keys, request/response bodies, goals, page text, field values and target labels. Endpoint query strings and credentials are omitted.

Set `LOG_LEVEL=info` (default), `debug`, `warn`, `error` or `silent` in `.env`. Debug adds SystemOne truncation/token-count metadata without dumping content.

```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Image}}"
docker logs -f --tail 100 CONTAINER_ID
```

Docker logs may include stdout MCP responses (which contain page content) as well as stderr. To view only the application's diagnostic stderr in PowerShell:

```powershell
docker logs -f --tail 100 CONTAINER_ID 1>$null
```

With `--rm`, Docker removes the container and its logs when it exits. Inspect logs while the MCP connection is active. For manual diagnosis, omit `--rm` and optionally give the container a name; remove it afterwards.
