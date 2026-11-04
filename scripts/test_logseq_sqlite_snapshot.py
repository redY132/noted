"""Synthetic-only tests. Never use a personal graph as a fixture."""
from pathlib import Path
import json,shutil,sqlite3,subprocess,tempfile,unittest,sys
sys.path.insert(0,str(Path(__file__).parent))
from logseq_sqlite_snapshot import inspect,Codec,replay_tail,token,Rejected
NODE=Path(shutil.which('node') or r'C:\Program Files\nodejs\node.exe')
CODEC=Path(__file__).with_name('logseq-transit-codec.mjs')
K=lambda s:{'keyword':s}
M=lambda **items:{'map':[[K(k.replace('_','-')),v] for k,v in items.items()]}
def encode(value):
    source="""const t=require('transit-js');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const convert=v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.keyword!==undefined?t.keyword(v.keyword):v&&typeof v==='object'&&!Array.isArray(v)&&v.uuid!==undefined?t.uuid(v.uuid):v&&typeof v==='object'&&!Array.isArray(v)&&v.map!==undefined?t.map(v.map.flatMap(([k,x])=>[convert(k),convert(x)])):Array.isArray(v)?v.map(convert):v;process.stdout.write(t.writer('json').write(convert(JSON.parse(s))));});"""
    return subprocess.run([str(NODE),'-e',source],cwd=CODEC.parent.parent,input=json.dumps(value),capture_output=True,text=True,encoding='utf-8',check=True).stdout
def database(root,tail=None,extra=False,corrupt_count=False):
    path=root/'fixture.sqlite';db=sqlite3.connect(path);db.execute('CREATE TABLE kvs(addr INTEGER PRIMARY KEY,content TEXT,addresses JSON)')
    datoms=[[1,K('block/title'),'PRIVATE_TITLE_CANARY',536870913],[1,K('block/uuid'),{'uuid':'11111111-1111-4111-8111-111111111111'},536870913],[2,K('block/title'),'**Bold** nested paragraph',536870913],[2,K('block/page'),1,536870913]]
    if extra:datoms.append([2,K('user.property/PRIVATE_SCHEMA_CANARY'),'PRIVATE_VALUE_CANARY',536870913])
    meta=M(schema={'map':[]},eavt=1001,eavt_metadata=M(count=len(datoms)+(1 if corrupt_count else 0)))
    rows=[(0,meta,None),(1,tail or [],None),(1001,M(keys=[datoms[1]]),[1002,1003]),(1002,M(keys=datoms[:2]),None),(1003,M(keys=datoms[2:]),None),(2000,M(keys=[[900,K('block/title'),'STALE_CANARY',536870900]]),None)]
    for addr,value,children in rows:db.execute('INSERT INTO kvs VALUES(?,?,?)',(addr,encode(value),json.dumps(children) if children is not None else None))
    db.commit();db.close();return path
