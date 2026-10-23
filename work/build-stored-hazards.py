"""Convert verified official originals, preserving coordinates without simplification.

Outputs an immutable version before atomically replacing current.json. A failed
conversion never changes the last validated version. Originals stay outside public/.
"""
from pathlib import Path
import argparse, hashlib, json, math, zipfile, os, re, gzip
from collections import Counter

def encode(value): return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def digest(data): return hashlib.sha256(data).hexdigest()
def bbox(points):
    return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
def union(boxes): return [min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]

def features(stream):
    """The official GDAL export has a complete feature on each UTF-8 line.
    Fail closed if the producer changes this format; never silently skip a record.
    """
    import io
    started=ended=False;header=''
    for raw in io.TextIOWrapper(stream,encoding='utf-8-sig'):
        line=raw.strip()
        if not started:
            header+=line
            if re.search(r'"features"\s*:\s*\[\s*$',line):
                if 'FeatureCollection' not in header or 'EPSG::6668' not in header: raise ValueError('Unverified collection / source CRS')
                started=True
            continue
        if not line: continue
        if line==']' or line==']}': ended=True;continue
        if ended:
            if line!='}': raise ValueError('Unexpected GeoJSON trailer')
            continue
        feature=json.loads(line.removesuffix(','))
        if feature.get('type')!='Feature': raise ValueError('Invalid feature')
        yield feature
    if not started or not ended: raise ValueError('Truncated / unsupported GeoJSON export')

def components(geometry):
    kind=geometry.get('type');coordinates=geometry.get('coordinates')
    if kind=='Polygon': parts=[('Polygon',coordinates)]
    elif kind=='MultiPolygon':parts=[('Polygon',p) for p in coordinates]
    elif kind=='LineString':parts=[('LineString',coordinates)]
    elif kind=='MultiLineString':parts=[('LineString',p) for p in coordinates]
    else:raise ValueError('Unsupported geometry '+str(kind))
    for part_kind,part in parts:
        rings=part if part_kind=='Polygon' else [part]
        if not rings:raise ValueError('Empty geometry')
        for ring in rings:
            if len(ring)<(4 if part_kind=='Polygon' else 2):raise ValueError('Invalid ring / line')
            if part_kind=='Polygon' and ring[0]!=ring[-1]:raise ValueError('Open ring')
            for p in ring:
                if len(p)!=2 or not all(isinstance(n,(int,float)) and math.isfinite(n) for n in p) or not(120<=p[0]<=155 and 20<=p[1]<=50):raise ValueError('Invalid source coordinate')
        yield {'type':part_kind,'coordinates':part},bbox([p for ring in rings for p in ring])

class Writer:
    def __init__(self,root,dataset):
        self.root=root/dataset;self.root.mkdir(parents=True);self.dataset=dataset;self.cells={};self.files=[];self.counts=Counter();self.input_hash=hashlib.sha256()
    def add(self,feature):
        b=feature['bbox'];key=f'{math.floor((b[0]+b[2])*10)}_{math.floor((b[1]+b[3])*10)}'
        data=encode(feature).encode('utf-8')
        if len(data)>128_000_000:raise ValueError('One full precision component exceeds decoded budget')
        self.input_hash.update(data);self.counts[feature['geometry']['type']]+=1
        cell=self.cells.setdefault(key,{'features':[],'bytes':0,'part':0})
        if cell['features'] and (len(cell['features'])>=300 or cell['bytes']+len(data)>3_800_000):self.flush(key)
        cell['features'].append(feature);cell['bytes']+=len(data)
    def flush(self,key):
        cell=self.cells[key]
        if not cell['features']:return
        name=f'{key}_{cell["part"]}.geojson.gz';plain=encode({'type':'FeatureCollection','features':cell['features']}).encode('utf-8');data=gzip.compress(plain,compresslevel=6,mtime=0)
        if len(data)>24_000_000:raise ValueError('Compressed component exceeds Pages budget')
        (self.root/name).write_bytes(data)
        # Independently re-read before publishing the pointer.
        again=json.loads(gzip.decompress((self.root/name).read_bytes()))
        if encode(again['features'])!=encode(cell['features']):raise ValueError('Geometry/attribute round trip differs')
        self.files.append({'name':name,'bbox':union([f['bbox'] for f in cell['features']]),'count':len(cell['features']),'bytes':len(data),'decodedBytes':len(plain),'encoding':'gzip','sha256':digest(data)})
        cell['features']=[];cell['bytes']=0;cell['part']+=1
    def finish(self):
        for key in self.cells:self.flush(key)
        return {'id':self.dataset,'files':self.files,'bbox':union([f['bbox'] for f in self.files]),'geometryCounts':dict(self.counts),'geometryAndAttributesSha256':self.input_hash.hexdigest(),'coordinateMethod':'JGD2011経緯度（EPSG:6668）を保持。測地変換・丸め・単純化なし。表示と地点照合は同じ全精度座標。'}

