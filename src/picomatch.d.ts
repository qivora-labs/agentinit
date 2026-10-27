// tinyglobby depends on fdir, whose types default-import picomatch.
// picomatch 4 ships no types, and that import is part of this program.
declare module 'picomatch' {
  const picomatch: (glob: string) => (path: string) => boolean;
  export default picomatch;
}
