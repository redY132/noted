"""Offline DataScript/Transit snapshot reader. Public-format facts, independent code.

The public CLI prints ONLY allowlisted structural counts and fixed error codes.
No private schema, attribute names, titles, text, values, SQL errors, or tracebacks.
This foundation does not publish a Noted import. Source SQLite is immutable/read-only.
"""
from __future__ import annotations
import argparse,hashlib,json,os,sqlite3,subprocess,sys,time,threading
from pathlib import Path

class Rejected(Exception):
    def __init__(self,code):self.code=code;super().__init__(code)
def reject(code):raise Rejected(code)
def keyword(value):return value.get('keyword') if isinstance(value,dict) and set(value)=={'keyword'} else None
def mapping(value):
    if not isinstance(value,dict) or set(value)!={'map'} or not isinstance(value['map'],list):reject('UNSUPPORTED_TRANSIT_MAP')
    out={}
    for pair in value['map']:
        if not isinstance(pair,list) or len(pair)!=2 or keyword(pair[0]) is None:reject('UNSUPPORTED_TRANSIT_MAP')
        key=keyword(pair[0])
        if key in out:reject('DUPLICATE_MAP_KEY')
        out[key]=pair[1]
    return out
def token(value):
    def canonical(v):
        if isinstance(v,list):return [canonical(x) for x in v]
        if isinstance(v,dict):
            if set(v)=={'map'}:return {'map':sorted([[canonical(k),canonical(x)] for k,x in v['map']],key=lambda p:json.dumps(p[0],sort_keys=True))}
            if set(v)=={'set'}:return {'set':sorted([canonical(x) for x in v['set']],key=lambda x:json.dumps(x,sort_keys=True))}
            return {k:canonical(x) for k,x in v.items()}
        return v
    return json.dumps(canonical(value),sort_keys=True,ensure_ascii=True,separators=(',',':'))
def validate_datom(datom,tail=False):
    if not isinstance(datom,list) or len(datom)!=4 or type(datom[0]) is not int or datom[0]<0 or not(keyword(datom[1]) is not None or type(datom[1]) is int) or type(datom[3]) is not int or datom[3]==0 or not tail and datom[3]<0:reject('UNSUPPORTED_DATOM')
def replay_tail(datoms,tail,schema):
    if not isinstance(schema,dict) or set(schema)!={'map'}:reject('UNSUPPORTED_STORAGE_SCHEMA')
    many=set();unique=set();definitions={}
    # Logseq's public DataScript fork keeps integer entity-id -> keyword aliases
    # alongside keyword -> property-map entries. They are metadata, not maps.
    aliases=[];schema_keys=set()
    for pair in schema['map']:
        if not isinstance(pair,list) or len(pair)!=2:reject('UNSUPPORTED_STORAGE_SCHEMA')
        key,definition=pair
        identity=token(key)
        if identity in schema_keys:reject('DUPLICATE_SCHEMA_KEY')
        schema_keys.add(identity)
        if keyword(definition) is not None:
            if type(key) is not int:reject('UNSUPPORTED_STORAGE_SCHEMA')
            aliases.append((key,definition));continue
        try:props=mapping(definition)
        except Rejected:reject('UNSUPPORTED_STORAGE_SCHEMA')
        definitions[token(key)]=props
    for key,ident in aliases:
        if token(ident) not in definitions:reject('UNRESOLVED_SCHEMA_ALIAS')
    for attribute,props in definitions.items():
        if keyword(props.get('db/cardinality'))=='db.cardinality/many':many.add(attribute)
        if keyword(props.get('db/unique')) in ('db.unique/value','db.unique/identity'):unique.add(attribute)
        if any(k in props for k in ('db/tupleAttrs','db/tupleTypes','db/tupleType')):reject('TUPLE_TRANSACTION_ADAPTER_REQUIRED')
    state={};groups={}
    def add(datom):
        e,a,v,_=datom;attribute=token(a);value=token(v);key=(e,attribute,value)
        if key in state:return
        group=(e,attribute)
        if attribute not in many:
            for old in list(groups.get(group,set())):state.pop((e,attribute,old),None)
            groups[group]=set()
        state[key]=datom;groups.setdefault(group,set()).add(value)
    for d in datoms.values():
        validate_datom(d);group=(d[0],token(d[1]))
        if group in groups and token(d[1]) not in many and token(d[2]) not in groups[group]:reject('ROOT_CARDINALITY_MISMATCH')
        add(d)
    for transaction in tail or []:
        if not isinstance(transaction,list):reject('UNSUPPORTED_TRANSACTION_TAIL')
        for d in transaction:
            validate_datom(d,tail=True);e,a,v,tx=d;attribute=token(a);value=token(v)
            if (keyword(a) or '').startswith('db/'):reject('DYNAMIC_SCHEMA_TRANSACTION_ADAPTER_REQUIRED')
            if tx>0:add(d)
            else:
                state.pop((e,attribute,value),None);groups.get((e,attribute),set()).discard(value)
    identities={}
    for (e,a,v),datom in state.items():
        if a in unique:
            if (a,v) in identities and identities[(a,v)]!=e:reject('UNIQUE_CONSTRAINT_MISMATCH')
            identities[(a,v)]=e
    return state
