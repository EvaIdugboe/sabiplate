import { access, writeFile } from 'node:fs/promises';

const files = ['build.mjs', 'repair-images-v3.mjs'];
for (const file of files) {
  try {
    await access(file);
  } catch {
    const url = `https://raw.githubusercontent.com/EvaIdugboe/sabiplate/main/${file}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Could not fetch ${file}: ${response.status} ${response.statusText}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`Fetched ${file} from the SabiPlate GitHub repository.`);
  }
}

await import('./build.mjs');
await import('./repair-images-v3.mjs');
