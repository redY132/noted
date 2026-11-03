import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('output/playwright',{recursive:true});
await writeFile('output/vite-document.config.ts',`import base from '../vite.config.ts';
export default {...base,cacheDir:'output/vite-document-cache',server:{...base.server,port:1430,strictPort:true}};
`);
console.log('Created isolated document browser config at output/vite-document.config.ts (port 1430). Use a disposable browser profile.');
