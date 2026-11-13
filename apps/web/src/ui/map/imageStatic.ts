/** ImageStatic degradation in the manifest's Mars projection (T02.06, FR-01/02, C9 §6, FD-101). */
import ImageLayer from "ol/layer/Image.js";
import Static from "ol/source/ImageStatic.js";
import ImageWrapper from "ol/Image.js";
import type BaseEvent from "ol/events/Event.js";
import type { ImageLike } from "ol/DataTile.js";
import type { Layer } from "@marswalk/protocol";
import type { LoadedSite } from "../context";
import { ensureMarsProjection } from "./projection";

type Extent = [number, number, number, number];

export interface ImageStaticOptions {
  /** Draw these decoded pixels instead of the file as it is (a data-encoded slope image coloured by the scenario). */
  load?: () => Promise<ImageLike>;
  className?: string;
  zIndex?: number;
  /** A file other than the layer's own PNG asset: the coarsest tile of a tiled layer (FD-101). */
  url?: string;
  /** The image's footprint in projected metres. Default: the AOI, which a pipeline PNG covers (BD-23). */
  imageExtent?: Extent;
  visible?: boolean;
}

/** A static source with a replaceable decoded image loader, for data-encoded slope images. */
class DecodedStatic extends Static {
  private readonly decoded: ImageWrapper;
  constructor(options: ConstructorParameters<typeof Static>[0], load: () => Promise<ImageLike>) {
    super(options);
    const extent = options.imageExtent;
    this.decoded = new ImageWrapper(extent, undefined, 1, async () => {
      const image = await load();
      return { image, extent, pixelRatio: 1, resolution: [(extent[2]! - extent[0]!) / image.width, (extent[3]! - extent[1]!) / image.height] };
    });
    this.decoded.addEventListener("change", (event) => this.handleImageChange(event as BaseEvent));
  }
  override getImageInternal(): ImageWrapper { return this.decoded; }
}

/** The image source alone, so a layer can swap it when the scenario's slope limits change. */
export function createImageStaticSource(site: LoadedSite, def: Layer, options: ImageStaticOptions = {}): Static {
  let url = options.url;
  if (url === undefined) {
    const asset = site.assets.get(def.asset_id);
    if (!asset || asset.format !== "png") throw new Error(`Static image unavailable: ${def.asset_id}`);
    url = asset.url;
  }
  const config = {
    url,
    imageExtent: options.imageExtent ? [...options.imageExtent] : [...site.site.aoi.extent_m],
    projection: ensureMarsProjection(site.site),
    interpolate: false,
    attributions: def.source_ids.flatMap(id => {
      const source = site.sources.get(id);
      return source ? [`${source.title} — ${source.credit}${source.authors ? ` (${source.authors})` : ""}`] : [];
    }),
  };
  return options.load ? new DecodedStatic(config, options.load) : new Static(config);
}

/** An ImageStatic layer over the AOI (or the given footprint), clipped to the AOI, in the Mars projection. */
export function createImageStatic(site: LoadedSite, def: Layer, options: ImageStaticOptions = {}): ImageLayer<Static> {
  return new ImageLayer({
    source: createImageStaticSource(site, def, options),
    extent: [...site.site.aoi.extent_m],
    visible: options.visible ?? def.default_visible,
    className: options.className,
    zIndex: options.zIndex,
  });
}
