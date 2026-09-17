"use client";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import "leaflet/dist/leaflet.css";

import { ChangeIndicator } from "@/components/data/change-indicator";
import {
  STATION_DOTS_FROM_ZOOM,
  StationOverlayLayer,
  type OverlayHit,
} from "@/components/map/station-overlay-layer";
import { SearchBox } from "@/components/search/search-box";
import { formatCompactCount, formatCount } from "@/lib/format";
import type { MapStation } from "@/lib/data/map";
import type { SearchResult } from "@/lib/data/search";
import { calculateChange } from "@/lib/metrics/change";
import { trackEvent } from "@/lib/analytics";
import {
  aggregateByMunicipality,
  classBreaks,
  municipalityKey,
  volumeClass,
} from "@/lib/map/municipality";
import { VOLUME_CLASS_COLORS, volumeClassColor } from "@/lib/map/volume-color";
import { cn } from "@/lib/utils";

const SOUTH_AFRICA_BOUNDS: [number, number, number, number] = [15.5, -35.5, 33.5, -21.8];
const MAX_BOUNDS: [number, number, number, number] = [13.2, -36.2, 34.6, -20.8];

type ProvinceChip = { slug: string; name: string };

const PROVINCE_BOUNDS: Record<string, [number, number, number, number]> = {
  "eastern-cape": [22.5, -34.3, 30.2, -30.0],
  "free-state": [24.3, -30.7, 29.8, -26.6],
  gauteng: [27.5, -26.9, 29.1, -25.1],
  "kwazulu-natal": [28.8, -31.1, 32.9, -26.8],
  limpopo: [26.3, -25.5, 31.9, -22.1],
  mpumalanga: [28.9, -27.5, 32.1, -24.1],
  "north-west": [22.6, -28.3, 28.4, -24.4],
  "northern-cape": [16.3, -32.5, 25.8, -24.5],
  "western-cape": [17.8, -34.9, 24.3, -30.4],
};

const PROVINCE_CHIPS: ProvinceChip[] = [
  { slug: "eastern-cape", name: "Eastern Cape" },
  { slug: "free-state", name: "Free State" },
  { slug: "gauteng", name: "Gauteng" },
  { slug: "kwazulu-natal", name: "KwaZulu-Natal" },
  { slug: "limpopo", name: "Limpopo" },
  { slug: "mpumalanga", name: "Mpumalanga" },
  { slug: "north-west", name: "North West" },
  { slug: "northern-cape", name: "Northern Cape" },
  { slug: "western-cape", name: "Western Cape" },
];

type HoverCard = {
  title: string;
  detail: string;
  x: number;
  y: number;
};

function leafletBounds(box: [number, number, number, number]): L.LatLngBoundsExpression {
  return [
    [box[1], box[0]],
    [box[3], box[2]],
  ];
}

function projectorFor(map: L.Map) {
  return {
    getZoom: () => map.getZoom(),
    project: (longitude: number, latitude: number) => {
      const point = map.latLngToContainerPoint([latitude, longitude]);
      return { x: point.x, y: point.y };
    },
  };
}

/**
 * Raster map of recorded crime. Leaflet draws ordinary image tiles, which Safari can show.
 * Circles are recorded-case totals for a cluster or a single station, not a safety score.
 */
