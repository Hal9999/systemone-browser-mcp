"""Use the official HTTP routes with the requested standalone multilingual repo."""
import os
import torch
import uvicorn
from laya import Router
from laya.serve import create_app

if os.environ.get('LAYA_THREADS'):
    torch.set_num_threads(int(os.environ['LAYA_THREADS']))
router = Router(models={'multilingual': 'convaiinnovations/laya-multilingual'},
                device='cpu', default='multilingual', max_loaded=1,
                auto_task_detection=False)
router.preload(['multilingual'])
uvicorn.run(create_app(router), host='127.0.0.1', port=8000,
            log_level=os.environ.get('LAYA_LOG_LEVEL', 'info'))
