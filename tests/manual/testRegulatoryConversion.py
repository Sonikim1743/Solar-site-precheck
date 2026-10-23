from pathlib import Path
import importlib.util, unittest

path=Path(__file__).resolve().parents[2]/'work/build-regulatory-reference-data.py'
spec=importlib.util.spec_from_file_location('reference_conversion',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def box(x,y,size):
    return [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]

class RingConversionTests(unittest.TestCase):
    def test_culture_original_notes_survive_without_becoming_current_legal_facts(self):
        attrs=module.reference_attributes({'遺跡名':'合成遺跡','詳細な種':'石造物\n(五輪塔)','遺跡の残':'調査後一部消滅','備考':'元位置不明','遺跡概_1':'概要1','遺跡概_2':'概要2','主な出土':'合成出土'}, {'label':'参考','category':'culture'},7)
        self.assertEqual(attrs['sourceRecordIndex'],7)
        self.assertEqual(attrs['sourceRemark'],'元位置不明')
        self.assertEqual(attrs['sourceCondition'],'調査後一部消滅')
        self.assertEqual(attrs['sourceDescription'],'概要1\n概要2')
        self.assertEqual(attrs['sourceYear'],None)

    def test_disjoint_polygons_and_holes_are_not_merged(self):
        outer=box(133,34,.1);hole=box(133.02,34.02,.02);other=box(134,35,.1)
        polygons=module.group_rings([hole,other,outer])
        self.assertEqual(sorted(map(len,polygons)),[1,2])

    def test_island_in_hole_remains_a_separate_polygon(self):
        polygons=module.group_rings([box(133,34,.2),box(133.02,34.02,.1),box(133.04,34.04,.02)])
        self.assertEqual(sorted(map(len,polygons)),[1,2])

    def test_small_real_coordinate_ring_avoids_global_area_cancellation(self):
        self.assertEqual(len(module.group_rings([box(133.12345678,34.12345678,1e-8)])),1)

    def test_unclosed_ring_is_rejected(self):
        with self.assertRaises(ValueError):module.group_rings([box(133,34,.1)[:-1]])

if __name__=='__main__':unittest.main()
