import os
import struct
import tempfile
import unittest
from pathlib import Path

from fix_clef_flash import read_index, write_reordered


def make_gguf(path):
    header = bytearray(b"GGUF" + struct.pack("<IQQ", 3, 2, 0))
    for name, offset in [(b"backbone.weight", 0), (b"clef.head", 32)]:
        header.extend(struct.pack("<Q", len(name)) + name)
        header.extend(struct.pack("<IQIQ", 1, 8, 0, offset))
    header.extend(b"\0" * (-len(header) % 32))
    path.write_bytes(header + b"B" * 32 + b"H" * 32)


class ClefCopyTests(unittest.TestCase):
    def test_reorder_preserves_tensor_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp) / "original.gguf", Path(tmp) / "fixed.gguf"
            make_gguf(src)
            with src.open("rb") as f:
                data_start, tensors = read_index(f)
            write_reordered(src, dst, data_start, tensors)
            with dst.open("rb") as f:
                new_start, new_tensors = read_index(f)
                self.assertEqual([t.name for t in new_tensors], ["clef.head", "backbone.weight"])
                for tensor in new_tensors:
                    f.seek(new_start + tensor.offset)
                    self.assertEqual(f.read(tensor.size), (b"H" if tensor.name == "clef.head" else b"B") * 32)
            self.assertEqual(src.stat().st_size, dst.stat().st_size)

    def test_truncated_copy_fails_instead_of_looping(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp) / "original.gguf", Path(tmp) / "fixed.gguf"
            make_gguf(src)
            with src.open("rb") as f:
                data_start, tensors = read_index(f)
            os.truncate(src, src.stat().st_size - 1)
            with self.assertRaisesRegex(EOFError, "GGUF ended"):
                write_reordered(src, dst, data_start, tensors)


if __name__ == "__main__":
    unittest.main()
