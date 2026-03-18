declare module "vt-pbf" {
  export function fromGeojsonVt(
    layers: Record<string, unknown>,
    options?: unknown
  ): Uint8Array;

  const vtpbf: {
    fromGeojsonVt: typeof fromGeojsonVt;
  };

  export default vtpbf;
}
