import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("saved GIS parcel identity reaches real field intelligence instead of a client bbox",()=>{
  const page=read("../src/pages/Gis.tsx");
  assert.match(page,/params\.set\("parcel_id", String\(selectedParcelId\)\)/);
  assert.match(page,/params\.set\("bbox", analysisBbox\.map/);
  assert.match(page,/if \(selectedParcelId\)/);
  assert.match(page,/!draftPolygon && newFieldCrop\.trim\(\)/);
  assert.match(page,/fieldIntelligenceResult\.geometry_mask_applied/);
  assert.match(page,/NO_USABLE_SCENE/);
});

test("backend resolves authoritative WGS84 field from tenant-scoped DB",()=>{
  const router=read("../backend/app/routers/remote_sensing_catalog.py");
  assert.match(router,/parcel_id: int \| None = Query\(default=None, gt=0\)/);
  assert.match(router,/AgriParcel\.org_id == _user\.org_id/);
  assert.match(router,/raw_bbox, geometry, sample_geometry, _fingerprint = _analysis_target\(parcel\)/);
  assert.match(router,/geometry_wgs84=geometry/);
  assert.match(router,/"geometry_mask_applied": geometry is not None/);
  assert.match(router,/resolve_crop_profile\(resolved_crop\)/);
  assert.match(router,/db\.rollback\(\)/);
});

test("raster engine masks out pixels beyond registered field polygon",()=>{
  const raster=read("../backend/app/services/remote_sensing_raster.py");
  assert.match(raster,/def compute_multi_index_statistics\(/);
  assert.match(raster,/geometry_wgs84: Mapping \| None = None/);
  assert.match(raster,/analysis_mask = geometry_mask\(/);
  assert.match(raster,/all_touched=False/);
  assert.match(raster,/"outside_geometry_pixel_count": outside_geometry_pixels/);
});

test("no simulated pH and no claiming AOI bbox is parcel geometry",()=>{
  const page=read("../src/pages/Gis.tsx");
  assert.match(page,/pH · laboratory test needed/);
  assert.match(page,/Estimated BBOX analysis, not a surveyed field boundary/);
  assert.match(page,/Save the parcel first to compute indices inside its polygon/);
});

test("active project cannot hijack a freshly drawn AOI",()=>{
  const page=read("../src/pages/Gis.tsx");
  assert.match(page,/if \(manualAnalysisBbox \|\| draftPolygon \|\| !activeProjectSiteId/);
  assert.match(page,/polygonBoundingBox\(selectedParcelRecord\.boundary_geojson\)/);
});
