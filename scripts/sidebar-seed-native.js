async page => {
  await page.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const status = await invoke('workspace_status');
    if (!status.path.includes('noted-sidebar-ui-') || (await invoke('list_notes')).length || localStorage.getItem('noted-sidebar-fixture')) throw new Error('Fresh disposable sidebar workspace required');
    const folder = (name, parentId) => invoke('create_folder', { name, parentId });
    const project = await folder('Synthetic field journal', null), research = await folder('Research', project.id), observations = await folder('Observations', research.id);
    const empty = await folder('Empty collection', project.id), long = await folder('A deliberately long collection name for navigation reflow', null);
    let parent = observations.id;
    for (const name of ['Archive', '2026', 'November', 'Week one']) parent = (await folder(name, parent)).id;
    const notes = [];
    for (let i = 0; i < 105; i++) {
      const folderId = i < 95 ? observations.id : i < 100 ? parent : i < 104 ? long.id : null;
      const note = await invoke('create_note', { title: i === 0 ? 'Synthetic trail map' : i === 1 ? 'A very long synthetic note title that should wrap without covering controls or leaving its popup' : `Synthetic observation ${String(i + 1).padStart(3, '0')}`, folderId });
      note.content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: `synthetic-${i}` }, content: [{ type: 'text', text: 'Synthetic sidebar fixture. No personal notes are used.' }] }] };
      await invoke('save_note', { note, expectedRevision: note.revision }); notes.push(note.id);
    }
    for (const [start, end] of [[1, 18], [81, 95]]) for (let i = start; i < end; i++) await invoke('set_relation', { a: notes[i - 1], b: notes[i], connected: true, dismissed: null, expectedRevision: null, strength: null });
    localStorage.setItem('noted-sidebar-fixture', JSON.stringify({ project: project.id, research: research.id, observations: observations.id, empty: empty.id, long: long.id, leaf: parent, notes }));
  });
  await page.reload();
  return { syntheticOnly: true, fixtureReady: true, notes: 105 };
}
