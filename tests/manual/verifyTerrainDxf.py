"""Independent ezdxf read/audit. Run after generateTerrainDxfSamples.mjs.

Install ezdxf in a disposable verification environment, not app dependencies.
"""
import collections, json, math, pathlib, sys
import ezdxf

directory = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'outputs/dxf')
manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
evidence=[]
for sample in manifest['samples']:
    doc=ezdxf.readfile(directory/sample['name'])
    audit=doc.audit()
    assert not audit.errors, str(audit.errors)
    assert not audit.fixes, str(audit.fixes)
    assert doc.dxfversion=='AC1021'
    assert doc.header['$INSUNITS']==6
    model=doc.modelspace()
    counts=collections.Counter(e.dxf.layer for e in model)
    for layer,count in sample['counts'].items(): assert counts[layer]==count,(layer,counts[layer],count)
    assert all(e.dxftype() in ('LWPOLYLINE','TEXT') for e in model)
    assert all(float(e.dxf.elevation)==0 for e in model if e.dxftype()=='LWPOLYLINE')
    assert all(e.dxf.insert.z==0 for e in model if e.dxftype()=='TEXT')
    modules=list(model.query('LWPOLYLINE[layer=="MODULES"]'))
    assert len(modules)==sample['moduleCount']
    for e,expected in zip(modules,sample['modules']):
        assert e.closed
        vertices=list(e.get_points('xy'))
        assert len(vertices)==4
        for a,b in zip(vertices,expected): assert math.dist(a,b)<1e-8
        assert abs(math.dist(vertices[0],vertices[1])-sample['moduleWidthM'])<1e-8
        assert abs(math.dist(vertices[0],vertices[3])-sample['projectedModuleHeightM'])<1e-8
        assert abs(vertices[3][0]-vertices[0][0])<1e-8
        assert vertices[3][1]>vertices[0][1]
    outer=list(model.query('LWPOLYLINE[layer=="BOUNDARY"]'))
    holes=list(model.query('LWPOLYLINE[layer=="BOUNDARY_HOLES"]'))
    assert len(outer)==2 and len(holes)==1
    assert sorted(len(e) for e in outer)==[4,6]
    for e,expected in zip(outer,[p[0] for p in sample['boundary']]):
        assert e.closed
        assert all(math.dist(a,b)<1e-8 for a,b in zip(e.get_points('xy'),expected[:-1]))
    assert all(math.dist(a,b)<1e-8 for a,b in zip(holes[0].get_points('xy'),sample['boundary'][0][1][:-1]))
    bar=next(iter(model.query('LWPOLYLINE[layer=="REFERENCE"]')))
    bar_length=math.dist(*list(bar.get_points('xy')))
    assert abs(bar_length-50)<1e-9
    assert list(model.query('TEXT[layer=="PARCEL_TEXT"]'))[0].dxf.text==sample['parcelText']
    assert any('測量成果・施工図ではありません' in e.dxf.text for e in model.query('TEXT[layer=="NOTES"]'))
    assert not any('\\U+' in e.dxf.text for e in model.query('TEXT')), 'Unicode escapes must decode'
    evidence.append({'file':sample['name'],'entities':len(model),'modules':len(modules),'layers':dict(counts),'auditErrors':len(audit.errors),'auditFixes':len(audit.fixes),'barMetres':bar_length,'paperAt1To1000Mm':bar_length,'paperAt1To500Mm':bar_length*2,'japanese':sample['parcelText']})
(directory/'ezdxf-verification.json').write_text(json.dumps({'parser':'ezdxf '+ezdxf.__version__,'samples':evidence},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'parser':'ezdxf '+ezdxf.__version__,'files':len(evidence),'auditErrors':sum(e['auditErrors'] for e in evidence),'auditFixes':sum(e['auditFixes'] for e in evidence),'modules':[e['modules'] for e in evidence]},ensure_ascii=False))
