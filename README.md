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

There is one browser and one active task per server process. Pages are retained between tasks; browser profiles are ephemeral. Each run has a browser-loop timeout of 100 seconds by default (configurable with `RUN_TIMEOUT_MS`) and 1–60 action budget (default 20), with bounded stale-observation retries. Cancellation is cooperative; an in-flight Playwright call may finish first.

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

Logs go to **stderr** (JSON by default, or a readable colored format). MCP protocol messages remain on stdout. Logs contain timestamps, event names, job IDs, action types, HTTP status and latency. At info level they exclude API keys, request/response bodies, goals, page text, field values and target labels. Endpoint query strings and credentials are omitted.

Set `LOG_LEVEL=info` (default), `debug`, `warn`, `error` or `silent` in `.env`. Debug adds SystemOne token-count metadata and full request/response JSON bodies, correlated by `requestId`, including JSON error responses. This is logged by the MCP HTTP client, so it also works with an external SystemOne server. Authorization headers are never logged; payloads contain goals and page content. Debug also logs text-generation prompts and complete JSON responses as `text_helper.request` and `text_helper.response`, correlated by `requestId`; authorization headers are omitted.

```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Image}}"
docker logs -f --tail 100 CONTAINER_ID
```

Docker logs may include stdout MCP responses (which contain page content) as well as stderr. To view only the application's diagnostic stderr in PowerShell:

```powershell
docker logs -f --tail 100 CONTAINER_ID 1>$null
```

With `--rm`, Docker removes the container and its logs when it exits. Inspect logs while the MCP connection is active. For manual diagnosis, omit `--rm` and optionally give the container a name; remove it afterwards.

## Compose shortcut

```bash
docker compose build
docker compose run --rm -T browser
```

Compose loads `.env`, uses external SystemOne and OpenAI-compatible text endpoints, and bind-mounts `./artifacts:/app/artifacts`. Use `run`, not `up -d`, because MCP needs stdin/stdout. No model is installed or started inside the container.

For an MCP client, use command `docker` with arguments:

```json
["compose", "--project-directory", "C:/absolute/path/systemone-browser-mcp", "-f", "C:/absolute/path/systemone-browser-mcp/compose.yaml", "run", "--rm", "-T", "browser"]
```

`SYSTEMONE_URL`, `SYSTEMONE_API_KEY` and `SYSTEMONE_MODEL` configure decisions; `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `TEXT_MODEL` configure text generation. Optional `SYSTEMONE_MAX_LEN` and `SYSTEMONE_HEAD_MAX_LEN` are forwarded only when set; supported limits depend on the external backend.

## Optional screenshots

Set `SCREENSHOTS_ENABLED=true` in `.env` and reconnect the MCP container. The default is disabled. Compose bind-mounts `./artifacts` from the project directory at `/app/artifacts`; screenshots are regular local files, not a Docker volume.

Each task creates `artifacts/JOB_ID/` with numbered viewport PNGs: initial page, decisions (including terminal decisions), executed actions, stale observations and final page. The executed image is taken immediately after the action; the next decision image shows the later rendered page. `browser_status` lists paths relative to the artifacts directory. Logs include `screenshot.saved` or `screenshot.failed`. Capture failures warn without interrupting navigation.

Existing `.env` files are not replaced by Git: add `SCREENSHOTS_ENABLED=true` manually. With plain Docker, add `-v ABSOLUTE_LOCAL_ARTIFACTS_PATH:/app/artifacts`. On Linux, the bind directory must be writable by container user `node` (UID 1000); on Docker Desktop, use a shared writable directory. Screenshots can contain visible personal data and are not redacted. Screenshot capture is bounded to five seconds per image and adds some latency. No video or trace is enabled by this option.

## Compact decision representation

SystemOne choice criteria are short semantic strings keyed by stable action IDs (for example `CLICK:15`). Instructions are a string compatible with Ollama decision models. The decision state includes page text, title, normalized page address, selected options, offscreen hints and recent actions, without duplicating actionable targets. Descriptions preserve control values and selection/expansion state. Link destinations appear only for ambiguous or duplicate labels and contain host/path without query strings or fragments. Original targets and URLs remain in the local action map for execution and in browser evidence; model descriptions never become selectors. The text helper continues to use its OpenAI-compatible endpoint.

## Candidate limits

Each SystemOne choice question contains at most 26 candidates by default (`SYSTEMONE_MAX_CANDIDATES`, integer 9–26). The first round evaluates up to the limit. Each later round carries the eight highest-probability options from the immediately preceding round and adds up to `limit - 8` new candidates. The last round selects the action directly; there is no extra winners-only final. All initial candidates are offered at least once. Probabilities are ranked only within one response, never compared across groups; complete valid probabilities are required for intermediate rounds. This is approximate selection and adds inference calls. The final probability is conditional on the last candidate set, not globally calibrated. All rounds share the run timeout and existing observation freshness checks.

## Colored logs

Set `LOG_FORMAT=pretty` and `LOG_COLOR=always` in `.env`, then reconnect the MCP container. Pretty logs show timestamps, colored levels (debug cyan, info green, warnings yellow, errors red), event names, inline scalar fields and indented object payloads. Stdout remains reserved for MCP.

`LOG_COLOR=auto` enables colors only when stderr is a terminal and `NO_COLOR` is unset; `never` disables colors. Use `always` for `docker logs -f` because MCP containers have no TTY. Some log viewers may not render ANSI colors; use `never` there. `LOG_FORMAT=json` restores single-line JSON without ANSI codes regardless of the color setting. Existing `.env` files must be updated manually.

## Text field generation

The text helper receives only the user goal, selected field label/role/current value/option, page title and selected options. Other targets, target IDs, page links, full page text and action history are excluded. It returns only the value for that field. Decision selection and original Playwright targets remain separate. `LOG_LEVEL=debug` exposes the actual prompts and JSON responses; this can include entered text and goal content.
