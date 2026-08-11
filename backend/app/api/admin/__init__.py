# Admin API router aggregation
from fastapi import APIRouter

from app.api.admin import dashboard, drama_projects, ledger, orders, projects, templates, users, works

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(dashboard.router)
router.include_router(users.router)
router.include_router(orders.router)
router.include_router(ledger.router)
router.include_router(projects.router)
router.include_router(works.router)
router.include_router(templates.router)
router.include_router(drama_projects.router)
