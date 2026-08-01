"""OpenTelemetry + Prometheus instrumentation (Backend.md §12, Security.md §6).

- OTel traces: exported via OTLP/gRPC when OTLP_ENDPOINT is set; each request
  gets trace_id, span_id, parent_span_id.
- Prometheus: /metrics with RED metrics (rate, errors, duration) and DB pool
  gauges. The metrics endpoint itself is unauthenticated but plain: no
  PII, no stack traces, no query text.
"""

from __future__ import annotations

from typing import Any

from prometheus_client import Counter, Gauge, Histogram
from prometheus_client.exposition import CONTENT_TYPE_LATEST, generate_latest
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings

HTTP_REQUESTS = Counter(
    "watiq_http_requests_total",
    "HTTP requests",
    ["route", "method", "status"],
)
HTTP_REQUEST_DURATION = Histogram(
    "watiq_http_request_duration_seconds",
    "HTTP request duration",
    ["route", "method"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
DB_POOL_OPEN = Gauge(
    "watiq_db_pool_open_connections",
    "Open DB pool connections",
    ["role"],
)
DB_POOL_IN_USE = Gauge(
    "watiq_db_pool_in_use_connections",
    "DB pool in-use connections",
    ["role"],
)
SECURITY_ANOMALIES = Counter(
    "watiq_security_anomalies_total",
    "Insider-threat anomalies raised by detect_anomalous_access (Security.md §14.3)",
    ["kind"],
)
JOB_FAILURES = Counter(
    "watiq_job_failures_total",
    "ARQ job failures",
    ["job"],
)
JOB_RUNS = Counter(
    "watiq_job_runs_total",
    "ARQ job runs",
    ["job"],
)
DOCUMENT_SCAN_REJECTIONS = Counter(
    "watiq_document_scan_rejections_total",
    "Uploads rejected by scan_document (Backend.md §9)",
    ["reason"],
)


def metrics_response() -> Response:
    return Response(
        generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
        headers={"Cache-Control": "no-store"},
    )


def setup_telemetry() -> None:
    s = get_settings()
    if not s.otel_endpoint:
        # No OTLP configured: Prometheus-only mode.
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create({SERVICE_NAME: "watiq-api"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=s.otel_endpoint))
    )
    trace.set_tracer_provider(provider)


def instrumented_route(request: Request, status_code: int) -> None:
    """Record RED metrics for one request (called from middleware)."""
    route = request.url.path
    HTTP_REQUESTS.labels(route=route, method=request.method, status=status_code).inc()
    HTTP_REQUEST_DURATION.labels(route=route, method=request.method).observe(
        _duration_since(request)
    )


def _duration_since(request: Request) -> float:
    import time

    start = getattr(request.state, "start_time", None)
    if start is None or not isinstance(start, (int, float)):
        return 0.0
    return time.monotonic() - start


async def update_db_pool_metrics(engines: dict[str, Any]) -> None:
    """Snapshots pool sizes; best-effort, never raises into the request path."""
    try:
        for role, engine in engines.items():
            pool = engine.pool
            if pool is None:
                continue
            DB_POOL_OPEN.labels(role=role).set(pool.size())
            DB_POOL_IN_USE.labels(role=role).set(pool.checkedout())
    except Exception:
        return
