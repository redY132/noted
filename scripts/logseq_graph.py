"""Private importer implementation. NEVER print, inspect or log its payloads.

Only synthetic fixtures may be used to inspect return values during development.
Real graphs enter through Snapshot.read(consumer=...) in the counts-only driver.
"""
from __future__ import annotations
import datetime,json,re,uuid
from pathlib import Path
from logseq_sqlite_snapshot import keyword,mapping,token,reject,fingerprint
from logseq_values import background_color,visible_markup

PAGE_TAGS={'logseq.class/Page','logseq.class/Journal','logseq.class/Tag','logseq.class/Property'}
STRUCTURAL={'block/title','block/raw-title','block/name','block/uuid','block/page','block/parent','block/order','block/created-at','block/updated-at','block/tx-id','block/format','block/collapsed?'}
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

def convert(datoms,schema,asset_root=None,asset_audit=None):
    aliases={};types={}
    for k,v in schema['map']:
        if type(k) is int and keyword(v):aliases[k]=keyword(v)
        elif keyword(k):types[keyword(k)]=mapping(v)
    entities={}
    for e,a,v,tx in datoms.values():
        name=keyword(a) if keyword(a) is not None else aliases.get(a)
        if name is None:reject('UNRESOLVED_ATTRIBUTE_ID')
        entities.setdefault(e,{}).setdefault(name,[]).append(v)
    def one(e,a,default=None):
        values=entities.get(e,{}).get(a,[])
        if len(values)>1:reject('AMBIGUOUS_GRAPH_VALUE')
        return values[0] if values else default
    idents={}
    for e in entities:
        k=keyword(one(e,'db/ident'))
        if k:
            if k in idents:reject('DUPLICATE_GRAPH_IDENT')
            idents[k]=e
    def target(v):return v if type(v) is int and v in entities else idents.get(keyword(v))
    def ident(v):return keyword(v) or keyword(one(target(v),'db/ident'))
    def tags(e):return {ident(v) for v in entities[e].get('block/tags',[])}
    def builtin(e):return one(e,'logseq.property/built-in?',False) is True
    def scalar(v,depth=0):
        if depth>24:reject('PROPERTY_NESTING_LIMIT')
        if isinstance(v,str):return v
        if v is None:return 'nil'
        if type(v) is bool:return 'true' if v else 'false'
        if type(v) in (int,float):return str(v)
        if isinstance(v,list):return '['+', '.join(scalar(x,depth+1) for x in v)+']'
        if isinstance(v,dict):
            for kind,prefix in [('keyword',':'),('uuid',''),('symbol',''),('integer','')]:
                if set(v)=={kind}:return prefix+str(v[kind])
            if set(v)=={'instant'}:return datetime.datetime.fromtimestamp(v['instant']/1000,datetime.timezone.utc).isoformat()
            if set(v)=={'set'}:return '#{'+', '.join(sorted(scalar(x,depth+1) for x in v['set']))+'}'
            if set(v)=={'map'}:return '{'+', '.join(scalar(k,depth+1)+' '+scalar(x,depth+1) for k,x in v['map'])+'}'
            if set(v)=={'tag','rep'}:return '#'+v['tag']+' '+scalar(v['rep'],depth+1)
        reject('UNSUPPORTED_PROPERTY_VALUE')
    def label(e):
        value=one(e,'block/title',one(e,'block/raw-title',one(e,'logseq.property/value',None)))
        return value if isinstance(value,str) else scalar(value) if value is not None else ident(e) or 'Untitled'
    def source_uuid(e):
        value=one(e,'block/uuid')
        value=value.get('uuid') if isinstance(value,dict) and set(value)=={'uuid'} else value
        if value is not None and (not isinstance(value,str) or not UUID.fullmatch(value)):reject('INVALID_GRAPH_UUID')
        return value
    # Version is read by software, never returned as private schema/records.
    version=one(idents.get('logseq.kv/schema-version'),'kv/value')
    if isinstance(version,dict):
        parsed=mapping(version);major=parsed.get('major');minor=parsed.get('minor',0)
    elif isinstance(version,str) and re.fullmatch(r'\d+\.\d+',version):major,minor=map(int,version.split('.'))
    else:reject('GRAPH_VERSION_ADAPTER_REQUIRED')
    if major!=65 or type(minor) is not int or not 0<=minor<=35:reject('GRAPH_VERSION_ADAPTER_REQUIRED')
    if one(idents.get('logseq.kv/db-type'),'kv/value')!='db':reject('GRAPH_VERSION_ADAPTER_REQUIRED')

    authored={e for e in entities if not builtin(e) and ('block/title' in entities[e] or 'block/raw-title' in entities[e] or 'logseq.property.asset/type' in entities[e])}
    if not authored:reject('NO_SUPPORTED_AUTHORED_NODES')
    if len(authored)>50000:reject('GRAPH_NODE_LIMIT')
    # Fixed-code blockers preserve fidelity. Recycled pages use native Trash;
    # recycled block subtrees need a distinct restore-position adapter.
    page_candidates={e for e in authored if tags(e)&PAGE_TAGS or ('block/name' in entities[e] and one(e,'block/page') is None) or (one(e,'block/page') is None and one(e,'block/parent') is None)}
    counts={'pages':0,'blocks':len(authored),'properties':0,'references':0,'assets':0,'unsupportedVisuals':0,'recycledNodes':0,'dynamicNodes':0}
    assets=[e for e,fields in entities.items() if not builtin(e) and 'logseq.property.asset/type' in fields]
    counts['assets']=len(assets)
    asset_ids=set(assets);asset_uuids={source_uuid(e):e for e in assets if source_uuid(e)}
    required_assets={e for e in assets if one(e,'block/page') is not None or one(e,'block/parent') is not None}
    for e in authored-asset_ids:
        for a,values in entities[e].items():
            if keyword(types.get(a,{}).get('db/valueType'))=='db.type/ref' or a in {'block/refs','block/tags','block/link'}:
                required_assets.update(t for v in values if (t:=target(v)) in asset_ids)
        for a in ('block/title','block/raw-title'):
            value=one(e,a)
            if isinstance(value,str):required_assets.update(asset_uuids[u] for u in re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',value) if u in asset_uuids)
    # Follow typed asset-to-asset references as well (for example PDF areas).
    pending=list(required_assets);followed=set()
    while pending:
        e=pending.pop()
        if e in followed:continue
        followed.add(e)
        for a,values in entities[e].items():
            if keyword(types.get(a,{}).get('db/valueType'))=='db.type/ref' or a in {'block/refs','block/link'}:
                for v in values:
                    t=target(v)
                    if t in asset_ids and t not in required_assets:required_assets.add(t);pending.append(t)
    counts['requiredAssets']=len(required_assets);counts['unreferencedAssetRecords']=len(asset_ids-required_assets)
    resolved_asset_ids=set()
    asset_data={};missing=[]
    if asset_root is not None and assets:
        asset_root=Path(asset_root).absolute()
        if asset_root.drive.startswith('\\\\'):reject('GRAPH_ASSET_PATH_INVALID')
        def audit_file(path):
            metadata=path.stat()
            if getattr(metadata,'st_file_attributes',0)&0x400:reject('GRAPH_ASSET_PATH_INVALID')
            if metadata.st_size>32*1024*1024:reject('GRAPH_ASSET_SIZE_LIMIT')
            entry={'path':str(path),'sha256':fingerprint(path),'bytes':metadata.st_size,'modifiedNs':metadata.st_mtime_ns}
            if asset_audit is not None:
                previous=next((v for v in asset_audit if Path(v['path'])==path),None)
                if previous is not None and previous!=entry:reject('SOURCE_ASSET_INTEGRITY_CHANGED')
                if previous is None:asset_audit.append(entry)
            return entry
        counts.update(missingAssetFiles=0,unsupportedAssetFormats=0,externalAssets=0,unavailableRemoteAssets=0,assetChecksumMismatches=0,unsupportedAssetChecksums=0)
        for e in assets:
            extension=one(e,'logseq.property.asset/type');extension=keyword(extension) or extension
            if not isinstance(extension,str) or not re.fullmatch(r'[A-Za-z0-9]{1,12}',extension):
                counts['unsupportedAssetFormats']+=1;continue
            extension=extension.lower()
            if extension not in {'png','jpg','jpeg','webp','gif'}:counts['unsupportedAssetFormats']+=1
            if one(e,'logseq.property.asset/external-url'):
                counts['externalAssets']+=1;continue
            uid=source_uuid(e)
            candidate=asset_root/((uid or 'invalid')+'.'+extension)
            # Metadata first. Never display names, inspect images with AI or follow
            # paths outside the user-selected exported copy.
            if uid is None or asset_root.resolve()!=asset_root or candidate.is_symlink() or not candidate.is_file():
                counts['missingAssetFiles']+=1
                missing.append((e,extension))
                if one(e,'logseq.property.asset/remote-metadata') is not None:counts['unavailableRemoteAssets']+=1
            else:
                checked=audit_file(candidate);resolved_asset_ids.add(e)
                expected=one(e,'logseq.property.asset/checksum')
                if expected is not None:
                    if not isinstance(expected,str) or not re.fullmatch(r'[0-9a-fA-F]{64}',expected):counts['unsupportedAssetChecksums']+=1
                    elif checked['sha256']!=expected.lower():counts['assetChecksumMismatches']+=1
                if extension in {'png','jpg','jpeg','webp','gif'}:
                    asset_data[e]={**checked,'mime':{'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','gif':'image/gif'}[extension]}
        wanted={one(e,'logseq.property.asset/checksum').lower() for e,_ext in missing if isinstance(one(e,'logseq.property.asset/checksum'),str) and re.fullmatch(r'[0-9a-fA-F]{64}',one(e,'logseq.property.asset/checksum'))}
        if wanted and asset_root.is_dir():
            # Exact SHA-256 matching handles renamed/legacy files without
            # guessing titles, decoding media, reading outside scope or network.
            index={};pending=[(asset_root,0)];inventory_count=0;inventory_bytes=0
            while pending:
                directory,depth=pending.pop()
                if directory.resolve()!=directory or directory.is_symlink() or depth>16:reject('GRAPH_ASSET_PATH_INVALID')
                for item in directory.iterdir():
                    inventory_count+=1
                    if inventory_count>20000:reject('GRAPH_ASSET_INVENTORY_LIMIT')
                    if item.resolve()!=item or item.is_symlink():reject('GRAPH_ASSET_PATH_INVALID')
                    if item.is_dir():pending.append((item,depth+1));continue
                    if not item.is_file():reject('GRAPH_ASSET_PATH_INVALID')
                    size=item.stat().st_size;inventory_bytes+=size
                    if inventory_bytes>2*1024*1024*1024:reject('GRAPH_ASSET_INVENTORY_LIMIT')
                    # An oversized unreferenced file cannot be a publishable
                    # source; do not read it merely to build the lookup index.
                    if size>32*1024*1024:continue
                    entry=audit_file(item)
                    if entry['sha256'] in wanted:index.setdefault(entry['sha256'],entry)
            counts['checksumResolvedAssets']=0
            for e,extension in missing:
                expected=one(e,'logseq.property.asset/checksum')
                checked=index.get(expected.lower()) if isinstance(expected,str) else None
                if checked is None:continue
                counts['missingAssetFiles']-=1;counts['checksumResolvedAssets']+=1;resolved_asset_ids.add(e)
                if one(e,'logseq.property.asset/remote-metadata') is not None:counts['unavailableRemoteAssets']-=1
                if extension in {'png','jpg','jpeg','webp','gif'}:
                    asset_data[e]={**checked,'mime':{'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','gif':'image/gif'}[extension]}
    counts['missingRequiredAssets']=len(required_assets-{e for e in resolved_asset_ids})
    counts['recycledBlocks']=0;counts['backgroundStyles']=0
    for e in authored:
        if one(e,'logseq.property/deleted-at') is not None:
            counts['recycledNodes']+=1
            if e not in page_candidates:counts['recycledBlocks']+=1
        display=keyword(one(e,'logseq.property.node/display-type'))
        if display not in (None,'code','quote'):counts['unsupportedVisuals']+=1
        background=one(e,'logseq.property/background-color')
        if background is not None:
            if background_color(entities,background) is None or e in page_candidates:counts['unsupportedVisuals']+=1
            else:counts['backgroundStyles']+=1
        title=one(e,'block/title',one(e,'block/raw-title',''))
        if not isinstance(title,str):counts['unsupportedVisuals']+=1
        elif display!='code':
            visible=visible_markup(title)
            if '{{' in visible or '<script' in visible.lower() or '$$' in visible:counts['dynamicNodes']+=1
    # This is diagnostics, not permission to discard a construct.
    for key,code in [('assetChecksumMismatches','GRAPH_ASSET_CHECKSUM_MISMATCH'),('unsupportedAssetChecksums','GRAPH_ASSET_CHECKSUM_FORMAT_REQUIRED'),('missingAssetFiles','GRAPH_ASSET_FILES_REQUIRED'),('unsupportedAssetFormats','GRAPH_ATTACHMENT_ADAPTER_REQUIRED'),('externalAssets','GRAPH_EXTERNAL_ASSET_REVIEW_REQUIRED'),('recycledBlocks','GRAPH_RECYCLE_ADAPTER_REQUIRED'),('unsupportedVisuals','GRAPH_VISUAL_ADAPTER_REQUIRED'),('dynamicNodes','GRAPH_DYNAMIC_ADAPTER_REQUIRED')]:
        if counts.get(key,0):
            error=__import__('logseq_sqlite_snapshot').Rejected(code);error.counts=counts;raise error
    if assets and len(asset_data)!=len(assets):reject('GRAPH_ASSET_ADAPTER_REQUIRED')
    pages=page_candidates
    if not pages:reject('GRAPH_PAGE_IDENTITY_REQUIRED')
    def owner(e):
        seen=set();current=e
        while current not in pages:
            if current in seen or len(seen)>20:reject('GRAPH_HIERARCHY_LIMIT_OR_CYCLE')
            seen.add(current)
            p=target(one(current,'block/page'))
            if p is not None:
                if p not in pages:reject('GRAPH_PAGE_IDENTITY_REQUIRED')
                return p
            current=target(one(current,'block/parent'))
            if current is None:reject('GRAPH_ORPHAN_ADAPTER_REQUIRED')
        return current
    owners={e:owner(e) for e in authored};destinations={e:str(uuid.uuid4()) for e in pages}
    block_ids={e:'logseq-'+(source_uuid(e) or 'entity-'+str(e)) for e in authored}
    references={};seen_uuids=set()
    for e in authored:
        u=source_uuid(e)
        if u:
            if u in seen_uuids:reject('DUPLICATE_GRAPH_UUID')
            seen_uuids.add(u)
            references[u]={'noteId':destinations[owners[e]],'blockId':None if e in pages else block_ids[e],'label':label(e)}
    for e in entities:
        if e in authored:continue
        u=source_uuid(e)
        if u:
            if u in references:reject('DUPLICATE_GRAPH_UUID')
            references[u]={'noteId':None,'blockId':None,'label':label(e)}
    def source_date(e,a):
        value=one(e,a)
        if value is None:return None
        if isinstance(value,dict) and set(value)=={'instant'}:value=value['instant']
        if type(value) not in (int,float) or value<0:reject('GRAPH_TIMESTAMP_ADAPTER_REQUIRED')
        return datetime.datetime.fromtimestamp(value/1000,datetime.timezone.utc).isoformat()
    def property_value(a,v):
        if keyword(types.get(a,{}).get('db/valueType'))=='db.type/ref':
            e=target(v)
            if e is None:reject('UNRESOLVED_PROPERTY_REFERENCE')
            if e in authored:return {'text':label(e),'noteId':destinations[owners[e]],'blockId':None if e in pages else block_ids[e]}
            return {'text':label(e)}
        return {'text':scalar(v)}
    def properties(e):
        out=[]
        for a,values in sorted(entities[e].items()):
            if a in STRUCTURAL:continue
            prop=idents.get(a)
            hidden=one(prop,'logseq.property/hide?',False) is True
            internal=a.startswith('db/') or a.startswith('logseq.property.asset/') or a in {'logseq.property.node/display-type','logseq.property.code/lang','logseq.property/heading','logseq.property/built-in?','logseq.property/background-color','logseq.property/deleted-at'} or a.startswith('logseq.property.recycle/')
            if hidden or internal:
                counts['archivedProperties']=counts.get('archivedProperties',0)+len(values);continue
            if a=='block/tags':
                visible=[v for v in values if target(v) is None or not builtin(target(v))]
                counts['archivedProperties']=counts.get('archivedProperties',0)+len(values)-len(visible);values=visible
            if not values:continue
            name=label(prop) if prop is not None else a
            out.append({'name':name,'values':[property_value(a,v) for v in values]})
            counts['properties']+=len(values)
        return out
    children={e:[] for e in authored}
    for e in authored-pages:
        p=target(one(e,'block/parent')) or owners[e]
        if p not in authored or owners[p]!=owners[e]:reject('GRAPH_PARENT_MISMATCH')
        children[p].append(e)
    for e,items in children.items():
        keys=[]
        for child in items:
            order=one(child,'block/order')
            if not isinstance(order,str) or not order or not order.isascii():reject('GRAPH_ORDER_ADAPTER_REQUIRED')
            keys.append(order)
        if len(set(keys))!=len(keys):reject('AMBIGUOUS_GRAPH_ORDER')
        items.sort(key=lambda x:one(x,'block/order'))
    visited=set()
    def node(e,depth=0):
        if e in visited or depth>20:reject('GRAPH_HIERARCHY_LIMIT_OR_CYCLE')
        visited.add(e)
        heading=one(e,'logseq.property/heading')
        if heading is True:heading=min(depth+1,6)
        if heading is False:heading=None
        if heading is not None and (type(heading) is not int or not 1<=heading<=6):reject('GRAPH_VISUAL_ADAPTER_REQUIRED')
        language=one(e,'logseq.property.code/lang','')
        if not isinstance(language,str) or len(language)>128:reject('GRAPH_VISUAL_ADAPTER_REQUIRED')
        status=ident(one(e,'logseq.property/status'))
        checked=True if status=='logseq.property/status.done' else False if status and status.startswith('logseq.property/status.') else None
        return {'id':block_ids[e],'asset':asset_data.get(e),'markdown':one(e,'block/title',one(e,'block/raw-title','')),'display':keyword(one(e,'logseq.property.node/display-type')) or 'markdown','background':background_color(entities,one(e,'logseq.property/background-color')),'heading':heading,'language':language,'checked':checked,'properties':properties(e),'children':[node(c,depth+1) for c in children[e]]}
    output=[]
    for p in sorted(pages):
        if len(label(p).encode('utf-8'))>1024:reject('GRAPH_TITLE_LIMIT')
        if p not in asset_data:visited.add(p)
        output.append({'id':destinations[p],'title':label(p),'trashed':one(p,'logseq.property/deleted-at') is not None,'sourceId':p,'createdAt':source_date(p,'block/created-at'),'updatedAt':source_date(p,'block/updated-at'),'tags':[label(target(v)) for v in entities[p].get('block/tags',[]) if target(v) is not None and not builtin(target(v))],'blockId':block_ids[p],'properties':[] if p in asset_data else properties(p),'children':([node(p)] if p in asset_data else [node(e) for e in children[p]])})
    if visited!=authored:reject('GRAPH_UNACCOUNTED_AUTHORED_NODES')
    counts['blocks']+=sum(p in asset_data for p in pages)
    counts['pages']=len(output);counts['references']=len(references)
    return {'assetRoot':str(Path(asset_root).absolute()) if asset_root is not None else None,'formatVersion':1,'batchId':str(uuid.uuid4()),'folderId':str(uuid.uuid4()),'pages':output,'references':references,'counts':counts}
