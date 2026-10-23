"""Convert authorized public polygon SHP/DBF files to small reference-map chunks.

No installation, network fetch, CRS assertion or legal suitability decision.
Original archives and their SHA-256 remain the authority for this conversion.
"""
from pathlib import Path
from collections import Counter, defaultdict
import argparse, hashlib, json, math, struct, zipfile

def read_dbf(data):
    count=struct.unpack_from('<I',data,4)[0]
    header,size=struct.unpack_from('<HH',data,8)
    fields=[]
    for offset in range(32,header-1,32):
        field=data[offset:offset+32]
        if field[0]==13:break
        fields.append((field[:11].split(b'\0')[0].decode('cp932'),field[16]))
    rows=[]
    for i in range(count):
        raw=data[header+i*size:header+(i+1)*size]
        if len(raw)!=size:raise ValueError('Truncated DBF record')
        row={};offset=1
        for name,width in fields:
            row[name]=raw[offset:offset+width].decode('cp932').strip();offset+=width
        rows.append(None if raw[:1]==b'*' else row)
    return rows

def ring_box(ring):
    return [min(p[0] for p in ring),min(p[1] for p in ring),max(p[0] for p in ring),max(p[1] for p in ring)]

def inside(point,ring):
    x,y=point;result=False
    for a,b in zip(ring,ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:result=not result
    return result

def group_rings(rings):
    """Containment parity preserves holes, islands and disjoint outer rings."""
    items=[]
    for ring in rings:
        if len(ring)<4 or ring[0]!=ring[-1]:raise ValueError('Invalid polygon ring')
        ox,oy=ring[0]
        area=abs(sum((a[0]-ox)*(b[1]-oy)-(b[0]-ox)*(a[1]-oy) for a,b in zip(ring,ring[1:])))
        if area==0:raise ValueError('Zero-area polygon ring')
        items.append({'ring':ring,'bbox':ring_box(ring),'area':area})
    items.sort(key=lambda item:item['area'],reverse=True)
    polygons=[]
    for i,item in enumerate(items):
        box=item['bbox'];parents=[]
        for j,candidate in enumerate(items[:i]):
            other=candidate['bbox']
            if other[0]<=box[0] and other[1]<=box[1] and other[2]>=box[2] and other[3]>=box[3] and inside(item['ring'][0],candidate['ring']):parents.append(j)
        parent=min(parents,key=lambda j:items[j]['area']) if parents else None
        item['depth']=items[parent]['depth']+1 if parent is not None else 0
        if item['depth']%2==0:
            item['polygon']=len(polygons);polygons.append([item['ring']])
        else:
            item['polygon']=items[parent]['polygon'];polygons[item['polygon']].append(item['ring'])
    return polygons

def read_shp(data):
    if struct.unpack_from('>i',data,0)[0]!=9994 or struct.unpack_from('>i',data,24)[0]*2!=len(data):raise ValueError('Invalid SHP header/length')
    records=[];offset=100
    while offset<len(data):
        number,words=struct.unpack_from('>ii',data,offset);offset+=8;record=data[offset:offset+words*2];offset+=words*2
        kind=struct.unpack_from('<i',record)[0]
        if kind==0:records.append([]);continue
        if kind not in (5,15,25):raise ValueError('Only polygon SHP records are supported')
        parts,points=struct.unpack_from('<ii',record,36)
        starts=list(struct.unpack_from('<'+'i'*parts,record,44))+[points]
        coordinates=[list(pair) for pair in struct.iter_unpack('<dd',record[44+parts*4:44+parts*4+points*16])]
        if len(coordinates)!=points or starts[0]!=0 or starts!=sorted(starts):raise ValueError('Invalid polygon parts')
        if any(not(math.isfinite(x) and math.isfinite(y) and 120<=x<=155 and 20<=y<=50) for x,y in coordinates):raise ValueError('Coordinates are not plausible Japanese geographic ordinates')
        records.append(group_rings([coordinates[starts[i]:starts[i+1]] for i in range(parts)]))
    return records

def union_box(boxes):
    return [min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]

def reference_attributes(properties,dataset,record):
    attrs={'sourceRecordId':properties.get('OBJECTID') or str(record),'sourceRecordIndex':record,'sourceYear':properties.get('FIS_YEAR') or None,'name':properties.get('遺跡名') or dataset['label'],'place':properties.get('所在地') or properties.get('CTV_NAME') or '', 'kind':properties.get('代表的な') or properties.get('種別') or dataset['category'],'era':properties.get('主な時代') or '', 'layerCode':properties.get('LAYER_NO') or None,'sourceRemark':properties.get('REMARK_STR') or ''}
    if dataset['category']=='culture':
        attrs.update({'detailKind':properties.get('詳細な種') or '', 'sourceCondition':properties.get('遺跡の残') or '', 'sourceDescription':'\n'.join(properties[key] for key in ['遺跡概_1','遺跡概_2'] if properties.get(key)), 'sourceFinds':properties.get('主な出土') or '', 'sourceRemark':properties.get('備考') or ''})
    return attrs

def write_dataset(archive_path,stem,dataset,output):
    with zipfile.ZipFile(archive_path) as archive:
        rows=read_dbf(archive.read(stem+'.dbf'));shapes=read_shp(archive.read(stem+'.shp'))
        prj=archive.read(stem+'.prj').decode('utf-8-sig') if stem+'.prj' in archive.namelist() else None
    if prj and 'GEOGCS["JGD2000"' not in prj:raise ValueError('Unverified source CRS')
    if len(rows)!=len(shapes):raise ValueError('SHP/DBF record count differs')
    groups=defaultdict(list);years=Counter();count=0
    for record,(properties,polygons) in enumerate(zip(rows,shapes),1):
        if properties is None:continue
        if properties.get('FIS_YEAR'):years[properties['FIS_YEAR']]+=1
        attrs=reference_attributes(properties,dataset,record)
        for component,polygon in enumerate(polygons):
            box=ring_box(polygon[0]);cell=(math.floor((box[0]+box[2])*5),math.floor((box[1]+box[3])*5))
            geometry={'type':'Polygon','coordinates':polygon}
            groups[cell].append({'type':'Feature','id':f"{dataset['id']}:{record}:{component}",'bbox':box,'properties':{**attrs,'component':component},'geometry':geometry});count+=1
    files=[];directory=output/dataset['id'];directory.mkdir(parents=True,exist_ok=True)
    for cell,features in sorted(groups.items()):
        for part,start in enumerate(range(0,len(features),400)):
            selected=features[start:start+400];name=f'{cell[0]}_{cell[1]}_{part}.geojson'
            content={'type':'FeatureCollection','sourceCrs':{'name':'JGD2000','epsg':4612} if prj else {'name':'Not supplied; geographic ordinates only','epsg':None},'features':selected}
            raw=json.dumps(content,ensure_ascii=False,separators=(',',':')).encode('utf-8');(directory/name).write_bytes(raw)
            files.append({'url':f"/data/regulatory/{dataset['id']}/{name}",'bbox':union_box([f['bbox'] for f in selected]),'features':len(selected),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    return {**dataset,'sourceRecordCount':len(rows),'featureCount':count,'sourceYears':dict(sorted(years.items())),'sourceCrs':{'name':'JGD2000','epsg':4612,'wkt':prj} if prj else {'name':'Not supplied; datum unconfirmed','epsg':None},'displayMethod':'原本座標値を保持し経緯度として参考表示。測地系変換・位置精度は未検証。','bbox':union_box([f['bbox'] for f in files]),'archiveSha256':hashlib.sha256(archive_path.read_bytes()).hexdigest(),'files':files}

def build(inputs,output):
    output.mkdir(parents=True,exist_ok=True)
    expected={'opendata_60.zip':'db1341174ae3f57175fd1af398cc982c7f740ef374e91904e044835f1c4abdc4','opendata_19.zip':'4800304479f7825da8e4f41d63e838037bc94b8f8e849105a7d6e8052e7a6e21','A12-15_34_GML.zip':'910ba99811e3d77d2af2bab9c3d1896c6e012b98c9b7630bfbd8e47d8f7d1e6e','A12-15_35_GML.zip':'6921cffe6f8fc58cf503ddf64731206069413be844bf4e6e03d1eaec5c790a9f'}
    for name,digest in expected.items():
        if hashlib.sha256((inputs/name).read_bytes()).hexdigest()!=digest:raise ValueError('Source archive checksum mismatch: '+name)
    definitions=[
      ('opendata_60.zip',None,{'id':'okayama-culture','label':'岡山・埋蔵文化財（参考）','category':'culture','prefecture':'33','license':'CC BY（版番号未記載）','sourceUrl':'https://www.gis.pref.okayama.jp/pref-okayama/OpenDataDetail?lid=60','featureDate':'地図説明 2026-04-06（ZIP地物更新日は未確認）','exportDate':'2026-10-19','historic':False,'color':'#7b3fc6','attribution':'岡山県 おかやま全県統合型GIS'}),
      ('opendata_19.zip',None,{'id':'okayama-agriculture','label':'岡山・農業地域（参考）','category':'agriculture-region','prefecture':'33','license':'CC BY（版番号未記載）','sourceUrl':'https://www.gis.pref.okayama.jp/pref-okayama/OpenDataDetail?lid=19','featureDate':'原資料年・地物更新日未確認','exportDate':'2026-10-19','historic':False,'color':'#a66725','attribution':'岡山県 おかやま全県統合型GIS'}),
    ]
    for code,pref in [('34','広島'),('35','山口')]:
      for layer,category,label in [('05','agriculture-region','農業地域'),('06','agricultural-use','農用地区域')]:
        definitions.append((f'A12-15_{code}_GML.zip',f'a001{code}00201602{layer}',{'id':f'a12-{code}-{layer}','label':f'{pref}・{label}（古い参考資料）','category':category,'prefecture':code,'license':'CC BY 4.0','sourceUrl':'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A12.html','fileEdition':'2015','featureDate':'FIS_YEARを優先表示（ファイル版年と区別）','historic':True,'color':'#a66725' if layer=='05' else '#704e21','attribution':'国土数値情報 土地利用基本計画（農業地域）'}))
    datasets=[]
    for name,stem,dataset in definitions:
        path=inputs/name
        if stem is None:
            with zipfile.ZipFile(path) as archive:stem=next(n[:-4] for n in archive.namelist() if n.endswith('.shp'))
        result=write_dataset(path,stem,dataset,output);datasets.append(result)
        print(json.dumps({'id':result['id'],'records':result['sourceRecordCount'],'features':result['featureCount'],'years':result['sourceYears'],'chunks':len(result['files'])},ensure_ascii=False),flush=True)
    manifest={'schemaVersion':1,'purpose':'土地探索の手掛かり。法的判定・好適地認定ではありません。','unknown':'空白・対象外・失敗・古い資料は規制なしや安全を意味しません。','datasets':datasets}
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    registry=output.parents[2]/'src/utils/regulatoryRegistryData.js'
    registry.write_text('// Generated by work/build-regulatory-reference-data.py from pinned public originals.\nexport const REGULATORY_REGISTRY_DATA = '+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('inputs',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();build(args.inputs,args.output)
