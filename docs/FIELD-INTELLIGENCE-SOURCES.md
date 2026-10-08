# FOGGARA-DZ Field Intelligence — external methods and data sources

This document records the external projects and datasets reviewed for the FOGGARA-DZ field-intelligence workspace.

## Operational now

- **Sentinel-2 L2A / Element 84 Earth Search** — live STAC scene discovery and public COG raster processing.
- **iSDAsoil** — public African soil-context COGs. FOGGARA currently reads physical soil context (clay, sand, silt and bulk density) at 30 m. These remain model-derived **INFERRED** context, never laboratory measurements.

## Reference architectures / products

- **Digital Earth Africa Cropland Extent** — Apache-2.0 code; cropland data CC BY 4.0. Used as an architecture/method reference for African crop mapping.
- **AgriPulse** — MIT. Reviewed as a field-boundary + Sentinel + weather + soil fusion reference. No source code is vendored in FOGGARA by this change.
- **ESA WorldCereal** — global 10 m seasonal cropland/crop-type/irrigation products. Registered as a reference dataset until its product access path is separately validated in production.
- **FAO WaPOR** — water productivity and evapotranspiration. Registered as the next water-productivity provider; not presented as operational until API/product integration is validated.
- **Dynamic World** — near-real-time 10 m land-cover probabilities. Registered as a reference layer, not an operational crop-species classifier.

## Date-palm specific references

- **Date Palm Segmentation from WorldView-3 Satellite Data** — Apache-2.0 code, CC BY 4.0 released weights. Appropriate for individual-tree segmentation only when validated very-high-resolution imagery is available.
- **DatePalm Tunisia research pipeline** — GPL-3.0. Used only as a research reference for oasis/date-palm climate and groundwater time-series patterns. No GPL code is copied into FOGGARA by this change.

## Scientific constraints

FOGGARA does not infer crop identity from Sentinel-2 merely because a user selects a crop profile. Crop identity is recorded as **USER_DECLARED** until a validated classifier is connected.

Sentinel-2 10 m supports field/grove-level vegetation, moisture, water and bare-soil screening. It is not sufficient for reliable individual date-palm counting.

Spatial soil products such as iSDAsoil are model predictions. Agronomic prescriptions for pH, N, P, K, salinity or fertilisation require a validated provider contract and/or local verified laboratory/field measurements.

Evidence semantics remain:

`OBSERVED → COMPUTED → INFERRED → VERIFIED only after independent validation`
