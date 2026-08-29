import { access, writeFile } from 'node:fs/promises';

const files = ['build.mjs', 'hero-preview.mjs'];
for (const file of files) {
  try {
    await access(file);
  } catch {
    const url = `https://raw.githubusercontent.com/EvaIdugboe/sabiplate/main/${file}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Could not fetch ${file}: ${response.status} ${response.statusText}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`Fetched ${file} from the SabiPlate main branch.`);
  }
}

await import('./build.mjs');
await import('./hero-preview.mjs');
console.log('Approved mixed hero build complete. Recipe image mapping remains unchanged.');
