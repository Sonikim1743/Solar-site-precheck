"""Render a parsed synthetic DXF at physical A3 1:1000 (not a CAD UI preview)."""
import json, math, pathlib, sys
import ezdxf
import pymupdf as pdf

folder=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'outputs/dxf')
doc=ezdxf.readfile(folder/'synthetic-tilt-15-fence-on.dxf')
scale=72/25.4  # 1 metre model -> 1 mm paper at 1:1000
paper=pdf.open()
page=paper.new_page(width=420*scale,height=297*scale)
project=lambda p:pdf.Point(210*scale+p[0]*scale,140*scale-p[1]*scale)
palette={'BOUNDARY':(.7,.45,0),'BOUNDARY_HOLES':(.8,.15,.12),'MODULES':(.15,.32,.52),'FENCE':(.1,.55,.25),'CONTOUR':(.65,.65,.65),'CONTOUR_MAJOR':(.5,.4,.3),'PARCEL_BOUNDARY':(.6,.3,.7),'REFERENCE':(0,.6,.7)}
for entity in doc.modelspace():
    layer=entity.dxf.layer
    if entity.dxftype()=='LWPOLYLINE':
        points=[project(p) for p in entity.get_points('xy')]
        page.draw_polyline(points,color=palette.get(layer,(.25,.25,.25)),width=.28 if layer=='MODULES' else .6,closePath=entity.closed,fill=(.92,.95,.98) if layer=='MODULES' else None)
    elif entity.dxftype()=='TEXT':
        page.insert_text(project(entity.dxf.insert),entity.dxf.text,fontsize=entity.dxf.height*scale,fontname='japan',color=(.15,.15,.15))
page.insert_text((15*scale,16*scale),'合成DXFの独立パーサー描画 / A3 1:1000',fontname='japan',fontsize=13)
page.insert_text((15*scale,24*scale),'実候補地ではありません。ZWCADの印刷プレビュー確認とは別の検査です。',fontname='japan',fontsize=8)
target=folder/'synthetic-parser-preview-a3-1-1000.pdf'
paper.save(target,garbage=4,deflate=True)
page.get_pixmap(matrix=pdf.Matrix(1.4,1.4)).save(folder/'synthetic-parser-preview.png')
reopened=pdf.open(target)
assert abs(reopened[0].rect.width/scale-420)<1e-4
assert abs(reopened[0].rect.height/scale-297)<1e-4
lengths=[]
for drawing in reopened[0].get_drawings():
    if drawing['color'] and max(abs(drawing['color'][i]-[0,.6,.7][i]) for i in range(3))<1e-4:
        for item in drawing['items']:
            if item[0]=='l' and abs(item[1].y-item[2].y)<1e-4:lengths.append(abs(item[2].x-item[1].x)/scale)
assert any(abs(v-50)<.001 for v in lengths),lengths
evidence={'renderer':'ezdxf '+ezdxf.__version__+' + PyMuPDF '+pdf.VersionBind,'cadUiPreview':False,'pageMm':[reopened[0].rect.width/scale,reopened[0].rect.height/scale],'scaleDenominator':1000,'horizontalReferenceLengthsMm':lengths,'physicalPrint':False}
(folder/'parser-preview-verification.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
print(json.dumps(evidence))
