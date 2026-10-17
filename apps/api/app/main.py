"""
CAUSAL API — Application entry point.

Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from app.factory import create_application

app = create_application()
