import { useId } from "react";
import { cityPoints, outline } from "./route-geo";

export type RouteStop = { city: string; days: number };
// The whole country, with a small margin.
const view = { x: -6, y: -6, width: 412, height: 338 };
// Where each label sits relative to its dot so close neighbours do not collide.
const anchor: Record<
  string,
  { dx: number; dy: number; align: "start" | "end" | "middle" }
> = {
  Baku: { dx: -14, dy: 4, align: "end" },
  Quba: { dx: 13, dy: -9, align: "start" },
  Khinalug: { dx: 13, dy: 5, align: "start" },
  Gabala: { dx: 0, dy: 24, align: "middle" },
  Sheki: { dx: 0, dy: -14, align: "middle" },
};

/** The route drawn over Azerbaijan: numbered stops joined by arrows in travel order. */
export function RouteMap({
  stops,
  name,
  label,
}: {
  stops: RouteStop[];
  name: (city: string) => string;
  label: string;
}) {
  const marker = useId().replace(/:/g, "");
  // Tours may list places that are not map cities (for example "Old City"); only mapped cities are drawn.
  stops = stops.filter((s) => cityPoints[s.city]);
  const order = new Map<string, number[]>();
  stops.forEach((s, i) =>
    order.set(s.city, [...(order.get(s.city) || []), i + 1]),
  );
  const legs = stops
    .slice(1)
    .map((s, i) => ({ from: stops[i].city, to: s.city, i }));
  return (
    <svg
      className="ow-map"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#b54126" />
        </marker>
      </defs>
      <path d={outline} className="ow-map-land" />
      {Object.entries(cityPoints).map(([city, p]) => (
        <g key={city}>
          {!order.has(city) && (
            <circle cx={p.x} cy={p.y} r={3} className="ow-map-idle" />
          )}
          <text
            x={p.x + anchor[city].dx}
            y={p.y + anchor[city].dy}
            textAnchor={anchor[city].align}
            className={order.has(city) ? "ow-map-label on" : "ow-map-label"}
          >
            {name(city)}
          </text>
        </g>
      ))}
      {legs.map(({ from, to, i }) => {
        const a = cityPoints[from],
          b = cityPoints[to];
        const dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy) || 1;
        // Stop short of both dots; bow alternate legs so out-and-back trips stay readable.
        const sx = a.x + (dx / len) * 9,
          sy = a.y + (dy / len) * 9,
          ex = b.x - (dx / len) * 11,
          ey = b.y - (dy / len) * 11,
          bow = (i % 2 ? -1 : 1) * Math.min(16, len / 5);
        const cx = (sx + ex) / 2 - (dy / len) * bow,
          cy = (sy + ey) / 2 + (dx / len) * bow;
        return (
          <path
            key={i}
            d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`}
            className="ow-map-leg"
            markerEnd={`url(#${marker})`}
          />
        );
      })}
      {[...order.entries()].map(([city, n]) => {
        const p = cityPoints[city];
        const text = n.join(",");
        return (
          <g key={city}>
            <circle
              cx={p.x}
              cy={p.y}
              r={text.length > 1 ? 10 : 8}
              className="ow-map-stop"
            />
            <text
              x={p.x}
              y={p.y + 3.6}
              textAnchor="middle"
              className="ow-map-number"
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
