import { formatCompactCount } from "@/lib/format";
import type { MapStation } from "@/lib/data/map";
import { volumeColor } from "@/lib/map/volume-color";

export { volumeColor };

const SVG_NS = "http://www.w3.org/2000/svg";
export const STATION_DOTS_FROM_ZOOM = 9;
const MIN_STATION_RADIUS = 6;
const MAX_STATION_RADIUS = 22;

export type MapProjector = {
  getZoom(): number;
  project(longitude: number, latitude: number): { x: number; y: number };
};

export type OverlayHit =
  | { kind: "station"; station: MapStation; radius: number }
  | { kind: "cluster"; stations: readonly MapStation[]; longitude: number; latitude: number; radius: number };

type DrawnFeature = OverlayHit & {
  x: number;
  y: number;
  value: number;
};

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function stationValue(station: MapStation): number {
  return Math.max(station.value ?? 0, 0);
}

function radiusFromValue(value: number, scaleMax: number, min: number, max: number): number {
  const t = Math.sqrt(value) / Math.sqrt(Math.max(scaleMax, 1));
  return min + Math.min(t, 1) * (max - min);
}

/**
 * Individual station circles once the reader has zoomed into a municipality.
 * National and provincial views use the municipality choropleth instead.
 */
export class StationOverlayLayer {
  private view: MapProjector | null = null;
  private svg: SVGSVGElement | null = null;
  private layer: SVGGElement | null = null;
  private stations: readonly MapStation[] = [];
  private selectedSlug: string | null = null;
  private scaleMax = 1;
  private drawn: DrawnFeature[] = [];

  attach(host: HTMLElement, view: MapProjector) {
    this.view = view;
    if (this.svg?.isConnected && this.svg.parentElement === host) {
      this.redraw();
      return;
    }
    this.detach();
    this.view = view;

    const svg = svgElement("svg");
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      pointerEvents: "none",
      overflow: "hidden",
      background: "transparent",
    } satisfies Partial<CSSStyleDeclaration>);

    const layer = svgElement("g");
    svg.append(layer);
    host.append(svg);

    this.svg = svg;
    this.layer = layer;
    this.redraw();
  }

  setStations(stations: readonly MapStation[]) {
    this.stations = stations;
    this.redraw();
  }

  setScaleMax(value: number) {
    this.scaleMax = Math.max(value, 1);
    this.redraw();
  }

  setSelectedSlug(slug: string | null) {
    this.selectedSlug = slug;
    this.redraw();
  }

  hitTest(point: { x: number; y: number }): OverlayHit | null {
    let nearest: DrawnFeature | null = null;
    let nearestDistance = Infinity;

    for (const feature of this.drawn) {
      const distance = Math.hypot(feature.x - point.x, feature.y - point.y);
      if (distance <= feature.radius + 2 && distance < nearestDistance) {
        nearest = feature;
        nearestDistance = distance;
      }
    }

    if (!nearest) return null;
    if (nearest.kind === "station") {
      return { kind: "station", station: nearest.station, radius: nearest.radius };
    }
    return {
      kind: "cluster",
      stations: nearest.stations,
      longitude: nearest.longitude,
      latitude: nearest.latitude,
      radius: nearest.radius,
    };
  }

  detach() {
    this.svg?.remove();
    this.view = null;
    this.svg = null;
    this.layer = null;
    this.drawn = [];
  }

  redraw() {
    const view = this.view;
    const svg = this.svg;
    const layer = this.layer;
    if (!view || !svg || !layer) return;

    const host = svg.parentElement;
    const width = host?.clientWidth ?? 0;
    const height = host?.clientHeight ?? 0;
    if (width < 16 || height < 16) {
      this.drawn = [];
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      return;
    }
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const features = this.buildFeatures(view, width, height);
    this.drawn = features;
    this.syncNodes(layer, features);
  }

  private buildFeatures(view: MapProjector, width: number, height: number): DrawnFeature[] {
    const zoom = view.getZoom();
    const pad = 56;
    const visible: { station: MapStation; x: number; y: number; value: number }[] = [];

    for (const station of this.stations) {
      const point = view.project(station.longitude, station.latitude);
      if (point.x < -pad || point.y < -pad || point.x > width + pad || point.y > height + pad) {
        continue;
      }
      visible.push({
        station,
        x: point.x,
        y: point.y,
        value: stationValue(station),
      });
    }

    if (zoom < STATION_DOTS_FROM_ZOOM) return [];

    return visible
      .map((item) => ({
        kind: "station" as const,
        station: item.station,
        radius: radiusFromValue(item.value, this.scaleMax, MIN_STATION_RADIUS, MAX_STATION_RADIUS),
        x: item.x,
        y: item.y,
        value: item.value,
      }))
      .sort((a, b) => a.value - b.value);
  }

  private syncNodes(layer: SVGGElement, features: DrawnFeature[]) {
    while (layer.childElementCount < features.length) {
      const group = svgElement("g");
      const halo = svgElement("circle");
      halo.setAttribute("fill", "none");
      halo.setAttribute("stroke", "#f4fbff");
      halo.setAttribute("stroke-width", "2.5");
      const circle = svgElement("circle");
      circle.setAttribute("stroke", "rgba(255,255,255,0.9)");
      circle.setAttribute("stroke-width", "1.6");
      const label = svgElement("text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("font-weight", "700");
      label.setAttribute("paint-order", "stroke");
      label.setAttribute("stroke-width", "3");
      group.append(halo, circle, label);
      layer.append(group);
    }
    while (layer.childElementCount > features.length) layer.lastElementChild?.remove();

    const nodes = layer.children;
    for (let index = 0; index < features.length; index += 1) {
      const feature = features[index];
      const group = nodes[index];
      if (!feature || !(group instanceof SVGGElement)) continue;

      const halo = group.children[0];
      const circle = group.children[1];
      const label = group.children[2];
      if (
        !(halo instanceof SVGCircleElement) ||
        !(circle instanceof SVGCircleElement) ||
        !(label instanceof SVGTextElement)
      ) {
        continue;
      }

      const x = feature.x.toFixed(1);
      const y = feature.y.toFixed(1);
      const selected = feature.kind === "station" && feature.station.slug === this.selectedSlug;
      const t = Math.sqrt(feature.value) / Math.sqrt(this.scaleMax);
      const fill = selected ? "#f4c45a" : volumeColor(t);

      halo.setAttribute("cx", x);
      halo.setAttribute("cy", y);
      halo.setAttribute("r", (feature.radius + 4).toFixed(1));
      halo.setAttribute("opacity", selected ? "1" : "0");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", feature.radius.toFixed(1));
      circle.setAttribute("fill", fill);
      circle.setAttribute("fill-opacity", selected ? "1" : "0.78");

      const showLabel =
        feature.kind === "cluster"
          ? feature.radius >= 16
          : feature.radius >= 13 && feature.value >= 400;
      if (showLabel) {
        label.setAttribute("x", x);
        label.setAttribute("y", y);
        label.setAttribute("font-size", feature.radius >= 28 ? "12" : "10");
        label.setAttribute("fill", t > 0.5 ? "#f8fbff" : "#0b1a33");
        label.setAttribute("stroke", t > 0.5 ? "rgba(8, 22, 48, 0.55)" : "rgba(255,255,255,0.7)");
        label.textContent = formatCompactCount(feature.value);
        label.setAttribute("opacity", "1");
      } else {
        label.textContent = "";
        label.setAttribute("opacity", "0");
      }
    }
  }
}
