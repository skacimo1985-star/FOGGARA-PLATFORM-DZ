// A request may finish after the user has selected a different field or scene.
// Capture a lease before IO; invalidate it synchronously when inputs change.
export function createGisRequestScope() {
  let epoch = 0;
  return {
    invalidate() { epoch += 1; },
    capture() {
      const started = epoch;
      return () => started === epoch;
    },
  };
}
