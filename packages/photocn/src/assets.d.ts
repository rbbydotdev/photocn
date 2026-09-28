declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*?inline-worker" {
  const source: string;
  export default source;
}
