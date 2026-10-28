import type { Series, TagInfo } from "./types";

// The server → client wire format for a catalog. The pages prerender the
// whole catalog as props to KonomiApp, and at film scale the plain
// Series[] shape is dominated by repetition (measured 2026-10-28, 8,531
// films / 15,196 tags, 13.8 MB of series JSON): 6.8 MB of membership ids as
// 27-character strings repeated 249k times, 2.1 MB of the same JustWatch
// URL repeated per provider, 0.5 MB of the same CDN prefix per poster. This
// packs each of those as an index into a shared table and ships the series
// as positional tuples (no 13 key names × 8.5k rows), then unpacks to the
// exact Series[] the reducer always had — the app's own types never see
// the wire shape. Scoring stays client-side and synchronous; the next step
// (server-side recommend, a DB function) is a separate decision.
//
// Field order inside WireSeries is the contract between pack and unpack
// and nothing else reads it; add new fields at the END so an older client
// bundle reading a newer prerender degrades to "missing field", not a
// shifted one. Bump `v` only when a position changes meaning.

export const WIRE_VERSION = 1;

// [name, urlIndex, icon, color]
type WireStream = [string, number, string | null, string | null];

// Positions are documented by the W enum below.
export type WireSeries = [
  string, // id
  string, // title
  number | null, // year
  number | null, // eps
  number[], // tag indices into WireCatalog.tags
  [number, string] | null, // cover: [prefixIndex, rest]
  string[], // genres (display names)
  number | null, // averageScore
  string | null, // description
  WireStream[], // streamingServices
  number | null | undefined, // runtimeMin
  string | null | undefined, // certification
  string | null | undefined, // sagaName
];

const enum W {
  Id,
  Title,
  Year,
  Eps,
  Tags,
  Cover,
  Genres,
  Score,
  Description,
  Streaming,
  Runtime,
  Certification,
  Saga,
}

export interface WireCatalog {
  v: typeof WIRE_VERSION;
  tags: TagInfo[];
  // Shared string tables: stream URLs and poster-URL prefixes.
  urls: string[];
  prefixes: string[];
  series: WireSeries[];
}

// Poster URLs split at the last "/" — the prefix (CDN host + size path)
// repeats across a whole side, the rest is unique per title.
function splitUrl(url: string): [string, string] {
  const i = url.lastIndexOf("/");
  return i < 0 ? ["", url] : [url.slice(0, i + 1), url.slice(i + 1)];
}

class Table {
  readonly values: string[] = [];
  private readonly index = new Map<string, number>();
  id(value: string): number {
    const hit = this.index.get(value);
    if (hit !== undefined) return hit;
    const id = this.values.length;
    this.values.push(value);
    this.index.set(value, id);
    return id;
  }
}

export function packCatalog(catalog: { series: Series[]; tags: TagInfo[] }): WireCatalog {
  const tagIndex = new Map<string, number>();
  catalog.tags.forEach((t, i) => tagIndex.set(t.id, i));
  const urls = new Table();
  const prefixes = new Table();
  const series: WireSeries[] = catalog.series.map((s) => {
    // A membership id with no TagInfo is dropped on the wire: scoring only
    // ever tests ids the pool can select, and the pool is built from
    // catalog.tags, so an orphan id could never score anyway.
    const tags: number[] = [];
    for (const id of s.tags) {
      const i = tagIndex.get(id);
      if (i !== undefined) tags.push(i);
    }
    let cover: [number, string] | null = null;
    if (s.coverImageUrl) {
      const [p, rest] = splitUrl(s.coverImageUrl);
      cover = [prefixes.id(p), rest];
    }
    return [
      s.id,
      s.title,
      s.year,
      s.eps,
      tags,
      cover,
      s.genres,
      s.averageScore,
      s.description,
      s.streamingServices.map((x): WireStream => [x.name, urls.id(x.url), x.icon, x.color]),
      s.runtimeMin,
      s.certification,
      s.sagaName,
    ];
  });
  return { v: WIRE_VERSION, tags: catalog.tags, urls: urls.values, prefixes: prefixes.values, series };
}

export function unpackCatalog(wire: WireCatalog): { series: Series[]; tags: TagInfo[] } {
  if (wire.v !== WIRE_VERSION) throw new Error(`Unsupported catalog wire version ${String(wire.v)}`);
  const { tags, urls, prefixes } = wire;
  const series: Series[] = wire.series.map((w) => {
    const base: Series = {
      id: w[W.Id],
      title: w[W.Title],
      year: w[W.Year],
      eps: w[W.Eps],
      tags: w[W.Tags].map((i) => tags[i]?.id).filter((id): id is string => id !== undefined),
      coverImageUrl: w[W.Cover] ? `${prefixes[w[W.Cover][0]] ?? ""}${w[W.Cover][1]}` : null,
      genres: w[W.Genres],
      averageScore: w[W.Score],
      description: w[W.Description],
      streamingServices: w[W.Streaming].map(([name, u, icon, color]) => ({ name, url: urls[u] ?? "", icon, color })),
    };
    // Film-only optionals stay ABSENT on anime items (not `undefined`
    // keys), so `"runtimeMin" in item` and JSON output match the adapter's.
    if (w[W.Runtime] !== undefined) base.runtimeMin = w[W.Runtime];
    if (w[W.Certification] !== undefined) base.certification = w[W.Certification];
    if (w[W.Saga] !== undefined) base.sagaName = w[W.Saga];
    return base;
  });
  return { series, tags };
}
