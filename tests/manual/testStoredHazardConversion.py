import unittest,importlib.util,json,gzip
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('stored_build',Path(__file__).parents[2]/'work/build-stored-hazards.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ring=[[129,34],[131,34],[131,36],[129,36],[129,34]]
class MemoryPath:
 def __init__(self,key='',files=None):self.key=key;self.files={} if files is None else files
 def __truediv__(self,key):return MemoryPath(self.key+'/'+key,self.files)
 def mkdir(self,**kwargs):pass
 def write_bytes(self,data):self.files[self.key]=data
 def read_bytes(self):return self.files[self.key]
 def write_text(self,text):self.write_bytes(text.encode())
 def read_text(self):return self.read_bytes().decode()
class StoredConversion(unittest.TestCase):
 def test_holes_and_components_preserve_every_coordinate(self):
  hole=[[129.5,34.5],[129.6,34.5],[129.6,34.6],[129.5,34.5]]
  geometry={'type':'MultiPolygon','coordinates':[[ring,hole],[ring]]}
  parts=list(m.components(geometry));self.assertEqual(parts[0][0]['coordinates'],[ring,hole]);self.assertEqual(parts[1][0]['coordinates'],[ring])
 def test_gzip_round_trip_full_precision_and_attribute_strings(self):
  root=MemoryPath();w=m.Writer(root,'soil-33');f={'type':'Feature','id':'x','bbox':[129,34,131,36],'properties':{'raw':'<script>文字</script>'},'geometry':{'type':'Polygon','coordinates':[ring]}}
  w.add(f);r=w.finish();file=r['files'][0];raw=(root/'soil-33'/file['name']).read_bytes();self.assertEqual(m.digest(raw),file['sha256']);self.assertEqual(json.loads(gzip.decompress(raw))['features'],[f]);self.assertEqual(file['decodedBytes'],len(gzip.decompress(raw)))
 def test_unsupported_geometry_and_open_ring_fail(self):
  for geometry in [{'type':'Point','coordinates':[130,35]},{'type':'Polygon','coordinates':[[[129,34],[131,34],[131,36],[129,35]]]}]:
   with self.assertRaises(ValueError):list(m.components(geometry))
 def test_crs_and_truncation_fail(self):
  import io
  for text in ['{"type":"FeatureCollection","features":[]}','{"type":"FeatureCollection","crs":"EPSG::6668",\n"features": [\n']:
   with self.assertRaises(ValueError):list(m.features(io.BytesIO(text.encode())))
 def test_failed_conversion_keeps_last_good_pointer(self):
  with patch.object(m,'Path',lambda value:value):
   root=MemoryPath();originals=root/'originals';public=root/'public';pointer=public/'data'/'stored-hazards'/'current.json';pointer.write_text('last-good')
   (originals/'download-results.json').write_text(json.dumps([{'state':'failed'}]*10))
   with self.assertRaises(ValueError):m.convert(originals,public,root/'stage')
   self.assertEqual(pointer.read_text(),'last-good')
if __name__=='__main__':unittest.main()
