import asyncio
import httpx
from bullmq import Worker
from config import settings
from jobs.factory import get_handler
from db.client import load_dataset


async def process_job(job, token):
    payload  = job.data
    job_id   = payload["job_id"]
    model_id = payload["model_id"]

    await notify_node(job_id, {"status": "running", "progress": 0})

    try:
        model_type = payload.get("model_type", "classification")
        if model_type == "regression":
            mode = "regression"
        elif model_type == "exploratory":
            mode = "exploratory"
        else:
            mode = "classification"

        X, y, x_axis = await load_dataset(
            payload["dataset_id"],
            payload.get("selected_vars"),
            mode=mode,
            target_property=payload.get("target_property"),
        )

        await notify_node(job_id, {"status": "running", "progress": 20})

        handler = get_handler(payload["algorithm"])

        result = handler.train(
            X=X, y=y,
            params={
                "hyperparameters": payload.get("hyperparameters", {}),
                "preprocessing":   payload.get("preprocessing", []),
                "cv_folds":        payload.get("cv_folds", 5),
                "test_split":      payload.get("test_split", 0.2),
                "model_id":        model_id,
            }
        )

        await notify_node(job_id, {"status": "done", "progress": 100, "result": result})

    except NotImplementedError as e:
        await notify_node(job_id, {"status": "failed", "error_message": str(e)})
    except Exception as e:
        await notify_node(job_id, {
            "status": "failed",
            "error_message": str(e),
            "error_traceback": __import__("traceback").format_exc(),
        })


async def notify_node(job_id: int, body: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.node_api_url}/jobs/{job_id}/update",
            json=body,
            headers={"x-worker-secret": settings.worker_secret},
            timeout=10,
        )


async def main():
    print("[worker] Iniciando conexão com Redis...")
    worker = Worker(
        "training",
        process_job,
        {
            "connection": {
                "host": settings.redis_host,
                "port": settings.redis_port,
            },
            "prefix": "{tchelab}",
        }
    )
    print("[worker] Aguardando jobs...")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