class SnapshotTests(unittest.TestCase):
    def test_snapshot_tree_uses_live_addresses_deduplicates_separator_keys_and_keeps_source_identical(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp));before=source.read_bytes();result=inspect(source,NODE,CODEC)
            self.assertEqual(result['status'],'snapshot-restored');self.assertEqual(result['datoms'],4);self.assertEqual(result['authoredNodes'],2);self.assertEqual(result['records'],5)
            self.assertTrue(result['sourceUnchanged']);self.assertTrue(result['sidecarsUnchanged']);self.assertEqual(source.read_bytes(),before);self.assertFalse(result['imported']);self.assertFalse(any(Path(str(source)+s).exists() for s in ('-wal','-shm','-journal')))
    def test_transit_cache_and_keyword_looking_text_remain_distinct(self):
        codec=Codec(NODE,CODEC)
        try:
            value=[[i,K('block/title'),'~:looks-like-keyword',536870913] for i in range(60)]
            self.assertEqual(codec.decode(encode(value)),value)
        finally:codec.close()
    def test_tail_updates_are_replayed_without_using_stale_values(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp),tail=[[[2,K('block/title'),'NEW_PRIVATE_VALUE',536870914]]]);result=inspect(source,NODE,CODEC);self.assertEqual(result['status'],'snapshot-restored');self.assertEqual(result['pendingTransactions'],1);self.assertEqual(result['datoms'],4);self.assertTrue(result['sourceUnchanged'])
    def test_unknown_user_schema_reports_counts_without_names_or_values(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp),extra=True);completed=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__).with_name('logseq_sqlite_snapshot.py')),'--source',str(source),'--node',str(NODE)],capture_output=True,text=True,encoding='utf-8')
            self.assertNotIn('CANARY',completed.stdout+completed.stderr);self.assertEqual(completed.stderr,'');result=json.loads(completed.stdout);self.assertEqual(result['code'],'RICH_GRAPH_SEMANTICS_ADAPTER_REQUIRED');self.assertEqual(result['unmappedAttributes'],1)
    def test_invalid_transit_and_sql_errors_never_disclose_content(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp));db=sqlite3.connect(source);db.execute('UPDATE kvs SET content=? WHERE addr=0',('PRIVATE_MALFORMED_CANARY',));db.commit();db.close();result=inspect(source,NODE,CODEC);self.assertNotIn('CANARY',json.dumps(result));self.assertEqual(result['code'],'UNSUPPORTED_TRANSIT');self.assertTrue(result['sourceUnchanged'])
    def test_replay_preserves_many_values_retracts_exact_values_and_ignores_redundant_adds(self):
        schema=M(**{'block/tags':M(**{'db/cardinality':K('db.cardinality/many')})})
        title=[1,K('block/title'),'Old',100];tag=[1,K('block/tags'),2,100];root={token(d):d for d in [title,tag]}
        result=replay_tail(root,[[[1,K('block/title'),'New',101],[1,K('block/tags'),3,101]],[[1,K('block/tags'),2,-102],[1,K('block/title'),'New',103]]],schema)
        values=list(result.values());self.assertEqual(len(values),2);self.assertIn([1,K('block/title'),'New',101],values);self.assertIn([1,K('block/tags'),3,101],values)
        with self.assertRaises(Rejected):replay_tail(root,[[[1,K('db/cardinality'),K('db.cardinality/many'),101]]],schema)
    def test_public_fork_integer_schema_aliases_are_metadata_not_property_maps(self):
        schema={'map':[[K('block/tags'),M(**{'db/cardinality':K('db.cardinality/many')})],[19,K('block/tags')]]}
        root={token(d):d for d in [[1,K('block/tags'),2,100],[1,K('block/tags'),3,100]]}
        result=replay_tail(root,[[[1,K('block/tags'),4,101]]],schema)
        self.assertEqual(len(result),3)
        with self.assertRaises(Rejected):replay_tail(root,[],{'map':[[19,K('block/tags')]]})
    def test_report_has_only_fixed_codes_counts_and_booleans_even_with_code_like_note_text(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp),tail=[[[2,K('block/title'),"require('node:fs').writeFileSync('CANARY','private')",536870914]]])
            initial_names={p.name for p in Path(tmp).iterdir()};result=inspect(source,NODE,CODEC)
            self.assertEqual({p.name for p in Path(tmp).iterdir()},initial_names)
            self.assertEqual(set(result),{'status','code','records','datoms','pendingTransactions','entities','authoredNodes','unmappedAttributes','sourceUnchanged','sidecarsUnchanged','noteContentDisclosed','imported'})
            self.assertNotIn('CANARY',json.dumps(result));self.assertFalse(result['noteContentDisclosed']);self.assertFalse(result['imported'])
    def test_unique_conflicts_tuple_schema_and_unsupported_schema_fail_closed(self):
        unique=M(**{'block/uuid':M(**{'db/unique':K('db.unique/identity')})})
        root={token(d):d for d in [[1,K('block/uuid'),'same',100],[2,K('block/uuid'),'same',100]]}
        for schema in [unique,M(**{'user/tuple':M(**{'db/tupleAttrs':[K('block/title')]})}),{'map':[[K('user/private-schema'),'PRIVATE_CANARY']]},{'map':[[K('a'),M()],[K('a'),M()]]}]:
            with self.assertRaises(Rejected):replay_tail(root,[],schema)
    def test_wrong_count_and_existing_sidecars_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='noted-public-fixture-') as tmp:
            source=database(Path(tmp),corrupt_count=True);self.assertEqual(inspect(source,NODE,CODEC)['code'],'DATOM_COUNT_MISMATCH');Path(str(source)+'-wal').write_bytes(b'SYNTHETIC');self.assertEqual(inspect(source,NODE,CODEC)['code'],'SOURCE_HAS_SQLITE_SIDECARS');self.assertEqual(Path(str(source)+'-wal').read_bytes(),b'SYNTHETIC')
if __name__=='__main__':unittest.main()
