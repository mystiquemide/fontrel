"""FalkorDB access. One shared supply graph, one graph per hospital tenant."""
import re
from functools import lru_cache

from falkordb import FalkorDB, Graph

from .config import settings

_TENANT_ID = re.compile(r"^[a-z0-9_]{1,40}$")


@lru_cache(maxsize=1)
def client() -> FalkorDB:
    return FalkorDB(
        host=settings.falkordb_host,
        port=settings.falkordb_port,
        password=settings.falkordb_password,
    )


def supply() -> Graph:
    return client().select_graph(settings.supply_graph)


def tenant(tenant_id: str) -> Graph:
    if not _TENANT_ID.match(tenant_id):
        raise ValueError(f"invalid tenant id: {tenant_id!r}")
    return client().select_graph(settings.tenant_prefix + tenant_id)


def list_tenants() -> list[str]:
    prefix = settings.tenant_prefix
    return sorted(g[len(prefix):] for g in client().list_graphs() if g.startswith(prefix))


def ping() -> bool:
    try:
        return bool(client().connection.ping())
    except Exception:
        return False