def convert(originals,public,stage_root):
    originals=Path(originals);public=Path(public);stage_root=Path(stage_root)
    downloads=json.loads((originals/'download-results.json').read_text())
    if len(downloads)!=10 or any(r['state']!='complete' for r in downloads):raise ValueError('Incomplete originals')
    version='r2025-'+digest(('gzip-v1'+''.join(r['sha256'] for r in downloads)).encode())[:12]
    target=public/'data'/'stored-hazards'/version
    if target.exists():raise ValueError('Version already exists; verify existing result before rebuilding')
    stage=stage_root/version;stage.mkdir(parents=True,exist_ok=False)
    manifest={'schemaVersion':1,'version':version,'sourceEdition':'2025','collectedAt':max(r['completedAt'] for r in downloads),'prefectures':['33','34','35'],'noDataMeaning':'収録図形との重なり未検出は安全・区域なしを意味しません。未収録河川・未指定・更新差・位置精度は未確認。','datasets':[],'simplified':False}
    for row in downloads:
        filename=row['name'];raw=(originals/filename).read_bytes()
        if digest(raw)!=row['sha256']:raise ValueError('Original hash mismatch '+filename)
        category='soil' if filename.startswith('A33') else 'flood' if filename.startswith('A31a') else 'admin'
        code=re.search(r'_(\d{2})_',filename).group(1)
        dataset=f'{category}-{code}';writer=Writer(stage,dataset);records=0;members=[];phenomena=Counter();zones=Counter();rivers={}
        with zipfile.ZipFile(originals/filename) as archive:
            names=[n for n in archive.namelist() if n.endswith('.geojson') and (category!='flood' or n.startswith('20_'))]
            if not names:raise ValueError('No target member '+filename)
            for name in names:
                members.append(name)
                with archive.open(name) as stream:
                    for i,feature in enumerate(features(stream),1):
                        records+=1;props=feature['properties']
                        if category=='flood' and not all(k in props for k in ('A31a_201','A31a_202','A31a_205')):raise ValueError('Not max-scenario attributes')
                        if category=='soil' and str(props.get('A33_003'))!=code:raise ValueError('Prefecture differs')
                        if category=='admin' and not str(props.get('N03_007','')).startswith(code):raise ValueError('Admin code differs')
                        if category=='soil':phenomena[str(props.get('A33_001'))]+=1;zones[str(props.get('A33_002'))]+=1
                        if category=='flood':rivers[str(props['A31a_201'])]=props['A31a_202']
                        for part,(geometry,box) in enumerate(components(feature['geometry'])):
                            writer.add({'type':'Feature','id':f'{dataset}:{records}:{part}','bbox':box,'properties':{'sourceDatasetId':dataset,'sourceRecordId':str(records),'sourceMember':name,'sourceMemberRecord':i,'component':part,**props},'geometry':geometry})
                print(f'Converted {filename} / {name}',flush=True)
        metadata=writer.finish();metadata.update({'category':category,'prefecture':code,'recordCount':records,'archive':filename,'archiveSha256':row['sha256'],'downloadUrl':row['url'],'sourceMembers':members,'sourceCrs':{'epsg':6668,'name':'JGD2011'},'sourceDate':'2025-01-01' if category=='admin' else '2025-07-24' if category=='soil' and code=='34' else '2025-08-01' if category=='soil' else '2025年版（2026年10月更新）。個別の原図基準日は原本確認。','license':'CC BY 4.0'+('／広島個別注意事項あり' if category=='soil' and code=='34' else ''),'sourceUrl':f'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-{"A33" if category=="soil" else "A31a" if category=="flood" else "N03"}-2025.html','attribution':'国土交通省 国土数値情報'+('／土砂災害ポータルひろしま・DoboX' if category=='soil' and code=='34' else ''),'notes':'国土数値情報を形式変換・分割した参考表示。法定境界・取引証拠や許認可判断用ではありません。'+(' 広島は概略参考図で境界未確定・全法関連情報を含みません。正確な情報は県建設事務所へ。' if category=='soil' and code=='34' else '')+(' 洪水は想定最大規模のみ。対象河川のみで内水・高潮・津波や他の洪水シナリオは含みません。' if category=='flood' else ''),'phenomena':dict(phenomena),'zones':dict(zones),'rivers':rivers})
        manifest['datasets'].append(metadata)
        print(encode({'id':dataset,'records':records,'components':sum(writer.counts.values()),'files':len(writer.files)}),flush=True)
    manifest['fileCount']=sum(len(d['files']) for d in manifest['datasets']);manifest['bytes']=sum(f['bytes'] for d in manifest['datasets'] for f in d['files'])
    if manifest['fileCount']+600>20_000:raise ValueError('Conservative Pages file budget exceeded')
    data=encode(manifest).encode('utf-8');(stage/'manifest.json').write_bytes(data)
    target.parent.mkdir(parents=True,exist_ok=True);os.replace(stage,target)
    pointer={'schemaVersion':1,'version':version,'url':f'/data/stored-hazards/{version}/manifest.json','sha256':digest(data)}
    temporary=target.parent/'current.next.json';temporary.write_text(encode(pointer),encoding='utf-8');os.replace(temporary,target.parent/'current.json')
    print(encode({'state':'validated-and-published-locally','version':version,'datasets':len(manifest['datasets']),'files':manifest['fileCount'],'bytes':manifest['bytes']}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--originals',required=True);p.add_argument('--public',required=True);p.add_argument('--stage',required=True);a=p.parse_args();convert(a.originals,a.public,a.stage)
