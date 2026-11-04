"""Importer-only fixed aggregate diagnostics. Never return record data or names."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path,PureWindowsPath
from logseq_sqlite_snapshot import Snapshot,keyword,fingerprint,Rejected

def diagnose(datoms,schema,asset_root,audit):
    aliases={k:keyword(v) for k,v in schema['map'] if type(k) is int and keyword(v)}
    entities={}
    for e,a,v,_tx in datoms.values():
        name=keyword(a) or aliases.get(a)
        if name is not None:entities.setdefault(e,{}).setdefault(name,[]).append(v)
    def one(fields,key,default=None):
        values=fields.get(key,[])
        return values[0] if len(values)==1 else default
    def uid(fields):
        value=one(fields,'block/uuid');return value.get('uuid') if isinstance(value,dict) else value if isinstance(value,str) else None
    counts={k:0 for k in ['assets','localAssetFiles','missingUUIDAssets','missingWithSHA256','missingWithoutChecksum','missingOtherChecksum','missingWithRemoteMetadata','missingWithDeclaredFilename','declaredFilenameWithinScope','declaredFilenameOutsideScope','declaredFilenameExisting','declaredBasenameExisting','assetFilePathPresent','inlineAssetDataURI','inventoryFiles','inventoryDirectories','inventoryZipFiles','inventoryUUIDNames','inventoryHashNames','inventoryOtherNames','displayMath','displayQuote','displayCode','displayNumbered','displayQuery','displayTable','displayOther','backgroundHex','backgroundPalette','backgroundOther','nonStringTitles','macroEmbed','macroQuery','macroRenderer','macroMedia','macroOther','mathDelimited','scriptMarkup','recycledNodes','attachmentPDF','attachmentAudio','attachmentVideo','attachmentSVG','attachmentOther','attachmentText','attachmentOffice','attachmentArchive','attachmentUnknown','backgroundReference','backgroundResolvedHex','backgroundResolvedPalette','backgroundUnsupported','recycledPages','recycledBlocks','missingPDFAnnotationImages','missingPDFAnnotationImagesWithLocalPDF','missingDerivedImageMetadata']}
    root=Path(asset_root).absolute()
    if root.drive.startswith('\\\\') or root.resolve()!=root:raise Rejected('DIAGNOSTIC_ASSET_SCOPE_INVALID')
    sizes=0;entries=0;pending=[(root,0)]
    if root.is_dir():
        while pending:
            directory,depth=pending.pop()
            if depth>16 or directory.resolve()!=directory:raise Rejected('DIAGNOSTIC_INVENTORY_LIMIT')
            for p in directory.iterdir():
                entries+=1
                if entries>20000:raise Rejected('DIAGNOSTIC_INVENTORY_LIMIT')
                m=p.stat()
                if p.is_symlink() or p.resolve()!=p or getattr(m,'st_file_attributes',0)&0x400:raise Rejected('DIAGNOSTIC_ASSET_SCOPE_INVALID')
                if p.is_dir():counts['inventoryDirectories']+=1;pending.append((p,depth+1));continue
                if not p.is_file():raise Rejected('DIAGNOSTIC_ASSET_SCOPE_INVALID')
                counts['inventoryFiles']+=1;sizes+=m.st_size
                if counts['inventoryFiles']>20000 or sizes>2*1024*1024*1024:raise Rejected('DIAGNOSTIC_INVENTORY_LIMIT')
                if p.suffix.lower()=='.zip':counts['inventoryZipFiles']+=1
                stem=p.stem
                if re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',stem):counts['inventoryUUIDNames']+=1
                elif re.fullmatch(r'[0-9a-fA-F]{32,64}',stem):counts['inventoryHashNames']+=1
                else:counts['inventoryOtherNames']+=1
                if m.st_size<=32*1024*1024:audit.append({'path':str(p),'bytes':m.st_size,'mtime':m.st_mtime_ns,'sha256':fingerprint(p)})
    palette={'yellow','red','orange','green','blue','purple','pink','gray','grey'}
    displays={'math':'displayMath','quote':'displayQuote','code':'displayCode','numbered':'displayNumbered','query':'displayQuery','table':'displayTable'}
    ids={keyword(one(f,'db/ident')):e for e,f in entities.items() if keyword(one(f,'db/ident'))}
    def target(v):return v if type(v) is int and v in entities else ids.get(keyword(v))
    from logseq_values import background_color,visible_markup
    missing_ids=set();available_ids=set()
    for entity_id,fields in entities.items():
        if one(fields,'logseq.property/built-in?',False) is True:continue
        display=keyword(one(fields,'logseq.property.node/display-type'))
        if display is not None:counts[displays.get(display,'displayOther')]+=1
        background=one(fields,'logseq.property/background-color')
        if background is not None:
            if type(background) is int:counts['backgroundReference']+=1
            normalized=background_color(entities,background)
            counts['backgroundResolvedHex' if normalized and normalized.startswith('#') else 'backgroundResolvedPalette' if normalized else 'backgroundUnsupported']+=1
            color=keyword(background) or background
            if isinstance(color,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',color):counts['backgroundHex']+=1
            elif isinstance(color,str) and color.lower() in palette:counts['backgroundPalette']+=1
            else:counts['backgroundOther']+=1
        if one(fields,'logseq.property/deleted-at') is not None:
            counts['recycledNodes']+=1
            page=any(keyword(v)=='logseq.class/Page' or keyword(one(entities.get(target(v),{}),'db/ident')) in {'logseq.class/Page','logseq.class/Journal','logseq.class/Tag','logseq.class/Property'} for v in fields.get('block/tags',[])) or 'block/name' in fields
            counts['recycledPages' if page else 'recycledBlocks']+=1
        title=one(fields,'block/title',one(fields,'block/raw-title',''))
        if not isinstance(title,str):counts['nonStringTitles']+=1
        elif display!='code':
            # Code fences/inline literals are data, not macros.
            visible=visible_markup(title)
            if '$$' in visible:counts['mathDelimited']+=1
            if '<script' in visible.lower():counts['scriptMarkup']+=1
            for match in re.finditer(r'\{\{\s*([A-Za-z0-9_-]+)',visible):
                name=match.group(1).lower();key='macroEmbed' if name=='embed' else 'macroQuery' if name=='query' else 'macroRenderer' if name=='renderer' else 'macroMedia' if name in {'youtube','video','audio','vimeo','pdf'} else 'macroOther';counts[key]+=1
        extension=one(fields,'logseq.property.asset/type')
        if extension is None:continue
        counts['assets']+=1;extension=keyword(extension) or extension
        if not isinstance(extension,str):counts['attachmentOther']+=1;continue
        extension=extension.lower()
        if extension=='pdf':counts['attachmentPDF']+=1
        elif extension in {'mp3','m4a','wav','ogg','flac','aac'}:counts['attachmentAudio']+=1
        elif extension in {'mp4','webm','mov','mkv','avi'}:counts['attachmentVideo']+=1
        elif extension=='svg':counts['attachmentSVG']+=1
        elif extension not in {'png','jpg','jpeg','webp','gif'}:
            counts['attachmentOther']+=1
            counts['attachmentText' if extension in {'txt','md','markdown','csv','json','edn','xml'} else 'attachmentOffice' if extension in {'doc','docx','xls','xlsx','ppt','pptx','odt','ods'} else 'attachmentArchive' if extension in {'zip','7z','tar','gz','rar'} else 'attachmentUnknown']+=1
        if 'file/path' in fields:counts['assetFilePathPresent']+=1
        for value in fields.values():
            counts['inlineAssetDataURI']+=sum(isinstance(v,str) and v.startswith('data:image/') for v in value)
        if one(fields,'logseq.property.asset/external-url'):continue
        u=uid(fields);candidate=root/((u or 'invalid')+'.'+extension)
        exists=u is not None and re.fullmatch(r'[a-z0-9]{1,12}',extension) and candidate.is_file() and not candidate.is_symlink()
        if exists:counts['localAssetFiles']+=1;available_ids.add(entity_id);continue
        counts['missingUUIDAssets']+=1;missing_ids.add(entity_id)
        checksum=one(fields,'logseq.property.asset/checksum')
        if isinstance(checksum,str) and re.fullmatch(r'[0-9a-fA-F]{64}',checksum):counts['missingWithSHA256']+=1
        elif checksum is None:counts['missingWithoutChecksum']+=1
        else:counts['missingOtherChecksum']+=1
        if one(fields,'logseq.property.asset/remote-metadata') is not None:counts['missingWithRemoteMetadata']+=1
        filename=one(fields,'logseq.property.asset/external-file-name')
        if isinstance(filename,str):
            counts['missingWithDeclaredFilename']+=1;win=PureWindowsPath(filename)
            # Only metadata checks within the explicit source scope. Never probe
            # a path elsewhere that a private record happens to mention.
            normalized=filename.replace('\\','/')
            if not win.is_absolute() and not win.drive and ':' not in normalized and '..' not in win.parts:
                relative=root/normalized
                if relative.resolve().is_relative_to(root.resolve()):
                    counts['declaredFilenameWithinScope']+=1
                    if relative.is_file():counts['declaredFilenameExisting']+=1
                else:counts['declaredFilenameOutsideScope']+=1
            else:counts['declaredFilenameOutsideScope']+=1
            base=win.name
            if base and base not in {'.','..'} and (root/base).is_file():counts['declaredBasenameExisting']+=1
    for fields in entities.values():
        image=target(one(fields,'logseq.property.pdf/hl-image'))
        if image in missing_ids:
            counts['missingPDFAnnotationImages']+=1
            if target(one(fields,'logseq.property/asset')) in available_ids:counts['missingPDFAnnotationImagesWithLocalPDF']+=1
            if one(fields,'logseq.property.pdf/hl-value') is not None and one(fields,'logseq.property.pdf/hl-page') is not None:counts['missingDerivedImageMetadata']+=1
    return counts

def run(source,node,asset_root):
    reader=Snapshot(source,node,Path(__file__).with_name('logseq-transit-codec.mjs'));audit=[]
    try:result={'status':'diagnosed','code':'OK',**reader.read(consumer=lambda d,s:diagnose(d,s,asset_root,audit))}
    except Rejected as e:result={'status':'blocked','code':e.code}
    except Exception:result={'status':'blocked','code':'DIAGNOSTIC_FAILED'}
    unchanged=True
    for item in audit:
        try:
            p=Path(item['path']);m=p.stat();unchanged=unchanged and m.st_size==item['bytes'] and m.st_mtime_ns==item['mtime'] and fingerprint(p)==item['sha256']
        except Exception:unchanged=False
    if not unchanged:result={**result,'status':'blocked','code':'SOURCE_ASSET_INTEGRITY_CHANGED'}
    return {**result,'sourceUnchanged':getattr(reader,'source_unchanged',None),'sidecarsUnchanged':getattr(reader,'sidecars_unchanged',None),'assetsChecked':len(audit),'assetsUnchanged':unchanged,'noteContentDisclosed':False,'imported':False}
def main():
    p=argparse.ArgumentParser(description='Fixed aggregate importer diagnostics; no private payload output.')
    p.add_argument('--source',required=True);p.add_argument('--assets',required=True);p.add_argument('--node',required=True);a=p.parse_args();print(json.dumps(run(a.source,a.node,a.assets),sort_keys=True))
if __name__=='__main__':main()
