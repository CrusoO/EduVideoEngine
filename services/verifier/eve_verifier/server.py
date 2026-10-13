"""HTTP wrapper: POST /verify with a LessonBundle returns the report (200 even when rejected: the report says ok false).
Run: uvicorn eve_verifier.server:app --port 8765. The same function backs the CLI, so both answer identically."""

from __future__ import annotations

from typing import Any

from fastapi import Body, FastAPI

from .checks import verify_bundle

app = FastAPI(title="EduVideoEngine verifier")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify")
def verify(bundle: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return verify_bundle(bundle).as_dict()
