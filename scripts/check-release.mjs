import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "source.js",
  "main.js",
  "styles.css",
  "manifest.json",
  "defuddle.js",
  "DEFUDDLE-LICENSE.txt",
  "starter-vault/START-HERE.md",
  "starter-vault/AI Knowledge OS/README.md",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const [manifest, packageJson, versions] = await Promise.all([
  readJson("manifest.json"),
  readJson("package.json"),
  readJson("versions.json"),
]);

for (const path of requiredFiles) {
  await access(path);
}

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`,
  );
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(
    `versions.json must map ${manifest.version} to ${manifest.minAppVersion}`,
  );
}

console.log(`Release metadata verified for v${manifest.version}.`);
