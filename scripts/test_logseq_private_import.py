"""Synthetic-only rich graph and actual native publication/privacy checks."""
from pathlib import Path
import hashlib,json,os,sqlite3,subprocess,tempfile,unittest,sys
sys.path.insert(0,str(Path(__file__).parent))
from test_logseq_sqlite_snapshot import encode,K,M,NODE,CODEC
from logseq_graph import convert
from logseq_sqlite_snapshot import token,Rejected
from logseq_private_import import run
ROOT=Path(__file__).resolve().parent.parent
PUBLISHER=ROOT/'src-tauri/target/debug/noted-private-import.exe'
AGENT=ROOT/'src-tauri/target/debug/noted-agent.exe'
U=lambda n:{'uuid':f'11111111-1111-4111-8111-{n:012d}'}

def graph():
    schema=M(**{'db/ident':M(**{'db/unique':K('db.unique/identity')}),'block/tags':M(**{'db/valueType':K('db.type/ref'),'db/cardinality':K('db.cardinality/many')}),'custom/reviewer':M(**{'db/valueType':K('db.type/ref')}),'logseq.property/status':M(**{'db/valueType':K('db.type/ref')})})
    rows=[]
    def entity(e,**fields):
        for key,value in fields.items():rows.append([e,K(key.replace('_','-')),value,536870913])
    entity(900,**{'db/ident':K('logseq.class/Page'),'block/title':'Page','logseq.property/built-in?':True})
    entity(901,**{'db/ident':K('logseq.class/Property'),'block/title':'Property','logseq.property/built-in?':True})
    entity(902,**{'db/ident':K('logseq.property/status.done'),'block/title':'Done','logseq.property/built-in?':True})
    entity(903,**{'db/ident':K('logseq.property/status'),'block/title':'Status','logseq.property/built-in?':True})
    entity(999,**{'db/ident':K('logseq.kv/schema-version'),'kv/value':M(major=65,minor=35)})
    entity(998,**{'db/ident':K('logseq.kv/db-type'),'kv/value':'db'})
    entity(40,**{'db/ident':K('custom/priority'),'block/title':'Priority','block/tags':901,'block/uuid':U(40)})
    entity(41,**{'db/ident':K('custom/reviewer'),'block/title':'Reviewer','block/tags':901,'block/uuid':U(41)})
    entity(1,**{'block/title':'Synthetic page','block/name':'synthetic page','block/uuid':U(1),'block/tags':900,'custom/priority':42,'custom/reviewer':6})
    entity(6,**{'block/title':'Other page','block/name':'other page','block/uuid':U(6),'block/tags':900})
    entity(2,**{'block/title':'**Bold** and *italic* and ^^highlight^^ link [['+U(6)['uuid']+']]','block/uuid':U(2),'block/parent':1,'block/page':1,'block/order':'a0','custom/priority':7})
    entity(3,**{'block/title':"const literal = '[[' + 'not a reference';",'block/uuid':U(3),'block/parent':2,'block/page':1,'block/order':'a0','logseq.property.node/display-type':K('code'),'logseq.property.code/lang':'js'})
    entity(4,**{'block/title':'Synthetic done task','block/uuid':U(4),'block/parent':1,'block/page':1,'block/order':'a1','logseq.property/status':902})
    entity(5,**{'block/title':'Synthetic quote','block/uuid':U(5),'block/parent':1,'block/page':1,'block/order':'a2','logseq.property.node/display-type':K('quote')})
    return {token(d):d for d in rows},schema

def database(root,datoms=None,schema=None):
    if datoms is None:datoms,schema=graph()
    root.mkdir(parents=True,exist_ok=True);path=root/'fixture.sqlite';db=sqlite3.connect(path);db.execute('CREATE TABLE kvs(addr INTEGER PRIMARY KEY,content TEXT,addresses JSON)')
    meta=M(schema=schema,eavt=1001,eavt_metadata=M(count=len(datoms)))
    for addr,value in [(0,meta),(1,[]),(1001,M(keys=list(datoms.values())))]:db.execute('INSERT INTO kvs VALUES(?,?,NULL)',(addr,encode(value)))
    db.commit();db.close();return path

