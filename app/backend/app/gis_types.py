from sqlalchemy.types import UserDefinedType

class Geometry(UserDefinedType):
    """Minimal PostGIS geometry type without a runtime GeoAlchemy dependency."""
    cache_ok = True

    def __init__(self, geometry_type: str, srid: int = 4326):
        self.geometry_type = geometry_type
        self.srid = srid

    def get_col_spec(self, **kw):
        return f"geometry({self.geometry_type},{self.srid})"
