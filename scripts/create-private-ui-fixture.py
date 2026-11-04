from pathlib import Path
import json,tempfile,sys,shutil
REPO=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(REPO/'scripts'))
from test_logseq_private_import import database,graph,NODE,K
from logseq_sqlite_snapshot import token
from logseq_private_import import run
from logseq_sqlite_snapshot import Snapshot,fingerprint
from logseq_graph import convert
root=Path(tempfile.mkdtemp(prefix='noted-private-ui-'));datoms,schema=graph()
row=[2,K('logseq.property/background-color'),'blue',536870913];datoms[token(row)]=row
source=database(root/'export',datoms,schema);workspace=root/'workspace'
publisher=REPO/'src-tauri/target/release/noted-private-import.exe'
result=run(source,NODE,publisher,True,workspace)
if not result.get('imported'):raise RuntimeError('Synthetic fixture import failed: '+result.get('code','UNKNOWN'))
reader=Snapshot(source,NODE,REPO/'scripts/logseq-transit-codec.mjs');bundle=reader.read(consumer=convert);bundle['source']={'path':str(source),'sha256':fingerprint(source),'bytes':source.stat().st_size,'modifiedNs':source.stat().st_mtime_ns};next(p for p in bundle['pages'] if p['sourceId']==6)['trashed']=True;bundle_path=root/'second-bundle.json';bundle_path.write_text(json.dumps(bundle),encoding='utf-8')
binary=root/'bin';binary.mkdir()
for name in ['noted.exe','noted-agent.exe','noted-private-import.exe']:shutil.copyfile(REPO/'src-tauri/target/release'/name,binary/name)
state={'root':str(root),'workspace':str(workspace),'binary':str(binary/'noted.exe'),'profile':str(root/'profile'),'bundle':str(bundle_path),'synthetic':True}
(REPO/'output/private-ui-state.json').write_text(json.dumps(state),encoding='utf-8')
print(json.dumps({'synthetic':True,'fixtureReady':True,'privateDenied':result['privateDenied']}))
