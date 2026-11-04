"""Pure local normalization of publicly documented Logseq presentation values.

No diagnostics, logging, CSS evaluation, URLs or filesystem access.
"""
import re
from logseq_sqlite_snapshot import keyword

PALETTE=frozenset({'yellow','red','orange','green','blue','purple','pink','gray','grey'})

def background_color(entities,value):
    seen=set()
    while type(value) is int:
        if value in seen or len(seen)>=8:return None
        seen.add(value);fields=entities.get(value,{})
        values=fields.get('logseq.property/value',fields.get('block/title',[]))
        if len(values)!=1:return None
        value=values[0]
    value=keyword(value) or value
    if not isinstance(value,str):return None
    value=value.lower().strip()
    if value.startswith('logseq.property/color.'):
        value=value.removeprefix('logseq.property/color.')
    m=re.fullmatch(r'var\(--ls-highlight-color-([a-z]+)\)',value)
    if m:value=m.group(1)
    if value in PALETTE:return 'gray' if value=='grey' else value
    if re.fullmatch(r'#[0-9a-f]{3}',value):return '#'+''.join(c*2 for c in value[1:])
    if re.fullmatch(r'#[0-9a-f]{6}',value):return value
    return None

def visible_markup(text):
    """Ignore literal Markdown code when checking unsupported live syntax.

    This classifies only; the native Markdown parser remains the final fidelity
    authority. Unterminated syntax stays visible and fails closed as necessary.
    """
    return re.sub(r'```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`','',text)
