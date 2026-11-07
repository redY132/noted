export interface HelpEntry { id: string; group: string; title: string; keys?: string; route?: string; detail: string; terms?: string }
export function helpEntries(mac: boolean): HelpEntry[] {
  const mod = mac ? 'Cmd' : 'Ctrl';
  return [
    { id:'open',group:'Navigation',title:'Open a saved note',keys:`${mod} P`,detail:'Search saved notes locally. Use arrow keys and Enter to open a result; Escape returns to writing.' },
    { id:'new',group:'Navigation',title:'Create a note',keys:`${mod} N`,detail:'The current draft is saved before the new note opens. A failed save keeps the draft open.' },
    { id:'history',group:'Navigation',title:'Back, Forward and note history',...(mac?{route:'View > Back to note / Forward to note'}:{keys:'Alt Left / Alt Right'}),detail:'Revisit this session with reading position and selection restored. View > Note history lists visits and unavailable notes.' },
    { id:'heading',group:'Navigation',title:'Go to a heading',route:'View > Go to heading',detail:'Search H1–H6 titles in logical reading order. Choosing one moves within the same note; Escape preserves your selection.' },
    { id:'library-search',group:'Navigation',title:'Search the library',keys:'/',detail:'When focus is outside a text field or note, reveal Browse and focus its search. Typing a slash in a note keeps the character.',terms:'slash workspace folders' },
    { id:'focus',group:'Navigation',title:'Toggle Focus mode',keys:'F8',detail:'Hide optional controls for writing, then restore their previous arrangement. View also provides this command.' },
    { id:'save',group:'Writing',title:'Save now',keys:`${mod} S`,detail:'Editing autosaves after a short pause. Save now flushes the current draft; a failed save keeps the draft open.' },
    { id:'undo',group:'Writing',title:'Undo and Redo',keys:`${mod} Z / ${mod} Shift Z`,detail:'Text, formatting and layout changes share the current editor’s Undo history.' },
    { id:'find',group:'Writing',title:'Find and replace in this note',keys:`${mod} F / ${mod} H`,detail:'Search the open note. Enter moves to the next match; Shift Enter moves to the previous one. Workspace search is separate.' },
    { id:'link',group:'Writing',title:'Add or edit a web link',keys:`${mod} K`,detail:'Apply a URL to the selected text. Use Note in Text formatting to insert a stable link to another local note.' },
    { id:'inline',group:'Writing',title:'Bold, Italic and Underline',keys:`${mod} B / ${mod} I / ${mod} U`,detail:'Toggle inline formatting for the selection or the text you type next.' },
    { id:'indent',group:'Writing',title:'Indent and outdent',keys:'Tab / Shift Tab',detail:'Indent paragraphs or nest list items. The Outline schema uses list nesting rather than free paragraph indentation.' },
    { id:'leave-editor',group:'Writing',title:'Move from editing to app controls',keys:'Escape, then Tab / Shift Tab',detail:'Release the editor’s indentation behavior for the next Tab, moving to the next or previous app control.' },
    { id:'note-actions',group:'Recovery and appearance',title:'Find note actions in a short writing area',route:'View > Note actions',detail:'Presets, schemas, AI formatting, block links and Trash remain available here when the writing toolbar is compact.' },
    { id:'previous',group:'Recovery and appearance',title:'Recover the previous save',route:'View > Previous save',detail:'Compare the immediately previous completed save and recover it into a new note. Save the current draft before switching. This keeps one prior save, not a timeline.' },
    { id:'backups',group:'Recovery and appearance',title:'Back up or restore a workspace',route:'View > Workspace details',detail:'On desktop, create a checksummed workspace backup or restore into a separate new workspace. Keep backups for longer-term recovery.' },
    { id:'trash',group:'Recovery and appearance',title:'Restore a trashed note',route:'Browse > Trash',detail:'Restore the same note ID with its retained assets and connections. This release does not permanently delete notes.' },
    { id:'appearance',group:'Recovery and appearance',title:'Change the interface appearance',route:'Appearance',detail:'Choose System, Light or Dark and an accent color. Authored note colors and layout remain part of the document.' },
    { id:'ai-flow',group:'AI proposals',title:'Generate, compare and apply a proposal',route:'Format with AI',detail:'Describe a change, choose Generate proposal, then compare and Apply or Reject. Undo is available after applying. Closing retains the explicitly started job and its route back to review.' },
    { id:'ai-recover',group:'AI proposals',title:'Load a completed proposal',route:'Format with AI > Load proposal',detail:'If a finished result could not open, Load proposal retries that saved local result without another generation. Saved proposals can still be checked when sign-in discovery fails. Privacy and freshness are checked again before comparison.',terms:'retry ready recovery account' },
    { id:'ai-cancel',group:'AI proposals',title:'Follow progress or cancel generation',route:'AI status below the writing toolbar',detail:'Closing the dialog keeps explicitly started work running. Open generation returns to it. Cancel generation requests a stop; Cancellation requested stays pending until local status confirms an outcome. Already processed model usage cannot be recalled.',terms:'cancellation stopping background' },
    { id:'ai-account',group:'AI proposals',title:'Understand where AI runs',route:'Generate proposal',detail:'The Codex client runs locally; model inference is hosted by OpenAI. Generate sends the displayed saved note and instructions through your existing ChatGPT sign-in, using that account’s Codex limits.',terms:'subscription cloud privacy' },
    { id:'ai-guide',group:'AI proposals',title:'Use schema rules and a full document guide',route:'Format with AI > Adhere to selected schema',detail:'Formal rules accompany this goal. Including the full guidance document requires fresh per-request consent. Private imported notes remain excluded from AI.',terms:'guidance permissions' },
    { id:'ai-component',group:'AI proposals',title:'Create an interactive component',route:'Format with AI > Create interactive component',detail:'Review generated component code and its sandboxed preview. New proposals start disabled; choose Enable for the exact version before running it.' },
    { id:'agent-request',group:'AI proposals',title:'Distinguish an external-agent request',route:'Advanced: external agents and saved requests',detail:'Create request makes one saved note available to an allowed agent for up to 24 hours, including outside selected folders. It does not start a model job or wake an agent; ask a connected client to check Noted. Hosted chats require a separate approved connection.',terms:'MCP bridge pending automatic' },
  ];
}
const normalize = (text: string) => text.toLowerCase().replace(/[+,]/g,' ').replace(/\s+/g,' ').trim();
export function matchingHelp(entries: HelpEntry[], query: string) {
  const needle=normalize(query),words=needle.split(' ').filter(Boolean);
  const exactKeys=needle?entries.filter(entry=>entry.keys&&normalize(entry.keys).split(/\s*\/\s*/).includes(needle)):[];
  if(exactKeys.length)return exactKeys;
  return entries.filter(entry=>{const text=normalize([entry.group,entry.title,entry.keys,entry.route,entry.detail,entry.terms].join(' '));return words.every(word=>text.includes(word));});
}