def fingerprint(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()
def sidecars(path):return tuple(Path(str(path)+suffix).exists() for suffix in ('-wal','-shm','-journal'))
class Codec:
    def __init__(self,node,script):
        self.process=subprocess.Popen([str(node),'--max-old-space-size=256',str(script),'--private-pipe'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    def decode(self,content):
        if not isinstance(content,str) or len(content.encode('utf-8'))>16*1024*1024:reject('UNSUPPORTED_STORAGE_RECORD')
        try:
            self.process.stdin.write(json.dumps({'content':content},ensure_ascii=True)+'\n');self.process.stdin.flush()
            watchdog=threading.Timer(10,self.process.kill);watchdog.daemon=True;watchdog.start()
            try:line=self.process.stdout.readline(32*1024*1024)
            finally:watchdog.cancel()
            if not line or not line.endswith('\n'):reject('CODEC_FAILED')
            value=json.loads(line)
        except Rejected:raise
        except Exception:reject('CODEC_FAILED')
        if 'error' in value:reject('UNSUPPORTED_TRANSIT')
        return value['value']
    def close(self):
        try:self.process.stdin.close()
        except (BrokenPipeError,OSError):pass
        try:self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
        finally:self.process.stdout.close()

class Snapshot:
    def __init__(self,source,node,codec_script):
        self.source=Path(source).absolute();self.node=node;self.codec_script=codec_script;self.counts={'records':0,'datoms':0,'pendingTransactions':0,'entities':0,'authoredNodes':0,'unmappedAttributes':0};self.db=None;self.codec=None
    def read(self,consumer=None):
        p=self.source
        if p.drive.startswith('\\\\'):reject('SOURCE_NOT_LOCAL')
        if not p.is_file() or p.is_symlink() or p.resolve()!=p:reject('SOURCE_NOT_ORDINARY')
        if any(sidecars(p)):reject('SOURCE_HAS_SQLITE_SIDECARS')
        if getattr(p.stat(),'st_file_attributes',0)&0x400:reject('SOURCE_NOT_ORDINARY')
        if p.stat().st_size>256*1024*1024:reject('SOURCE_TOO_LARGE')
        original=fingerprint(p);original_stat=(p.stat().st_size,p.stat().st_mtime_ns);before=sidecars(p);deadline=time.monotonic()+90
        try:
            self.db=sqlite3.connect(p.as_uri()+'?mode=ro&immutable=1',uri=True,timeout=0)
            self.db.enable_load_extension(False);self.db.execute('PRAGMA trusted_schema=OFF');self.db.execute('PRAGMA query_only=ON');self.db.set_progress_handler(lambda:1 if time.monotonic()>deadline else 0,10000)
            if self.db.execute('PRAGMA quick_check(1)').fetchone()!=('ok',):reject('SQLITE_INTEGRITY_FAILED')
            self.codec=Codec(self.node,self.codec_script)
            root=self._record(0);meta=mapping(root)
            if type(meta.get('eavt')) is not int or not isinstance(meta.get('schema'),dict):reject('UNSUPPORTED_STORAGE_ROOT')
            tail=self._record(1,optional=True)
            if tail is not None and not isinstance(tail,list):reject('UNSUPPORTED_TRANSACTION_TAIL')
            self.counts['pendingTransactions']=len(tail or [])
            if sum(len(tx) if isinstance(tx,list) else 1000001 for tx in (tail or []))>1000000:reject('TRANSACTION_TAIL_LIMIT')
            pending=[meta['eavt']];seen=set();datoms={}
            while pending:
                if time.monotonic()>deadline:reject('DECODING_TIME_LIMIT')
                addr=pending.pop()
                if type(addr) is not int or addr<2 or addr in seen:reject('INVALID_STORAGE_TREE')
                seen.add(addr)
                if len(seen)>100000:reject('STORAGE_TREE_LIMIT')
                raw,addresses=self._record(addr,with_addresses=True);node=mapping(raw);keys=node.get('keys')
                if not isinstance(keys,list):reject('UNSUPPORTED_STORAGE_NODE')
                if addresses is not None:
                    if not isinstance(addresses,list) or not all(type(a) is int for a in addresses):reject('UNSUPPORTED_STORAGE_ADDRESSES')
                    pending.extend(addresses)
                for datom in keys:
                    validate_datom(datom)
                    datoms[json.dumps(datom,sort_keys=True,ensure_ascii=True)]=datom
                    if len(datoms)>1000000:reject('DATOM_LIMIT')
            self.counts['datoms']=len(datoms)
            metadata=meta.get('eavt-metadata')
            if metadata is not None and mapping(metadata).get('count')!=len(datoms):reject('DATOM_COUNT_MISMATCH')
            datoms=replay_tail(datoms,tail,meta['schema']);self.counts['datoms']=len(datoms)
            entities={}
            for e,a,v,_tx in datoms.values():entities.setdefault(e,{}).setdefault(keyword(a) if keyword(a) is not None else '@numeric',[]).append(v)
            self.counts['entities']=len(entities)
            if consumer is not None:return consumer(datoms,meta['schema'])
            # Only static basic-outliner semantics are candidates for an initial converter.
            # Preserve/reject richer application features; never stringify/drop unknown values.
            basic={'block/uuid','block/title','block/raw-title','block/name','block/parent','block/page','block/order','block/created-at','block/updated-at','block/format','block/collapsed?','block/refs','block/tags','block/tx-id','db/ident','logseq.property/built-in?','logseq.property/hide?','logseq.property/deleted-at'}
            for fields in entities.values():
                if fields.get('logseq.property/built-in?')==[True] or 'db/ident' in fields:continue
                if 'block/title' in fields:
                    self.counts['authoredNodes']+=1
                    self.counts['unmappedAttributes']+=sum(len(values) for name,values in fields.items() if name not in basic)
            if not self.counts['authoredNodes']:reject('NO_SUPPORTED_AUTHORED_NODES')
            if self.counts['unmappedAttributes']:reject('RICH_GRAPH_SEMANTICS_ADAPTER_REQUIRED')
            # Snapshot restoration is separate from a reviewed, private Noted publication path.
            return {'status':'snapshot-restored','code':'PRIVATE_PUBLICATION_ADAPTER_REQUIRED',**self.counts}
        finally:
            try:
                if self.codec:self.codec.close()
            finally:
                if self.db:self.db.close()
            self.source_unchanged=fingerprint(p)==original and (p.stat().st_size,p.stat().st_mtime_ns)==original_stat
            self.sidecars_unchanged=sidecars(p)==before
            if not self.source_unchanged or not self.sidecars_unchanged:reject('SOURCE_INTEGRITY_CHANGED')
    def _record(self,addr,optional=False,with_addresses=False):
        try:row=self.db.execute('SELECT content, addresses FROM kvs WHERE addr=?',(addr,)).fetchone()
        except sqlite3.Error:reject('UNSUPPORTED_SQLITE_KVS_FORMAT')
        if row is None:
            if optional:return None
            reject('MISSING_STORAGE_RECORD')
        self.counts['records']+=1;value=self.codec.decode(row[0])
        try:addresses=json.loads(row[1]) if row[1] is not None else None
        except Exception:reject('UNSUPPORTED_STORAGE_ADDRESSES')
        return (value,addresses) if with_addresses else value
def inspect(source,node,script):
    reader=Snapshot(source,node,script)
    try:result=reader.read()
    except Rejected as error:result={'status':'blocked','code':error.code,**reader.counts}
    except Exception:result={'status':'blocked','code':'UNSUPPORTED_OR_UNREADABLE_SOURCE',**reader.counts}
    return {**result,'sourceUnchanged':getattr(reader,'source_unchanged',None),'sidecarsUnchanged':getattr(reader,'sidecars_unchanged',None),'noteContentDisclosed':False,'imported':False}
def main():
    parser=argparse.ArgumentParser(description='Counts-only, immutable Logseq SQLite snapshot check; no import publication.')
    parser.add_argument('--source',required=True);parser.add_argument('--node',required=True);args=parser.parse_args()
    # No dump/debug/raw-schema option exists. All failures map to constant codes.
    print(json.dumps(inspect(args.source,args.node,Path(__file__).with_name('logseq-transit-codec.mjs')),sort_keys=True))
if __name__=='__main__':main()
