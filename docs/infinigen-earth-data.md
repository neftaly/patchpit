# Infinigen Earth Data Prototype

The earth-scale prototype should use official or openly licensed geodata through
documented APIs and downloads. Do not scrape map apps or derive procedural data
from restricted map imagery.

## First New Zealand Layers

Use LINZ Data Service metadata and service endpoints as the first public data
source.

- `124391` - NZ Coastline - Mean High Water Springs Polygon.
  - Public-download CC BY 4.0 coastline polygon layer.
  - Useful as the source reference for the virtual New Zealand land/water
    outline. The current viewer uses a procedural coastline/terrain proxy until
    a simplified local extract is imported.
- `101290` - NZ Building Outlines.
  - Current roof/building outline polygons for mainland New Zealand.
  - Useful for procedural exterior footprints and approximate floor-area
    signals.
- `123110` - NZ Addresses: Roads.
  - Road-name centreline geometry for address context.
  - Useful for prototype road ribbons and access context, but the layer states
    it is not topographic, cadastral, legal, or actual road formation.
- `121859` - New Zealand LiDAR 1m DEM.
  - National 1m DEM derived from current LiDAR surveys.
  - Useful for terrain mesh generation and flight-sim altitude context.
  - LINZ metadata also points to Basemaps Terrain-RGB and the NZ Elevation
    public S3 bucket.

## Current Infinigen Preset

The share hash `#JSON({"preset":"linz-nz","quality":"high","seed":"tamaki"})`
selects the first virtual-New-Zealand stream.

The Vite dev stream makes bounded public ArcGIS REST queries for a small Tamaki
Makaurau/Auckland sample:

- `LINZ_NZ_Building_Outlines` for visible roof/footprint blocks.
- `LINZ_NZ_Addresses_Roads` for road-centreline ribbons.

If those public feature queries fail or the machine is offline, the app falls
back to deterministic procedural roads and footprint proxies. The fallback keeps
the scene available but must not be presented as exact LINZ geometry.

The terrain in this preset is still procedural and source-referenced, not a live
DEM tile. A later importer should convert a cached LINZ DEM/coastline extract
into a small, simplified local asset.

## Prototype Flow

1. Start with a small area of interest.
2. Query or download building footprints and road centrelines through LINZ or
   Koordinates-supported services.
3. Sample DEM elevation for the same bounds.
4. Convert building footprints to simple procedural exteriors.
5. Add simple generated interiors only when the user flies close enough.
6. Convert roads to lightweight ribbons over the terrain.
7. Keep source attribution visible in any public demo.

## Public Planning Demo

A useful early scenario is school and public-infrastructure planning:

- show residential building distribution,
- show road access around candidate areas,
- show terrain constraints,
- represent growth or zoning assumptions as overlays,
- prototype school building massing with simple boxes,
- keep budget/scenario data separate from raw public basemap data.

This is a visualization and planning prototype, not a cadastral, legal,
navigation, or emergency-response source of truth.

## Data Guardrails

- Prefer LINZ, OpenStreetMap, local councils, Stats NZ, and other sources with
  explicit open or licensed reuse paths.
- Keep raw downloaded data out of the repo unless it is a tiny test fixture with
  clear license and attribution.
- Keep generated LINZ caches under ignored paths such as `.cache/linz/` or a
  user-selected local project directory.
- Store API keys outside source control.
- Avoid using restricted commercial map content to train, validate, or derive
  procedural geometry.