export function CrimeMapView({
  financialYear,
  category,
  categoryLabel,
  className,
  chrome = true,
  focus = null,
}: {
  financialYear: string | null;
  category: string;
  categoryLabel: string;
  className?: string;
  chrome?: boolean;
  focus?: { slug: string; longitude: number; latitude: number } | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayHostRef = useRef<HTMLDivElement>(null);
  const overlayLayerRef = useRef<StationOverlayLayer | null>(null);
  const areasLayerRef = useRef<L.GeoJSON | null>(null);
  const municipalitiesRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const mapRef = useRef<L.Map | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const stationsRef = useRef<MapStation[]>([]);
  const atlasRef = useRef<MapStation[]>([]);
  const selectedRef = useRef<MapStation | null>(null);
  const selectedPopupRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<string | null>(null);
  const filtersRef = useRef({ financialYear, category, categoryLabel });

  const scaleMaxRef = useRef(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [visibleTotal, setVisibleTotal] = useState(0);
  const [selected, setSelected] = useState<MapStation | null>(null);
  const [hover, setHover] = useState<HoverCard | null>(null);
  const [clustered, setClustered] = useState(true);
  const [provinces, setProvinces] = useState<ProvinceChip[]>(PROVINCE_CHIPS);
  const [activeProvince, setActiveProvince] = useState<string | null>(null);

  selectedRef.current = selected;
  filtersRef.current = { financialYear, category, categoryLabel };

  const positionPopup = useCallback(() => {
    const map = mapRef.current;
    const balloon = selectedPopupRef.current;
    const open = selectedRef.current;
    if (!map || !balloon || !open) return;

    const size = map.getSize();
    const point = map.latLngToContainerPoint([open.latitude, open.longitude]);
    const placeAbove = point.y > 210;
    const x = Math.min(Math.max(point.x, 150), size.x - 150);
    const y = Math.min(Math.max(point.y, 16), size.y - 16);
    balloon.style.left = `${x}px`;
    balloon.style.top = `${y}px`;
    balloon.style.transform = placeAbove
      ? "translate(-50%, calc(-100% - 8px))"
      : "translate(-50%, 14px)";
  }, []);

  const rememberProvinces = useCallback((stations: MapStation[]) => {
    setProvinces((current) => {
      const next = new Map(current.map((item) => [item.slug, item.name]));
      for (const station of stations) {
        if (station.provinceSlug && station.provinceName) {
          next.set(station.provinceSlug, station.provinceName);
        }
      }
      return [...next.entries()]
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const paintMunicipalities = useCallback((map: L.Map, stations: MapStation[]) => {
    const shapes = municipalitiesRef.current;
    if (!shapes) return;

    const totals = aggregateByMunicipality(stations);
    const breaks = classBreaks([...totals.values()].map((row) => row.value));

    areasLayerRef.current?.remove();
    const layer = L.geoJSON(shapes, {
      style: (feature) => {
        const name = String(feature?.properties && "name" in feature.properties ? feature.properties.name : "");
        const row = totals.get(municipalityKey(name));
        if (!row) {
          return {
            fillColor: "#d7d3c8",
            fillOpacity: 0.3,
            color: "#f7f4ee",
            weight: 0.8,
            opacity: 0.85,
          };
        }
        return {
          fillColor: volumeClassColor(volumeClass(row.value, breaks)),
          fillOpacity: 0.78,
          color: "#f7f4ee",
          weight: 1,
          opacity: 0.95,
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const name = String(
          feature.properties && "name" in feature.properties ? feature.properties.name : "",
        );
        const row = totals.get(municipalityKey(name));
        featureLayer.on("mouseover", (event: L.LeafletMouseEvent) => {
          (featureLayer as L.Path).setStyle({ weight: 2.2, color: "#1a1d24", fillOpacity: 0.9 });
          const point = map.latLngToContainerPoint(event.latlng);
          setHover({
            title: row?.label ?? name,
            detail: row
              ? `${formatCount(row.value)} recorded · ${row.stations} station${row.stations === 1 ? "" : "s"} · click to zoom`
              : "No matching stations in this municipality",
            x: point.x,
            y: point.y,
          });
        });
        featureLayer.on("mousemove", (event: L.LeafletMouseEvent) => {
          const point = map.latLngToContainerPoint(event.latlng);
          setHover((current) => (current ? { ...current, x: point.x, y: point.y } : current));
        });
        featureLayer.on("mouseout", () => {
          layer.resetStyle(featureLayer);
          setHover(null);
        });
        featureLayer.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          map.fitBounds((featureLayer as L.Polygon).getBounds(), {
            padding: [36, 36],
            maxZoom: 10,
            animate: motionDuration() > 0,
          });
        });
      },
    });
    layer.addTo(map);
    areasLayerRef.current = layer;
  }, []);

  const loadStations = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    const size = map.getSize();
    if (size.x < 16 || size.y < 16) {
      map.invalidateSize();
      return;
    }

    const params = new URLSearchParams({
      west: String(SOUTH_AFRICA_BOUNDS[0]),
      south: String(SOUTH_AFRICA_BOUNDS[1]),
      east: String(SOUTH_AFRICA_BOUNDS[2]),
      north: String(SOUTH_AFRICA_BOUNDS[3]),
      category: filtersRef.current.category,
      limit: "2000",
    });
    if (filtersRef.current.financialYear) {
      params.set("year", filtersRef.current.financialYear);
    }

    try {
      const response = await fetch(`/api/map?${params.toString()}`, {
        signal: controller.signal,
      });
      const body = (await response.json()) as { stations?: MapStation[]; error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(
          response.status === 503
            ? "No crime records have been loaded yet, so the map has nothing to show."
            : "The stations in this area could not be loaded.",
        );
        return;
      }

      const stations = body.stations ?? [];
      stationsRef.current = stations;
      atlasRef.current = mergeAtlas(atlasRef.current, stations, map.getZoom());
      const localMax = stations.reduce((max, station) => Math.max(max, station.value ?? 0), 1);
      if (stations.length >= 400 || map.getZoom() < 6.5 || scaleMaxRef.current < 2) {
        scaleMaxRef.current = localMax;
      }
      if (overlayHostRef.current) {
        overlayLayerRef.current?.attach(overlayHostRef.current, projectorFor(map));
      }
      overlayLayerRef.current?.setScaleMax(scaleMaxRef.current);
      overlayLayerRef.current?.setStations(stations);
      overlayLayerRef.current?.setSelectedSlug(selectedRef.current?.slug ?? null);
      paintMunicipalities(map, stations);
      rememberProvinces(atlasRef.current);
      setVisibleCount(stations.length);
      setVisibleTotal(stations.reduce((sum, station) => sum + Math.max(station.value ?? 0, 0), 0));
      setStatus(stations.length === 0 ? "empty" : "ready");
      setMessage(null);
      setClustered(map.getZoom() < STATION_DOTS_FROM_ZOOM);
      positionPopup();

      if (selectedRef.current) {
        const fresh = stations.find((station) => station.slug === selectedRef.current?.slug);
        if (fresh) setSelected(fresh);
      }

      const pending = focusRef.current;
      if (pending && selectedRef.current?.slug !== pending.slug) {
        const match =
          stations.find((station) => station.slug === pending.slug) ??
          atlasRef.current.find((station) => station.slug === pending.slug);
        if (match) {
          setSelected(match);
          overlayLayerRef.current?.setSelectedSlug(match.slug);
        }
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setStatus("error");
      setMessage("The stations in this area could not be loaded.");
    }
  }, [paintMunicipalities, positionPopup, rememberProvinces]);

  const fitToStations = useCallback((stations: MapStation[], maxZoom = 10) => {
    const map = mapRef.current;
    const box = boundsForStations(stations);
    if (!map || !box) return;
    map.fitBounds(leafletBounds(box), {
      padding: [72, 48],
      maxZoom,
      animate: motionDuration() > 0,
    });
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    setActiveProvince(null);
    setSelected(null);
    map.fitBounds(leafletBounds(SOUTH_AFRICA_BOUNDS), {
      padding: [28, 28],
      maxZoom: 6,
      animate: motionDuration() > 0,
    });
  }, []);

  const flyToProvince = useCallback(
    (slug: string) => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize();
      setActiveProvince(slug);
      setSelected(null);
      trackEvent("map_province_jumped", { province: slug });

      const matches = atlasRef.current.filter((station) => station.provinceSlug === slug);
      if (matches.length > 0) {
        fitToStations(matches, 8);
        return;
      }

      const fallback = PROVINCE_BOUNDS[slug];
      if (!fallback) return;
      map.fitBounds(leafletBounds(fallback), {
        padding: [48, 48],
        maxZoom: 8,
        animate: motionDuration() > 0,
      });
    },
    [fitToStations],
  );

  const openStation = useCallback((station: MapStation) => {
    trackEvent("map_station_opened", { category: filtersRef.current.category });
    setSelected(station);
    overlayLayerRef.current?.setSelectedSlug(station.slug);
    const map = mapRef.current;
    if (!map) return;
    const zoom = Math.max(map.getZoom(), 9);
    map.flyTo([station.latitude, station.longitude], zoom, {
      duration: motionDuration() / 1000,
    });
  }, []);

  const handleSearch = useCallback(
    async (result: SearchResult) => {
      const map = mapRef.current;
      if (!map) return;

      if (result.type === "province") {
        const slug = result.href.replace("/crime/", "").split("/")[0];
        if (slug) flyToProvince(slug);
        return;
      }

      const slug = stationSlugFromHref(result.href);
      if (slug) {
        let station = stationsRef.current.find((item) => item.slug === slug)
          ?? atlasRef.current.find((item) => item.slug === slug)
          ?? null;
        if (!station) {
          station = await fetchStation(slug, filtersRef.current);
        }
        if (station) {
          openStation(station);
          return;
        }
      }

      if (result.type === "local_municipality" || result.type === "district_municipality") {
        const needle = result.label.toLowerCase();
        const matches = atlasRef.current.filter((station) =>
          [station.localMunicipality, station.name].some((value) =>
            value?.toLowerCase().includes(needle),
          ),
        );
        if (matches.length > 0) {
          setSelected(null);
          fitToStations(matches, 11);
        }
      }
    },
    [fitToStations, flyToProvince, openStation],
  );

  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    const overlayHost = overlayHostRef.current;
    if (!stage || !container || !overlayHost || mapRef.current) return;

    const start = focusRef.current;
    const map = L.map(container, {
      zoomControl: false,
      minZoom: 4.2,
      maxZoom: 13,
      maxBounds: [
        [MAX_BOUNDS[1], MAX_BOUNDS[0]],
        [MAX_BOUNDS[3], MAX_BOUNDS[2]],
      ],
      maxBoundsViscosity: 0.85,
      scrollWheelZoom: true,
      fadeAnimation: false,
      zoomAnimation: true,
      markerZoomAnimation: false,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer("/api/basemap/{z}/{x}/{y}?v=street", {
      attribution: "Esri · Municipal Demarcation Board via geoBoundaries",
      tileSize: 256,
      minZoom: 4,
      maxZoom: 16,
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ position: "bottomleft", metric: true, imperial: false, maxWidth: 112 }).addTo(map);
    map.addControl(new SouthAfricaControl(resetView));
    map.addControl(new LocateControl(map));

    const controls = container.querySelector(".leaflet-control-container");
    if (controls) {
      controls.classList.add("map-controls");
      stage.append(controls);
    }

    if (start) {
      map.setView([start.latitude, start.longitude], 11, { animate: false });
    } else {
      map.fitBounds(leafletBounds(SOUTH_AFRICA_BOUNDS), { padding: [24, 24], animate: false });
    }

    const overlay = new StationOverlayLayer();
    overlayLayerRef.current = overlay;
    overlay.attach(overlayHost, projectorFor(map));

    const paint = () => {
      overlay.attach(overlayHost, projectorFor(map));
      positionPopup();
    };

    map.on("move zoom", paint);
    map.on("zoomend", () => setClustered(map.getZoom() < STATION_DOTS_FROM_ZOOM));

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      const point = map.latLngToContainerPoint(event.latlng);
      const hit = overlay.hitTest(point);
      container.style.cursor = hit ? "pointer" : "";
      const key =
        hit?.kind === "station"
          ? `s:${hit.station.slug}`
          : hit?.kind === "cluster"
            ? `c:${hit.stations.length}:${hit.longitude.toFixed(3)}`
            : null;
      if (key === hoverRef.current) return;
      hoverRef.current = key;
      setHover(hit ? hoverFromHit(hit, point) : null);
    });

    map.on("mouseout", () => {
      hoverRef.current = null;
      setHover(null);
      container.style.cursor = "";
    });

    map.on("click", (event: L.LeafletMouseEvent) => {
      const point = map.latLngToContainerPoint(event.latlng);
      const hit = overlay.hitTest(point);
      if (!hit) {
        setSelected(null);
        overlay.setSelectedSlug(null);
        return;
      }
      if (hit.kind === "cluster") {
        setSelected(null);
        overlay.setSelectedSlug(null);
        const box = boundsForStations([...hit.stations]);
        if (box) {
          map.fitBounds(leafletBounds(box), {
            padding: [80, 80],
            maxZoom: Math.min(map.getZoom() + 2.2, 11),
            animate: motionDuration() > 0,
          });
        } else {
          map.flyTo([hit.latitude, hit.longitude], Math.min(map.getZoom() + 2.2, 11), {
            duration: motionDuration() / 1000,
          });
        }
        return;
      }
      openStation(hit.station);
    });

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      overlay.attach(overlayHost, projectorFor(map));
    });
    observer.observe(stage);

    map.whenReady(() => {
      map.invalidateSize();
      overlay.attach(overlayHost, projectorFor(map));
      void fetch("/geo/local-municipalities.geojson")
        .then((response) => {
          if (!response.ok) throw new Error("boundaries");
          return response.json() as Promise<GeoJSON.FeatureCollection>;
        })
        .then((geo) => {
          municipalitiesRef.current = geo;
          void loadStations();
        })
        .catch(() => {
          setStatus("error");
          setMessage("Municipal boundaries could not be loaded.");
        });
    });

    return () => {
      requestRef.current?.abort();
      observer.disconnect();
      areasLayerRef.current?.remove();
      overlay.detach();
      overlayLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [loadStations, openStation, positionPopup, resetView]);

  useEffect(() => {
    if (!mapRef.current) return;
    atlasRef.current = [];
    scaleMaxRef.current = 0;
    setStatus("loading");
    void loadStations();
  }, [financialYear, category, loadStations]);

  useEffect(() => {
    overlayLayerRef.current?.setSelectedSlug(selected?.slug ?? null);
    positionPopup();
  }, [selected, positionPopup]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {chrome ? (
        <div className="flex flex-col gap-2">
          <div className="max-w-xl">
            <SearchBox
              size="md"
              placeholder="Jump to a station, suburb or province"
              onSelect={handleSearch}
            />
          </div>
          {provinces.length > 0 ? (
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
              <JumpChip active={activeProvince === null} onClick={resetView}>
                South Africa
              </JumpChip>
              {provinces.map((province) => (
                <JumpChip
                  key={province.slug}
                  active={activeProvince === province.slug}
                  onClick={() => flyToProvince(province.slug)}
                >
                  {province.name}
                </JumpChip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={cn(
          "map-frame overflow-hidden rounded-xl border border-border",
          chrome ? null : "map-frame--compact",
        )}
        role="region"
        aria-label="Map of recorded crime by police station"
      >
        <div ref={containerRef} className="map-container" />
        <div ref={overlayHostRef} className="map-overlay-host" />

        {hover && !selected ? (
          <div
            className="pointer-events-none absolute z-20 w-56 rounded-lg border border-border-strong bg-background/95 px-3 py-2 shadow-xl shadow-black/50 backdrop-blur"
            style={{ left: hover.x, top: hover.y, transform: "translate(-50%, calc(-100% - 12px))" }}
          >
            <p className="text-sm font-medium text-foreground">{hover.title}</p>
            <p className="mt-0.5 text-xs text-muted">{hover.detail}</p>
          </div>
        ) : null}

        {selected ? (
          <div ref={selectedPopupRef} className="absolute z-30 w-72 pb-2">
            <div className="rounded-xl border border-border-strong bg-surface-raised shadow-2xl shadow-black/60">
              <button
                type="button"
                className="absolute top-2 right-2 rounded-md px-2 text-sm text-muted hover:text-foreground"
                aria-label="Close station popup"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
              <StationPopup station={selected} categoryLabel={categoryLabel} />
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[16.5rem]">
          <div className="rounded-lg border border-border bg-background/92 px-3 py-2.5 text-xs text-muted shadow-lg shadow-black/30 backdrop-blur">
            <p className="font-medium text-foreground">
              {financialYear ?? "Recorded cases"} · {categoryLabel}
            </p>
            <p className="tabular mt-1 text-lg font-semibold tracking-tight text-foreground">
              {status === "ready" ? formatCount(visibleTotal) : status === "loading" ? "…" : "—"}
            </p>
            <p className="text-[0.6875rem] text-muted-strong">
              recorded cases
              {status === "ready" ? ` · ${visibleCount} station${visibleCount === 1 ? "" : "s"}` : ""}
            </p>
            <div className="mt-2.5">
              <ColorRamp />
            </div>
            <p className="mt-2 leading-snug">
              {clustered
                ? "Each shape is a local municipality. Green is fewer recorded cases, red is more. Colour is volume, not a safety score. Click an area to zoom in."
                : "Each circle is one police station. Size is recorded cases in the selected year, not a rate or a safety score."}
            </p>
            <p className="mt-2 text-[0.6875rem] text-muted-strong">
              {status === "loading"
                ? "Loading stations…"
                : status === "error"
                  ? (message ?? "Something went wrong.")
                  : status === "empty"
                    ? "No station precincts in this view"
                    : null}
            </p>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {status === "ready"
          ? `${formatCount(visibleTotal)} recorded cases across ${visibleCount} police stations in the current view for ${financialYear ?? "the selected year"}.`
          : status === "empty"
            ? "No police stations in the current view."
            : ""}
      </p>
    </div>
  );
}

function JumpChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-accent/40 bg-accent/15 text-foreground"
          : "border-border bg-background/90 text-muted hover:border-border-strong hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function ColorRamp() {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {VOLUME_CLASS_COLORS.map((color) => (
          <span key={color} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.625rem] tracking-wide text-muted uppercase">
        <span>Fewer cases</span>
        <span>More cases</span>
      </div>
    </div>
  );
}

function StationPopup({
  station,
  categoryLabel,
}: {
  station: MapStation;
  categoryLabel: string;
}) {
  const change = calculateChange(station.value, station.previousValue);
  const href = station.provinceSlug
    ? `/crime/${station.provinceSlug}/${station.slug}`
    : `/station/${station.slug}`;

  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-foreground">{station.name}</p>
      <p className="mt-0.5 text-xs text-muted">
        {[station.localMunicipality, station.provinceName].filter(Boolean).join(" · ")}
      </p>

      <dl className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-muted">{categoryLabel}</dt>
          <dd className="tabular text-sm font-medium">{formatCount(station.value)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-muted">Change on previous year</dt>
          <dd>
            <ChangeIndicator change={change} size="sm" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-muted">Financial year</dt>
          <dd className="tabular text-xs">{station.financialYear}</dd>
        </div>
      </dl>

      <Link
        href={href}
        className="mt-3 inline-block text-xs font-medium text-accent underline decoration-dotted underline-offset-2"
      >
        View the full profile for this precinct
      </Link>
    </div>
  );
}

class SouthAfricaControl extends L.Control {
  constructor(private readonly onReset: () => void) {
    super({ position: "topright" });
  }

  override onAdd() {
    const wrap = L.DomUtil.create("div", "leaflet-bar");
    const button = L.DomUtil.create("a", "", wrap);
    button.href = "#";
    button.title = "Show all of South Africa";
    button.setAttribute("aria-label", "Show all of South Africa");
    button.textContent = "SA";
    button.role = "button";
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.on(button, "click", (event) => {
      L.DomEvent.preventDefault(event);
      this.onReset();
    });
    return wrap;
  }
}

class LocateControl extends L.Control {
  constructor(private readonly map: L.Map) {
    super({ position: "topright" });
  }

  override onAdd() {
    const wrap = L.DomUtil.create("div", "leaflet-bar");
    const button = L.DomUtil.create("a", "", wrap);
    button.href = "#";
    button.title = "Find my location";
    button.setAttribute("aria-label", "Find my location");
    button.textContent = "◎";
    button.role = "button";
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.on(button, "click", (event) => {
      L.DomEvent.preventDefault(event);
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((position) => {
        this.map.flyTo([position.coords.latitude, position.coords.longitude], 11, {
          duration: motionDuration() / 1000,
        });
      });
    });
    return wrap;
  }
}

function mergeAtlas(
  current: MapStation[],
  incoming: MapStation[],
  zoom: number,
): MapStation[] {
  const incomingYear = incoming[0]?.financialYear;
  const stale = incomingYear && current.some((station) => station.financialYear !== incomingYear);
  if (stale || incoming.length >= 800 || zoom < 6) return incoming;
  const next = new Map(current.map((station) => [station.slug, station]));
  for (const station of incoming) next.set(station.slug, station);
  return [...next.values()];
}

function hoverFromHit(
  hit: OverlayHit,
  point: { x: number; y: number },
): HoverCard {
  if (hit.kind === "station") {
    return {
      title: hit.station.name,
      detail: `${formatCount(hit.station.value)} recorded · click for the profile`,
      x: point.x,
      y: point.y,
    };
  }
  const total = hit.stations.reduce((sum, station) => sum + Math.max(station.value ?? 0, 0), 0);
  return {
    title: `${formatCompactCount(total)} recorded`,
    detail: `${hit.stations.length} police stations · click to zoom in`,
    x: point.x,
    y: point.y,
  };
}

function boundsForStations(
  stations: MapStation[],
): [number, number, number, number] | null {
  if (stations.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const station of stations) {
    west = Math.min(west, station.longitude);
    south = Math.min(south, station.latitude);
    east = Math.max(east, station.longitude);
    north = Math.max(north, station.latitude);
  }
  if (east === west) {
    west -= 0.08;
    east += 0.08;
  }
  if (north === south) {
    south -= 0.08;
    north += 0.08;
  }
  return [west, south, east, north];
}

function motionDuration(): number {
  if (typeof window === "undefined") return 800;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 850;
}

function stationSlugFromHref(href: string): string | null {
  const parts = href.split("/").filter(Boolean);
  if (parts[0] === "crime" && parts.length >= 3) return parts[2] ?? null;
  if (parts[0] === "station" && parts[1]) return parts[1];
  return null;
}

async function fetchStation(
  slug: string,
  filters: { financialYear: string | null; category: string },
): Promise<MapStation | null> {
  const params = new URLSearchParams({
    west: "15.5",
    south: "-35.5",
    east: "33.5",
    north: "-21.8",
    category: filters.category,
    limit: "2000",
  });
  if (filters.financialYear) params.set("year", filters.financialYear);
  try {
    const response = await fetch(`/api/map?${params.toString()}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { stations?: MapStation[] };
    return body.stations?.find((station) => station.slug === slug) ?? null;
  } catch {
    return null;
  }
}
