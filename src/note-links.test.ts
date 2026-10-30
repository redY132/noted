import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNoteLink, noteLinkTarget } from './note-links.ts';

test('note and web links route without allowing file or command schemes', () => {
  const id = '12345678-1234-1234-1234-123456789012';
  assert.deepEqual(noteLinkTarget(`noted://note/${id}`), { kind: 'note', destination: id });
  assert.deepEqual(noteLinkTarget('https://example.com/a?q=1#b'), { kind: 'web', destination: 'https://example.com/a?q=1#b' });
  assert.equal(normalizeNoteLink(' HTTP://EXAMPLE.COM '), 'http://example.com/');
  assert.equal(normalizeNoteLink('https://example.com/' + '字'.repeat(300)), null, 'encoded URLs must also fit the persisted length limit');
  for (const value of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,x', 'noted://note/../x', 'noted://note/'+id+'?command=x', 'https://user:password@example.com', 'https://exam\nple.com', 'https:\\example.com', '', null, 'https://example.com/'+ 'x'.repeat(2048)]) assert.equal(normalizeNoteLink(value), null);
});
