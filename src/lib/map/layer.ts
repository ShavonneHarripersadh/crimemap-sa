/**
 * Future map layers.
 *
 * CrimeMapView is still the only map. It is not routed through this interface.
 * A later dataset (zoning, development applications, infrastructure) implements
 * MapLayer and is mounted beside the crime overlay. It must not be added as
 * another branch inside CrimeMapView.
 *
 * A layer reads its own API and its own geometry. It does not assume a police
 * station point is a precinct, municipality, or property boundary.
 */

export interface MapLayerContext {
  readonly financialYear: string | null;
}

export interface MapLayer {
  readonly id: string;
  readonly datasetKey: string;
  readonly label: string;
}
