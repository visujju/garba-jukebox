"""Static checks for the Android TV launcher and security-sensitive manifest flags."""
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
MAIN = PROJECT / "app/src/main"
ANDROID = "{http://schemas.android.com/apk/res/android}"


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = ET.parse(MAIN / "AndroidManifest.xml").getroot()
        cls.app = cls.root.find("application")

    def test_tv_and_phone_launcher_with_no_touchscreen_requirement(self):
        activity = self.app.find("activity")
        self.assertEqual("true", activity.get(ANDROID + "exported"))
        categories = {
            category.get(ANDROID + "name")
            for intent in activity.findall("intent-filter")
            for category in intent.findall("category")
        }
        self.assertIn("android.intent.category.LEANBACK_LAUNCHER", categories)
        self.assertIn("android.intent.category.LAUNCHER", categories)
        features = {item.get(ANDROID + "name"): item.get(ANDROID + "required")
                    for item in self.root.findall("uses-feature")}
        self.assertEqual("false", features.get("android.hardware.touchscreen"))
        self.assertEqual("false", features.get("android.hardware.faketouch"))

    def test_icons_exist_and_are_packaged(self):
        self.assertEqual("@drawable/ic_launcher", self.app.get(ANDROID + "icon"))
        self.assertEqual("@drawable/tv_banner", self.app.get(ANDROID + "banner"))
        self.assertTrue((MAIN / "res/drawable/ic_launcher.xml").exists())
        self.assertTrue((MAIN / "res/drawable-xhdpi/tv_banner.png").exists())

    def test_download_permissions_are_scoped(self):
        permissions = {p.get(ANDROID + "name"): p for p in self.root.findall("uses-permission")}
        storage = permissions.get("android.permission.WRITE_EXTERNAL_STORAGE")
        self.assertIsNotNone(storage)
        self.assertEqual("28", storage.get(ANDROID + "maxSdkVersion"))
        self.assertIn("android.permission.REQUEST_INSTALL_PACKAGES", permissions)
        self.assertNotIn("android.permission.MANAGE_EXTERNAL_STORAGE", permissions)

    def test_internet_access_and_private_backup_choice(self):
        permissions = {p.get(ANDROID + "name") for p in self.root.findall("uses-permission")}
        self.assertIn("android.permission.INTERNET", permissions)
        self.assertNotIn("android.permission.CAMERA", permissions)
        self.assertNotIn("android.permission.RECORD_AUDIO", permissions)
        self.assertEqual("false", self.app.get(ANDROID + "allowBackup"))
        metadata = {x.get(ANDROID + "name"): x.get(ANDROID + "value")
                    for x in self.app.findall("meta-data")}
        self.assertEqual("true", metadata.get("android.webkit.WebView.EnableSafeBrowsing"))


if __name__ == "__main__":
    unittest.main()
