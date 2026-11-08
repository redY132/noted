"""Verify one native draft via an exact disposable profile; never enumerate Downloads."""
import argparse
import hashlib
import json
import re
import sqlite3
import tempfile
from pathlib import Path


def normalized(value):
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [normalized(v) for v in value]
    return value


def checked_file(path, limit=32 * 1024 * 1024):
    if path.is_symlink() or path.resolve() != path.absolute():
        raise ValueError('REDIRECTED_FILE')
    if not path.is_file() or path.stat().st_size > limit:
        raise ValueError('FILE_MISSING_OR_OVERSIZED')
    return path.read_bytes()


def verify(fixture, log):
    temp = Path(tempfile.gettempdir()).resolve()
    if fixture.parent.resolve() != temp or not re.fullmatch(r'noted-simple-ai-[A-Za-z0-9]+', fixture.name):
        raise ValueError('EXACT_GENERATED_FIXTURE_REQUIRED')
    if log.parent.parent.resolve() != temp or not re.fullmatch(r'noted cached proposal trial-[a-f0-9]+', log.parent.name):
        raise ValueError('OWNED_TRIAL_LOG_REQUIRED')
    result = next(json.loads(line) for line in checked_file(log).decode('utf-8-sig').splitlines() if line.startswith('{"passed":'))
    if not all(result.get(k) is True for k in ('passed', 'native', 'syntheticOnly', 'noGenerationRequested')):
        raise ValueError('NATIVE_UI_CHECKS_INCOMPLETE')
    expected = json.loads(result['draftExportAscii'])
    note_id = expected['id']
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', note_id):
        raise ValueError('INVALID_SYNTHETIC_ID')
    saved = json.loads(checked_file(fixture / 'workspace' / 'notes' / (note_id + '.json')))
    # load_note adds projected content and the derived revision token to stored V2 JSON.
    persisted_expected = {k: v for k, v in expected['externalBefore'].items() if k not in ('content', 'revisionToken')}
    if saved != persisted_expected or saved['title'] != 'Synthetic recovery external save':
        raise ValueError('SAVED_EXTERNAL_VERSION_CHANGED')
    history = fixture / 'fresh-webview-profile' / 'EBWebView' / 'Default' / 'History'
    checked_file(history)
    db = sqlite3.connect(history.as_uri() + '?mode=ro&immutable=1', uri=True)
    try:
        rows = db.execute('SELECT target_path, received_bytes, total_bytes, interrupt_reason FROM downloads WHERE target_path LIKE ? LIMIT 20', ('%' + note_id + '.draft%',)).fetchall()
    finally:
        db.close()
    found = []
    for target, received, total, interrupt in rows:
        artifact = Path(target)
        if not re.fullmatch(re.escape(note_id) + r'\.draft(?: \(\d+\))?\.json', artifact.name):
            continue
        raw = checked_file(artifact)
        draft = json.loads(raw)
        if draft.get('id') != note_id or draft.get('title') != expected['title']:
            raise ValueError('ARTIFACT_IDENTITY_MISMATCH')
        if draft.get('formatVersion') != 2 or not isinstance(draft.get('document'), dict):
            raise ValueError('V2_DOCUMENT_MISSING')
        if normalized(draft['content']) != normalized(expected['content']):
            raise ValueError('EXPORTED_STRUCTURE_CHANGED')
        if 'Unicode caf\u00e9 \u65e5\u672c\u8a9e \U0001f600.' not in json.dumps(draft['content'], ensure_ascii=False):
            raise ValueError('UNICODE_CONTENT_MISSING')
        if interrupt or len(raw) != received or len(raw) != total:
            raise ValueError('DOWNLOAD_INCOMPLETE')
        found.append({'syntheticFilename': artifact.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    if len(found) != 1:
        raise ValueError('EXACT_ARTIFACT_NOT_ESTABLISHED')
    return {'passed': True, 'syntheticOnly': True, 'artifact': found[0], 'savedExternalVersionPreserved': True, 'uiChecks': len(result['checks']), 'uiProfiles': len(result['profiles']), 'nativeDialogCancellation': 'unverified', 'destinationSentinelSafety': 'unverified'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--log', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.fixture, args.log)))
    except (ValueError, KeyError, StopIteration, OSError, sqlite3.Error):
        raise SystemExit('NATIVE_DRAFT_VERIFICATION_FAILED') from None
