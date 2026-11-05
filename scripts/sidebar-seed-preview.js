async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Isolated sidebar preview required');
  await page.evaluate(async () => {
    if (window.__TAURI_INTERNALS__ || localStorage.getItem('noted-browser-preview-v1')) throw new Error('Fresh synthetic preview required');
    const { api } = await import('/src/api.ts');
    const project = await api.createFolder('Synthetic field journal', null);
    const research = await api.createFolder('Research', project.id);
    const observations = await api.createFolder('Observations', research.id);
    const empty = await api.createFolder('Empty collection', project.id);
    const long = await api.createFolder('A deliberately long collection name for navigation reflow', null);
    let parent = observations.id;
    for (const name of ['Archive', '2026', 'November', 'Week one']) parent = (await api.createFolder(name, parent)).id;
    const notes = [];
    for (let i = 0; i < 105; i++) {
      const folder = i < 95 ? observations.id : i < 100 ? parent : i < 104 ? long.id : null;
      const note = await api.createNote(i === 0 ? 'Synthetic trail map' : i === 1 ? 'A very long synthetic note title that should wrap without covering controls or leaving its popup' : `Synthetic observation ${String(i + 1).padStart(3, '0')}`, folder);
      note.content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: `synthetic-${i}` }, content: [{ type: 'text', text: 'Synthetic sidebar fixture. No personal notes are used.' }] }] };
      await api.save(note, note.revision); notes.push(note.id);
    }
    for (let i = 1; i < 18; i++) await api.setRelation(notes[i - 1], notes[i], true);
    for (let i = 81; i < 95; i++) await api.setRelation(notes[i - 1], notes[i], true);
    localStorage.setItem('noted-sidebar-fixture', JSON.stringify({ project: project.id, research: research.id, observations: observations.id, empty: empty.id, long: long.id, leaf: parent, notes }));
    localStorage.setItem('noted-layout-v2', JSON.stringify({ version: 2, panels: { navigation: true, notes: true } }));
  });
  await page.reload();
  return { syntheticOnly: true, notes: 105, fixtureReady: true };
}
