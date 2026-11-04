"""Counts-only offline migration driver. Payload never goes to tool output.

The importer alone reads source values. It may write a private staging bundle and
call the native validator/publisher, whose stdout is strictly filtered below.
"""
from __future__ import annotations
import argparse,hashlib,json,os,subprocess,tempfile
from pathlib import Path
from logseq_sqlite_snapshot import Snapshot,Rejected,fingerprint,sidecars
from logseq_graph import convert

def native(exe,bundle,workspace=None,publish=False):
    args=[str(exe),'--bundle',str(bundle)]
    if publish:args+=['--workspace',str(workspace),'--publish']
    else:args+=['--validate-only']
    result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        v=json.loads(result.stdout)
        allowed={'status','code','imported','notes','blocks','properties','privateDenied','assets','sourceUnchanged','sidecarsUnchanged'}
        if not isinstance(v,dict) or set(v)-allowed or v.get('status') not in ('validated','imported','blocked'):raise ValueError()
        if not isinstance(v.get('code'),str) or not __import__('re').fullmatch(r'[A-Z_]{1,100}',v['code']):raise ValueError()
        if any(not(type(x) in (bool,int) or x is None) for k,x in v.items() if k not in ('status','code')):raise ValueError()
        return v
    except Exception:return {'status':'blocked','code':'NATIVE_DIAGNOSTIC_REJECTED','imported':False}

def _run(source,node,publisher,publish=False,workspace=None,asset_root=None,asset_audit=None):
    reader=Snapshot(source,node,Path(__file__).with_name('logseq-transit-codec.mjs'))
    try:
        bundle=reader.read(consumer=lambda datoms,schema:convert(datoms,schema,Path(asset_root).absolute() if asset_root is not None else Path(source).absolute().parent/'assets',asset_audit))
        p=Path(source);bundle['source']={'path':str(p.absolute()),'sha256':fingerprint(p),'bytes':p.stat().st_size,'modifiedNs':p.stat().st_mtime_ns}
        if not reader.source_unchanged or not reader.sidecars_unchanged:raise Rejected('SOURCE_INTEGRITY_CHANGED')
        # Not in the repository or a note directory; no payload is logged.
        with tempfile.TemporaryDirectory(prefix='noted-private-import-') as tmp:
            staged=Path(tmp)/'bundle.json';staged.write_text(json.dumps(bundle,ensure_ascii=False),encoding='utf-8')
            result=native(publisher,staged,workspace,publish)
        unchanged=fingerprint(p)==bundle['source']['sha256'] and p.stat().st_size==bundle['source']['bytes'] and p.stat().st_mtime_ns==bundle['source']['modifiedNs']
        return {**result,'sourceUnchanged':unchanged,'sidecarsUnchanged':not any(sidecars(p)),'noteContentDisclosed':False}
    except Rejected as error:
        counts=getattr(error,'counts',{})
        # Error object payload is not serialized; only known counter keys survive.
        counts={k:v for k,v in counts.items() if k in {'pages','blocks','properties','references','assets','unsupportedVisuals','recycledNodes','dynamicNodes','missingAssetFiles','unsupportedAssetFormats','externalAssets','unavailableRemoteAssets','assetChecksumMismatches','unsupportedAssetChecksums','checksumResolvedAssets','requiredAssets','unreferencedAssetRecords','missingRequiredAssets','recycledBlocks','backgroundStyles'} and type(v) is int}
        return {'status':'blocked','code':error.code,'imported':False,**counts,'sourceUnchanged':getattr(reader,'source_unchanged',None),'sidecarsUnchanged':getattr(reader,'sidecars_unchanged',None),'noteContentDisclosed':False}
    except Exception:
        return {'status':'blocked','code':'PRIVATE_IMPORT_FAILED','imported':False,'sourceUnchanged':getattr(reader,'source_unchanged',None),'sidecarsUnchanged':getattr(reader,'sidecars_unchanged',None),'noteContentDisclosed':False}
def run(source,node,publisher,publish=False,workspace=None,asset_root=None):
    audit=[]
    result=_run(source,node,publisher,publish,workspace,asset_root,audit)
    unchanged=True
    for entry in audit:
        try:
            p=Path(entry['path']);metadata=p.stat()
            unchanged=unchanged and metadata.st_size==entry['bytes'] and metadata.st_mtime_ns==entry['modifiedNs'] and fingerprint(p)==entry['sha256']
        except Exception:unchanged=False
    if not unchanged:result={**result,'status':'blocked','code':'SOURCE_ASSET_INTEGRITY_CHANGED'}
    return {**result,'assetsChecked':len(audit),'assetsUnchanged':unchanged}
def main():
    p=argparse.ArgumentParser(description='Importer-only SQLite migration; fixed diagnostics, no content output.')
    p.add_argument('--source',required=True);p.add_argument('--node',required=True);p.add_argument('--publisher',required=True);p.add_argument('--workspace');p.add_argument('--assets');p.add_argument('--publish',action='store_true');args=p.parse_args()
    if args.publish and not args.workspace:p.error('--publish requires --workspace')
    print(json.dumps(run(args.source,args.node,args.publisher,args.publish,args.workspace,args.assets),sort_keys=True))
if __name__=='__main__':main()
