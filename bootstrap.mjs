// Build order: unpack the archived app, then apply the current release patch.
await import('./build.mjs');
await import('./release/patch-release.mjs');
console.log('SabiPlate build complete.');
