import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = '{http://schemas.android.com/apk/res/android}'


class AndroidManifestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml').getroot()
        cls.app = cls.manifest.find('application')
        cls.activity = cls.app.find('activity')

    def test_tv_launcher_and_art_are_present(self):
        categories = {item.get(ANDROID + 'name') for item in self.activity.findall('.//category')}
        self.assertIn('android.intent.category.LEANBACK_LAUNCHER', categories)
        self.assertIn('android.intent.category.LAUNCHER', categories)
        self.assertEqual('true', self.activity.get(ANDROID + 'exported'))
        self.assertEqual('@drawable/tv_banner', self.app.get(ANDROID + 'banner'))
        self.assertTrue((ROOT / 'app/src/main/res/drawable-nodpi/tv_banner.png').is_file())
        self.assertTrue((ROOT / 'app/src/main/res/drawable/ic_launcher.xml').is_file())
        features = {item.get(ANDROID + 'name'): item.get(ANDROID + 'required')
                    for item in self.manifest.findall('uses-feature')}
        self.assertEqual('false', features.get('android.hardware.touchscreen'))
        self.assertEqual('false', features.get('android.software.leanback'))

    def test_demo_requires_no_network_permission(self):
        permissions = {item.get(ANDROID + 'name') for item in self.manifest.findall('uses-permission')}
        self.assertNotIn('android.permission.INTERNET', permissions)
        self.assertEqual('false', self.app.get(ANDROID + 'usesCleartextTraffic'))
        self.assertEqual('false', self.app.get(ANDROID + 'allowBackup'))


if __name__ == '__main__':
    unittest.main()
