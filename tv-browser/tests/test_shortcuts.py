"""Keep the TV home shortcuts pointed at the requested external HTTPS domains."""
from pathlib import Path
import re
import unittest
from urllib.parse import urlparse


SOURCE = Path(__file__).resolve().parents[1] / "app/src/main/java/com/visujju/tvbrowser/MainActivity.java"


class ShortcutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = SOURCE.read_text(encoding="utf-8")
        cls.links = {
            title: url
            for title, url in re.findall(
                r'quickLink\("([^"]+)",\s*"[^"]+",\s*"([^"]+)"\)', source
            )
        }
        # Cards must actually open their assigned URL, not merely display a label.
        cls.click_handler = "card.setOnClickListener(v -> openUrl(url));" in source

    def test_requested_shortcuts_keep_the_exact_domains(self):
        expected = {
            "Cinejoy.pk": "https://cinejoy.pk/",
            "PVRPlay": "https://dbhnmkjasgbvsdkjbskkvnskjbfckldsnckjbckjnxkjcsknxjvkjxnvcxknvku.pvrplay.fun/",
            "Netmirror.plus": "https://netmirror.plus/",
            "Arena.ai": "https://arena.ai/",
        }
        for label, url in expected.items():
            with self.subTest(label=label):
                self.assertEqual(url, self.links.get(label))
                self.assertEqual("https", urlparse(self.links[label]).scheme)
        self.assertTrue(self.click_handler)

    def test_existing_quick_links_are_retained(self):
        for label in ("Google", "YouTube", "Wikipedia", "DuckDuckGo"):
            with self.subTest(label=label):
                self.assertEqual("https", urlparse(self.links[label]).scheme)


if __name__ == "__main__":
    unittest.main()