def mcp(root,method,args,hosted=False):
    requests=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'synthetic-import-test','version':'1'}}},{'jsonrpc':'2.0','method':'notifications/initialized','params':{}},{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':method,'arguments':args}}]
    command=[str(AGENT),'--workspace',str(root)]+(['--audience','hosted'] if hosted else [])
    result=subprocess.run(command,input='\n'.join(json.dumps(r) for r in requests)+'\n',stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',timeout=30)
    return result.stdout+result.stderr

class RichImportTests(unittest.TestCase):
    def test_custom_properties_schema_pages_hierarchy_fractional_order_refs_code_quote_and_tasks(self):
        datoms,schema=graph();b=convert(datoms,schema)
        self.assertEqual(b['counts']['pages'],4);self.assertEqual(b['counts']['blocks'],8)
        p=next(p for p in b['pages'] if p['sourceId']==1)
        self.assertEqual([c['id'] for c in p['children']],['logseq-'+U(n)['uuid'] for n in (2,4,5)])
        self.assertEqual(p['children'][0]['children'][0]['display'],'code');self.assertTrue(p['children'][1]['checked']);self.assertEqual(p['children'][2]['display'],'quote')
        self.assertTrue(any(x['name']=='Priority' and x['values'][0]['text']=='42' for x in p['properties']))
        self.assertIsNone(b['references'][U(6)['uuid']]['blockId']);self.assertGreater(b['counts']['archivedProperties'],0);self.assertFalse(any(x['name']=='block/tags' for x in p['properties']));self.assertEqual(p['children'][1]['properties'][0]['values'][0]['text'],'Done')
    def test_unsupported_rich_visuals_assets_recycle_and_dynamic_blocks_fail_without_payload_diagnostics(self):
        for attribute,value,code in [('logseq.property.asset/type',K('png'),'GRAPH_ASSET_ADAPTER_REQUIRED'),('logseq.property/deleted-at',1234,'GRAPH_RECYCLE_ADAPTER_REQUIRED'),('logseq.property.node/display-type',K('math'),'GRAPH_VISUAL_ADAPTER_REQUIRED')]:
            datoms,schema=graph();d=[2,K(attribute),value,536870913];datoms[token(d)]=d
            with self.assertRaises(Rejected) as error:convert(datoms,schema)
            self.assertEqual(error.exception.code,code);self.assertNotIn('Synthetic',str(error.exception))
    def test_missing_order_unknown_version_and_orphan_are_blocked(self):
        datoms,schema=graph()
        for key,d in list(datoms.items()):
            if d[0]==2 and d[1]==K('block/order'):del datoms[key]
        with self.assertRaises(Rejected) as error:convert(datoms,schema)
        self.assertEqual(error.exception.code,'GRAPH_ORDER_ADAPTER_REQUIRED')
    @unittest.skipUnless(PUBLISHER.exists() and AGENT.exists(),'Build the native importer and matching MCP companion first')
    def test_real_native_validate_publish_all_audiences_deny_and_original_archive_roundtrip(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);source=database(root/'export');before=source.read_bytes();names={p.name for p in source.parent.iterdir()}
            validated=run(source,NODE,PUBLISHER);self.assertEqual(validated.get('status'),'validated',validated);self.assertFalse(validated['imported'])
            workspace=root/'workspace';result=run(source,NODE,PUBLISHER,True,workspace)
            self.assertEqual(result.get('status'),'imported',result);self.assertEqual(result['notes'],4);self.assertEqual(result['privateDenied'],4)
            self.assertEqual(source.read_bytes(),before);self.assertEqual({p.name for p in source.parent.iterdir()},names)
            notes=[json.loads(p.read_text(encoding='utf-8')) for p in (workspace/'notes').glob('*.json')]
            p=next(p for p in notes if p['title']=='Synthetic page');content=json.dumps(p)
            self.assertIn('highlight',content);self.assertIn('noted://note/',content);self.assertIn('codeBlock',content);self.assertIn('blockquote',content);self.assertIn('taskItem',content)
            policy=json.loads((workspace/'ai-private.json').read_text(encoding='utf-8'));self.assertEqual(set(policy['noteIds']),{n['id'] for n in notes})
            # Deliberately force optional grants in this synthetic workspace:
            # the independent hard denial must still win for local and hosted.
            (workspace/'agent-access.json').write_text(json.dumps({'enabled':True,'allowHosted':True,'folderIds':policy['folderIds']}),encoding='utf-8')
            for hosted in (False,True):
                out=mcp(workspace,'get_note',{'id':p['id']},hosted);self.assertIn('AI_PRIVATE_NOTE',out);self.assertNotIn('Synthetic page',out)
                out=mcp(workspace,'search_notes',{'query':''},hosted);self.assertNotIn('Synthetic page',out)
                out=mcp(workspace,'list_folders',{},hosted);self.assertNotIn('Logseq import',out)
            legacy=ROOT/'src-tauri/target/release/noted-agent.exe'
            if legacy.exists():
                legacy_result=subprocess.run([str(legacy),'--workspace',str(workspace)],input='',capture_output=True,text=True,encoding='utf-8')
                self.assertNotIn('Synthetic page',legacy_result.stdout+legacy_result.stderr)
                # This checked-in test supports an older local release artifact;
                # the old executable must refuse its known restore guard.
                capabilities=subprocess.run([str(legacy),'--capabilities'],capture_output=True,text=True,encoding='utf-8')
                if not json.loads(capabilities.stdout).get('privateNoteExclusion'):
                    self.assertNotEqual(legacy_result.returncode,0)
            archive=list((workspace/'imports').glob('*/*.source'));self.assertEqual(len(archive),1);self.assertEqual(archive[0].read_bytes(),before)
            self.assertFalse((workspace/'.noted-private-import-incomplete').exists())
    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_local_png_is_materialized_without_network_and_original_asset_is_archived(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);datoms,schema=graph()
            for a,v in [('block/title','Synthetic image caption'),('block/uuid',U(8)),('block/parent',1),('block/page',1),('block/order','a3'),('logseq.property.asset/type',K('png'))]:
                d=[8,K(a),v,536870913];datoms[token(d)]=d
            source=database(root/'export',datoms,schema);assets=source.parent/'assets';assets.mkdir();image=assets/(U(8)['uuid']+'.png');original=(ROOT/'src-tauri/icons/icon.png').read_bytes();image.write_bytes(original)
            workspace=root/'workspace';result=run(source,NODE,PUBLISHER,True,workspace)
            self.assertEqual(result['status'],'imported',result);self.assertEqual(result['assets'],1);self.assertTrue(result['assetsUnchanged']);self.assertEqual(result['assetsChecked'],1)
            files=list((workspace/'assets').glob('*/*.image'));self.assertEqual(len(files),1);self.assertEqual(files[0].read_bytes(),original);self.assertEqual(image.read_bytes(),original)
            archived=list((workspace/'imports').glob('*/*.source'));self.assertEqual(len(archived),2);self.assertTrue(any(p.read_bytes()==original for p in archived))
            report=json.loads(next((workspace/'imports').glob('*/report.json')).read_text(encoding='utf-8'));self.assertEqual(len(report['files']),2);self.assertEqual(report['assets'],1)

    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_explicit_separate_asset_root_is_supported_and_fingerprinted(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);datoms,schema=graph()
            for a,v in [('block/title','Separate synthetic image'),('block/uuid',U(8)),('block/parent',1),('block/page',1),('block/order','a3'),('logseq.property.asset/type',K('png'))]:
                d=[8,K(a),v,536870913];datoms[token(d)]=d
            source=database(root/'export',datoms,schema);assets=root/'selected-assets';assets.mkdir();image=assets/(U(8)['uuid']+'.png');original=(ROOT/'src-tauri/icons/icon.png').read_bytes();image.write_bytes(original);stamp=image.stat().st_mtime_ns
            result=run(source,NODE,PUBLISHER,True,root/'workspace',asset_root=assets)
            self.assertEqual(result['status'],'imported',result);self.assertEqual(result['assetsChecked'],1);self.assertTrue(result['assetsUnchanged']);self.assertEqual(image.stat().st_mtime_ns,stamp);self.assertEqual(image.read_bytes(),original)

    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_wrong_graph_asset_checksum_stops_before_publication_and_keeps_source_identical(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);datoms,schema=graph()
            for a,v in [('block/title','Wrong checksum sentinel'),('block/uuid',U(8)),('block/parent',1),('block/page',1),('block/order','a3'),('logseq.property.asset/type',K('png')),('logseq.property.asset/checksum','0'*64)]:
                d=[8,K(a),v,536870913];datoms[token(d)]=d
            source=database(root/'export',datoms,schema);assets=source.parent/'assets';assets.mkdir();image=assets/(U(8)['uuid']+'.png');data=(ROOT/'src-tauri/icons/icon.png').read_bytes();image.write_bytes(data)
            workspace=root/'workspace';result=run(source,NODE,PUBLISHER,True,workspace)
            self.assertEqual(result['code'],'GRAPH_ASSET_CHECKSUM_MISMATCH');self.assertFalse(workspace.exists());self.assertTrue(result['sourceUnchanged']);self.assertTrue(result['assetsUnchanged']);self.assertEqual(image.read_bytes(),data)

    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_renamed_nested_asset_matches_exact_graph_checksum_without_title_guessing(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);datoms,schema=graph();data=(ROOT/'src-tauri/icons/icon.png').read_bytes()
            for a,v in [('block/title','Synthetic renamed image'),('block/uuid',U(8)),('block/parent',1),('block/page',1),('block/order','a3'),('logseq.property.asset/type',K('png')),('logseq.property.asset/checksum',hashlib.sha256(data).hexdigest())]:
                d=[8,K(a),v,536870913];datoms[token(d)]=d
            source=database(root/'export',datoms,schema);assets=root/'selected-assets';nested=assets/'old-names';nested.mkdir(parents=True);image=nested/'synthetic-old-name.png';image.write_bytes(data)
            result=run(source,NODE,PUBLISHER,True,root/'workspace',asset_root=assets)
            self.assertEqual(result['status'],'imported',result);self.assertTrue(result['assetsUnchanged']);self.assertEqual(result['assets'],1);self.assertEqual(image.read_bytes(),data)
            report=json.loads(next((root/'workspace/imports').glob('*/report.json')).read_text(encoding='utf-8'));self.assertTrue(any(f['path']=='assets/old-names/synthetic-old-name.png' for f in report['files']))

    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_two_graph_assets_can_share_one_exact_source_without_duplicate_recovery_paths(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            root=Path(tmp);datoms,schema=graph();data=(ROOT/'src-tauri/icons/icon.png').read_bytes()
            for e,order in [(8,'a3'),(9,'a4')]:
                for a,v in [('block/title','Synthetic duplicate image'),('block/uuid',U(e)),('block/parent',1),('block/page',1),('block/order',order),('logseq.property.asset/type',K('png')),('logseq.property.asset/checksum',hashlib.sha256(data).hexdigest())]:
                    d=[e,K(a),v,536870913];datoms[token(d)]=d
            source=database(root/'export',datoms,schema);assets=root/'selected-assets';assets.mkdir();(assets/'renamed.png').write_bytes(data)
            result=run(source,NODE,PUBLISHER,True,root/'workspace',asset_root=assets);self.assertEqual(result['status'],'imported',result);self.assertEqual(result['assets'],1)
            report=json.loads(next((root/'workspace/imports').glob('*/report.json')).read_text(encoding='utf-8'));self.assertEqual(len(report['files']),2);self.assertEqual(len(list((root/'workspace/assets').glob('*/*.image'))),2)

    @unittest.skipUnless(PUBLISHER.exists(),'Build the native importer first')
    def test_driver_never_discloses_unsupported_private_canary(self):
        with tempfile.TemporaryDirectory(prefix='noted-private-fixture-') as tmp:
            datoms,schema=graph();d=[2,K('logseq.property.asset/type'),K('PRIVATE_CANARY'),536870913];datoms[token(d)]=d;source=database(Path(tmp),datoms,schema)
            result=run(source,NODE,PUBLISHER);self.assertEqual(result['code'],'GRAPH_ATTACHMENT_ADAPTER_REQUIRED');self.assertNotIn('PRIVATE_CANARY',json.dumps(result));self.assertTrue(result['sourceUnchanged'])
if __name__=='__main__':unittest.main()
