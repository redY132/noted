from pathlib import Path
import json,tempfile,unittest,sys
sys.path.insert(0,str(Path(__file__).parent))
from test_logseq_private_import import graph,database,NODE,K,U
from logseq_sqlite_snapshot import token
from logseq_diagnostics import run
class DiagnosticTests(unittest.TestCase):
    def test_fixed_categories_never_disclose_note_filename_or_outside_path(self):
        with tempfile.TemporaryDirectory(prefix='noted-diagnostic-fixture-') as tmp:
            root=Path(tmp);d,s=graph()
            for a,v in [('logseq.property.asset/type','pdf'),('logseq.property.asset/external-file-name',r'C:\PRIVATE_PATH_CANARY\PRIVATE_FILENAME_CANARY.pdf'),('logseq.property.asset/checksum','0'*64),('logseq.property/background-color','#123456')]:
                row=[2,K(a),v,536870913];d[token(row)]=row
            source=database(root/'export',d,s);assets=root/'assets';assets.mkdir();result=run(source,NODE,assets)
            self.assertEqual(result['status'],'diagnosed');self.assertEqual(result['attachmentPDF'],1);self.assertEqual(result['missingWithSHA256'],1);self.assertEqual(result['declaredFilenameOutsideScope'],1);self.assertEqual(result['backgroundHex'],1);self.assertNotIn('CANARY',json.dumps(result));self.assertTrue(result['sourceUnchanged']);self.assertFalse(result['imported'])
    def test_macro_classification_skips_code_literals_and_has_no_dynamic_key_output(self):
        with tempfile.TemporaryDirectory(prefix='noted-diagnostic-fixture-') as tmp:
            root=Path(tmp);d,s=graph()
            for key,row in list(d.items()):
                if row[0]==2 and row[1]==K('block/title'):del d[key]
            row=[2,K('block/title'),'{{embed [[PRIVATE_REFERENCE_CANARY]]}} {{query (property)}} `{{renderer literal}}` {{PRIVATE_MACRO_CANARY}} $$x$$',536870913];d[token(row)]=row
            source=database(root/'export',d,s);assets=root/'assets';assets.mkdir();result=run(source,NODE,assets)
            self.assertEqual(result['macroEmbed'],1);self.assertEqual(result['macroQuery'],1);self.assertEqual(result['macroRenderer'],0);self.assertEqual(result['macroOther'],1);self.assertEqual(result['mathDelimited'],1);self.assertNotIn('CANARY',json.dumps(result))
    def test_reference_colors_and_page_recycle_categories_contain_only_fixed_counters(self):
        with tempfile.TemporaryDirectory(prefix='noted-diagnostic-fixture-') as tmp:
            root=Path(tmp);d,s=graph()
            for e,a,v in [(904,'block/title','yellow'),(904,'logseq.property/built-in?',True),(2,'logseq.property/background-color',904),(6,'logseq.property/deleted-at',1234)]:
                row=[e,K(a),v,536870913];d[token(row)]=row
            source=database(root/'export',d,s);assets=root/'assets';assets.mkdir();result=run(source,NODE,assets)
            self.assertEqual(result['backgroundReference'],1);self.assertEqual(result['backgroundResolvedPalette'],1);self.assertEqual(result['backgroundUnsupported'],0)
            self.assertEqual(result['recycledPages'],1);self.assertEqual(result['recycledBlocks'],0)
            self.assertTrue(all(type(v) in (bool,int) or v is None for k,v in result.items() if k not in {'status','code'}))
    def test_asset_integrity_mismatch_is_blocked_with_a_fixed_code(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='noted-diagnostic-fixture-') as tmp:
            root=Path(tmp);source=database(root/'export');assets=root/'assets';assets.mkdir();(assets/'synthetic.txt').write_bytes(b'SYNTHETIC_BYTES')
            with patch('logseq_diagnostics.fingerprint',side_effect=['0'*64,'1'*64]):result=run(source,NODE,assets)
            self.assertEqual(result['status'],'blocked');self.assertEqual(result['code'],'SOURCE_ASSET_INTEGRITY_CHANGED');self.assertFalse(result['assetsUnchanged'])
            self.assertTrue(result['sourceUnchanged']);self.assertFalse(result['imported'])
    def test_missing_asset_usage_is_aggregate_and_distinguishes_library_records(self):
        with tempfile.TemporaryDirectory(prefix='noted-diagnostic-fixture-') as tmp:
            root=Path(tmp);d,s=graph()
            for e in [80,81]:
                for a,v in [('block/title','PRIVATE_ASSET_CANARY'),('block/uuid',U(e)),('block/page',900),('logseq.property.asset/type','png'),('logseq.property.asset/checksum','0'*64)]:
                    row=[e,K(a),v,536870913];d[token(row)]=row
            row=[2,K('block/refs'),80,536870913];d[token(row)]=row
            source=database(root/'export',d,s);assets=root/'assets';assets.mkdir();result=run(source,NODE,assets)
            self.assertEqual(result['missingUUIDAssets'],2);self.assertEqual(result['missingDirectAuthoredReferences'],1);self.assertEqual(result['missingTransitiveAuthoredReferences'],1)
            self.assertEqual(result['missingNotReferencedFromAuthored'],1);self.assertEqual(result['missingWithBuiltinOwner'],2);self.assertNotIn('CANARY',json.dumps(result))
if __name__=='__main__':unittest.main()
