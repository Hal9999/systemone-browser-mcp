"""Use the official HTTP routes with the requested standalone multilingual repo."""
import os
import torch
import uvicorn
from laya import Router
from laya.serve import create_app

import json
import sys
import uuid
from datetime import datetime, timezone


class SystemOneDebugLogging:
    """Capture HTTP bodies without changing the ASGI request/response stream."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (os.environ.get('LOG_LEVEL', 'info').lower() != 'debug'
                or scope['type'] != 'http'
                or scope.get('path') != '/v1/systemone'):
            return await self.app(scope, receive, send)

        request_id = str(uuid.uuid4())
        request_body = bytearray()
        response_body = bytearray()
        status = None

        def emit(event, body, **fields):
            raw = bytes(body).decode('utf-8', errors='replace')
            try:
                payload = json.loads(raw)
            except ValueError:
                payload = raw
            print(json.dumps({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'level': 'debug', 'event': event, 'requestId': request_id,
                'method': scope['method'], 'path': scope['path'],
                **fields, 'body': payload,
            }, ensure_ascii=False), file=sys.stderr, flush=True)

        async def logged_receive():
            message = await receive()
            if message['type'] == 'http.request':
                request_body.extend(message.get('body', b''))
                if not message.get('more_body', False):
                    emit('systemone.request', request_body)
            return message

        async def logged_send(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
            elif message['type'] == 'http.response.body':
                response_body.extend(message.get('body', b''))
                if not message.get('more_body', False):
                    emit('systemone.response', response_body, status=status)
            await send(message)

        try:
            await self.app(scope, logged_receive, logged_send)
        except Exception as exc:
            print(json.dumps({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'level': 'debug', 'event': 'systemone.error',
                'requestId': request_id, 'errorType': type(exc).__name__,
            }), file=sys.stderr, flush=True)
            raise

if os.environ.get('LAYA_THREADS'):
    torch.set_num_threads(int(os.environ['LAYA_THREADS']))
router = Router(models={'multilingual': 'convaiinnovations/laya-multilingual'},
                device='cpu', default='multilingual', max_loaded=1,
                auto_task_detection=False)
router.preload(['multilingual'])
uvicorn.run(SystemOneDebugLogging(create_app(router)), host='127.0.0.1', port=8000,
            log_level=os.environ.get('LAYA_LOG_LEVEL', 'info'))
