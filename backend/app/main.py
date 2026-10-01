from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.handlers import register_handlers
from app.core.log import configure_logging
from app.middleware.access_log import AccessLogMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.routers import admin, auth, cart, catalogue, discounts, health, images, orders, products


def create_app() -> FastAPI:
    """Build the app. A factory (not just a global) so each test can get a fresh instance."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    app = FastAPI(title="Isabella Fashion Finds API")

    # Order matters and is easy to get backwards: the LAST middleware added is the OUTERMOST.
    # Request flow:  RequestId -> AccessLog -> CORS -> routes (and back out again).
    # RequestId must be outermost so the id exists for everything inside it, including the
    # access-log line; AccessLog wraps CORS so preflight requests are logged too.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,  # needed for the httpOnly session cookie
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(RequestIdMiddleware)

    register_handlers(app)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(catalogue.router)
    app.include_router(products.router)
    app.include_router(images.router)
    app.include_router(admin.router)
    app.include_router(discounts.router)
    app.include_router(cart.router)
    app.include_router(orders.router)
    return app


app = create_app()
