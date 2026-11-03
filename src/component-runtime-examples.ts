import type { ComponentDefinition } from './component-runtime-types.ts';

/** Shipped examples remain inert until their exact version is explicitly enabled. */
export const counterComponent: ComponentDefinition = {
  manifest: { formatVersion: 1, id: 'noted.counter', version: 1, name: 'Counter', fallback: 'Counter (interactive component disabled)', properties: { label: { type: 'string', default: 'Count' } }, persistentState: { count: { type: 'number', default: 0, min: -1000000, max: 1000000 } }, transientState: {}, searchText: ['label'] },
  source: `({
    render({properties,state},ui){ return ui.row([ui.text(properties.label+': '+state.count),ui.button('−','decrease'),ui.button('+','increase')]); },
    reduce({state},event){ return {state:{count:Math.max(-1000000,Math.min(1000000,state.count+(event.id==='increase'?1:event.id==='decrease'?-1:0)))}}; }
  })`,
};
export const flashcardComponent: ComponentDefinition = {
  manifest: { formatVersion: 1, id: 'noted.flashcard', version: 1, name: 'Flashcard', fallback: 'Flashcard (interactive component disabled)', properties: { front: { type: 'string', default: 'What would you like to remember?' }, back: { type: 'string', default: 'Write the answer here.' } }, persistentState: {}, transientState: { flipped: { type: 'boolean', default: false } }, searchText: ['front', 'back'] },
  source: `({
    render({properties,transient},ui){ return ui.column([ui.text(transient.flipped?properties.back:properties.front),ui.button(transient.flipped?'Show question':'Reveal answer','flip')],{gap:12,padding:12}); },
    reduce({transient},event){ return {transient:{flipped:event.id==='flip'?!transient.flipped:transient.flipped}}; }
  })`,
};
export const builtinComponentDefinitions = [counterComponent, flashcardComponent];
