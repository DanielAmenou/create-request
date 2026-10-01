// Skip husky in CI and when the package is installed as a dependency (no devDependencies).
if (process.env.CI || process.env.NODE_ENV === "production") process.exit(0);
try {
  const { default: husky } = await import("husky");
  console.log(husky());
} catch {
  // husky is not installed — nothing to set up
}
