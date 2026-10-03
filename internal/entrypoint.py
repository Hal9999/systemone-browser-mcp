"""Supervise the CPU Laya HTTP backend and MCP stdio process."""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

def emit(event, **fields):
    print(json.dumps({"event": event, **fields}), file=sys.stderr, flush=True)

def main():
    env = os.environ.copy()
    env.update(LAYA_DEVICE="cpu", LAYA_MODELS="multilingual", LAYA_DEFAULT_MODEL="multilingual",
               LAYA_PRELOAD="1", LAYA_HOST="127.0.0.1", LAYA_PORT="8000", USE_TF="0")
    # Private loopback service; no external Unsloth key is needed.
    env.pop("LAYA_API_KEY", None)
    env.update(SYSTEMONE_URL="http://127.0.0.1:8000/v1/systemone", SYSTEMONE_MODEL="multilingual",
               SYSTEMONE_MAX_LEN="8192", SYSTEMONE_HEAD_MAX_LEN=env.get("SYSTEMONE_HEAD_MAX_LEN", "2048"))
    env.pop("SYSTEMONE_API_KEY", None)
    children = []
    stopping = False
    def stop(*_):
        nonlocal stopping
        stopping = True
        for child in children:
            if child.poll() is None:
                child.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        emit("internal_laya.starting", device="cpu", model="multilingual", maxLen=8192, headMaxLen=env["SYSTEMONE_HEAD_MAX_LEN"])
        backend = subprocess.Popen(["/opt/laya/bin/python", "internal/serve.py"], env=env, stdout=sys.stderr, stderr=sys.stderr)
        children.append(backend)
        deadline = time.monotonic() + int(env.get("LAYA_STARTUP_TIMEOUT", "900"))
        while not stopping:
            if backend.poll() is not None:
                raise RuntimeError("Internal Laya exited during startup")
            try:
                with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Internal Laya startup timed out")
                time.sleep(0.5)
        if stopping:
            return 0
        emit("internal_laya.ready")
        mcp = subprocess.Popen(["node", "src/index.ts"], env=env)
        children.append(mcp)
        while not stopping and mcp.poll() is None:
            if backend.poll() is not None:
                raise RuntimeError("Internal Laya exited while MCP was running")
            time.sleep(0.2)
        return mcp.returncode or 0
    except Exception as exc:
        emit("internal_laya.failed", error=str(exc))
        return 1
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()

if __name__ == "__main__":
    sys.exit(main())
