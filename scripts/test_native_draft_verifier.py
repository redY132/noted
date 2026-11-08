import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid

spec = importlib.util.spec_from_file_location('verifier', Path(__file__).with_name('verify-native-draft.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class DraftVerifierTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.gettempdir()) / ('noted-simple-ai-' + uuid.uuid4().hex)
        trial = Path(tempfile.gettempdir()) / ('noted cached proposal trial-' + uuid.uuid4().hex)
        trial.mkdir()
        self.log = trial / 'find-keyboard.log'
        self.note_id = str(uuid.uuid4())
        self.notes = self.root / 'workspace' / 'notes'
        self.notes.mkdir(parents=True)
        self.external = {'id': self.note_id, 'title': 'Synthetic recovery external save'}
        (self.notes / (self.note_id + '.json')).write_text(json.dumps(self.external), encoding='utf-8')
        content = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Unicode caf\u00e9 \u65e5\u672c\u8a9e \U0001f600.'}]}]}
        expected = {'id': self.note_id, 'title': 'Synthetic local draft', 'content': content, 'externalBefore': self.external}
        self.result = dict(passed=True, native=True, syntheticOnly=True, noGenerationRequested=True, checks=['fixture'], profiles=[], draftExportAscii=json.dumps(expected, ensure_ascii=True))
        self.log.write_text(json.dumps(self.result), encoding='utf-8')
        self.artifact = self.root / (self.note_id + '.draft.json')
        self.artifact.write_text(json.dumps(dict(id=self.note_id, title=expected['title'], formatVersion=2, document={}, content=content)), encoding='utf-8')
        history = self.root / 'fresh-webview-profile' / 'EBWebView' / 'Default' / 'History'
        history.parent.mkdir(parents=True)
        db = sqlite3.connect(history)
        try:
            db.execute('CREATE TABLE downloads(target_path TEXT, received_bytes INT, total_bytes INT, interrupt_reason INT)')
            size = self.artifact.stat().st_size
            db.execute('INSERT INTO downloads VALUES(?,?,?,?)', (str(self.artifact), size, size, 0))
            db.commit()
        finally:
            db.close()
        self.history = history

    def test_valid_ascii_transport_preserves_unicode(self):
        self.assertTrue(v.verify(self.root, self.log)['passed'])

    def test_missing_file_fails(self):
        self.artifact.unlink()
        with self.assertRaises(ValueError): v.verify(self.root, self.log)

    def test_changed_structure_fails(self):
        d = json.loads(self.artifact.read_text())
        d['content']['type'] = 'wrong'
        self.artifact.write_text(json.dumps(d), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'EXPORTED_STRUCTURE_CHANGED'): v.verify(self.root, self.log)

    def test_changed_saved_version_fails(self):
        (self.notes / (self.note_id + '.json')).write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'SAVED_EXTERNAL_VERSION_CHANGED'): v.verify(self.root, self.log)

    def test_interrupted_transfer_fails(self):
        db = sqlite3.connect(self.history)
        try:
            db.execute('UPDATE downloads SET interrupt_reason=1')
            db.commit()
        finally: db.close()
        with self.assertRaisesRegex(ValueError, 'DOWNLOAD_INCOMPLETE'): v.verify(self.root, self.log)

    def test_unfinished_ui_fails_before_artifact_access(self):
        self.result['passed'] = False
        self.log.write_text(json.dumps(self.result), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'NATIVE_UI_CHECKS_INCOMPLETE'): v.verify(self.root, self.log)

    def test_arbitrary_fixture_refused(self):
        with self.assertRaisesRegex(ValueError, 'EXACT_GENERATED_FIXTURE_REQUIRED'): v.verify(Path('unrelated'), self.log)


if __name__ == '__main__': unittest.main()
