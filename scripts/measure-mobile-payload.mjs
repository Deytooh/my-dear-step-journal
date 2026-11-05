import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// Production artifact measurement, not simulated device/network timing.
// Build first; optionally supply a second checkout root for a before/after comparison.
const roots = process.argv.slice(2);
for (const root of roots.length ? roots : ["."]) {
  const project = resolve(root);
  const server = join(project, ".output/server");
  const publicRoot = join(project, ".output/public");
  const manifestName = (await readdir(server)).find(
    (name) => name.startsWith("_tanstack-start-manifest_") && name.endsWith(".mjs"),
  );
  if (!manifestName)
    throw new Error(`Build manifest missing in ${server}. Run the production build first.`);
  const { tsrStartManifest } = await import(pathToFileURL(join(server, manifestName)).href);
  const { routes } = tsrStartManifest();
  const assetNames = await readdir(join(publicRoot, "assets"));
  const sizes = async (paths) => {
    const files = await Promise.all(
      [...new Set(paths)].map((file) => readFile(join(publicRoot, file.replace(/^\//, "")))),
    );
    return {
      raw: files.reduce((sum, bytes) => sum + bytes.length, 0),
      gzip: files.reduce((sum, bytes) => sum + gzipSync(bytes).length, 0),
    };
  };
  const pages = {};
  for (const route of ["/today", "/calendar", "/injections", "/progress"]) {
    pages[route] = await sizes(
      [...(routes.__root__.preloads ?? []), ...(routes[route].preloads ?? [])].filter((file) =>
        file.endsWith(".js"),
      ),
    );
  }
  const derivative = assetNames.find(
    (name) => name.startsWith("momo-hamster-small-") && name.endsWith(".webp"),
  );
  const canonical = JSON.parse(
    await readFile(join(project, "src/assets/momo-hamster.png.asset.json"), "utf8"),
  );
  console.log(
    JSON.stringify(
      {
        project,
        initialJavaScript: pages,
        css: await sizes(
          assetNames.filter((name) => name.endsWith(".css")).map((name) => `/assets/${name}`),
        ),
        mascot: {
          canonicalBytes: canonical.size,
          deliveredBytes: derivative
            ? (await stat(join(publicRoot, "assets", derivative))).size
            : canonical.size,
        },
        notes:
          "Manifest preload bytes before optional interactions; gzip is local gzipSync, not observed wire size. A populated Progress page additionally loads WeightChart on demand. Fonts, server HTML, headers and auth/network latency are excluded.",
      },
      null,
      2,
    ),
  );
}
