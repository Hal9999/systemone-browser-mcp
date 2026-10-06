#!/usr/bin/env python3
"""Workaround for ollama/ollama#18769: clef-flash fails on Windows ("Clef: non-finite logit").

Cause (see PR #18777): Ollama reads the `clef.*` decision-head tensors straight from the GGUF with a seek that the
Windows build truncates to 32 bits. In clef-flash the head is stored last, ~8.9 GiB into the file, so the seek lands
~4 GiB too early and loads backbone weights as the head.

Fix: rewrite the GGUF with the `clef.*` tensors first (< 0.5 GiB into the file), then import the result as a new model.
Only the header and the order of the tensor data change; every tensor is copied byte for byte.

    python fix_clef_flash.py                       # clef-flash -> clef-flash-fixed
    python fix_clef_flash.py clef-flash my-clef --num-ctx 4096

Needs only Python 3.7+ and `ollama` on PATH, plus ~10 GB of temporary disk (set TMPDIR/TEMP to use another drive)
and ~10 GB for the new model. Delete the new model once the upstream fix ships.
"""
import argparse
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from dataclasses import dataclass

SEEK_LIMIT = 2**32  # offsets at or beyond this are the ones the buggy seek truncates
COPY_CHUNK = 64 << 20
SCALAR_BYTES = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}  # GGUF scalar types
STRING, ARRAY = 8, 9


@dataclass
class Tensor:
    name: str
    entry_start: int  # where this tensor's record begins in the header's tensor table
    entry_end: int
    offset_pos: int  # file position of the record's data-offset field (relative to the data section)
    offset: int
    size: int = 0  # bytes of data, including alignment padding


def read_index(f):
    """Parse a GGUF header. Returns (data_section_start, tensors sorted by data offset)."""
    def unpack(fmt):
        return struct.unpack("<" + fmt, f.read(struct.calcsize("<" + fmt)))

    def string():
        return f.read(unpack("Q")[0]).decode()

    def skip_value(kind):
        if kind == STRING:
            string()
        elif kind == ARRAY:
            item_kind, count = unpack("IQ")
            for _ in range(count):
                skip_value(item_kind)
        else:
            f.seek(SCALAR_BYTES[kind], os.SEEK_CUR)

    f.seek(0)
    if f.read(4) != b"GGUF":
        raise ValueError("not a GGUF file")
    _version, n_tensors, n_kv = unpack("IQQ")
    alignment = 32
    for _ in range(n_kv):
        key, (kind,) = string(), unpack("I")
        if key == "general.alignment":
            (alignment,) = unpack("I")
        else:
            skip_value(kind)

    tensors = []
    for _ in range(n_tensors):
        start, name = f.tell(), string()
        (n_dims,) = unpack("I")
        unpack("Q" * n_dims + "I")  # dims, type
        offset_pos = f.tell()
        (offset,) = unpack("Q")
        tensors.append(Tensor(name, start, f.tell(), offset_pos, offset))

    data_start = -(-f.tell() // alignment) * alignment
    tensors.sort(key=lambda t: t.offset)
    data_end = os.fstat(f.fileno()).st_size - data_start
    for t, nxt in zip(tensors, tensors[1:] + [None]):
        t.size = (nxt.offset if nxt else data_end) - t.offset
    return data_start, tensors


def write_reordered(src, dst, data_start, tensors):
    """Copy src to dst with the clef.* tensors first. The tensor table must list tensors in data order
    (llama.cpp checks this), so the table records are permuted along with the data."""
    is_head = lambda t: t.name.startswith("clef.")
    new_order = [t for t in tensors if is_head(t)] + [t for t in tensors if not is_head(t)]
    with open(src, "rb") as f, open(dst, "wb") as out:
        header = bytearray(f.read(data_start))
        table_start = min(t.entry_start for t in tensors)
        table_end = max(t.entry_end for t in tensors)
        records, offset = [], 0
        for t in new_order:
            record = bytearray(header[t.entry_start:t.entry_end])
            struct.pack_into("<Q", record, t.offset_pos - t.entry_start, offset)
            records.append(record)
            offset += t.size
        header[table_start:table_end] = b"".join(records)  # same total length, so data_start is unchanged
        out.write(header)
        for t in new_order:
            f.seek(data_start + t.offset)
            left = t.size
            while left:
                chunk = f.read(min(left, COPY_CHUNK))
                out.write(chunk)
                left -= len(chunk)


def main():
    ap = argparse.ArgumentParser(description="Re-import a clef GGUF with its decision head moved below 4 GiB.")
    ap.add_argument("model", nargs="?", default="clef-flash", help="installed Ollama model (default: %(default)s)")
    ap.add_argument("new_name", nargs="?", help="name for the fixed model (default: <model>-fixed)")
    ap.add_argument("--num-ctx", type=int, help="override num_ctx (the default 16384 may not fit small GPUs)")
    args = ap.parse_args()
    new_name = args.new_name or args.model.split(":")[0] + "-fixed"

    modelfile = subprocess.check_output(["ollama", "show", args.model, "--modelfile"], text=True, encoding="utf-8")
    for path in map(str.strip, re.findall(r"^FROM (.+)$", modelfile, re.M)):  # model GGUF, then the projector
        with open(path, "rb") as f:
            data_start, tensors = read_index(f)
        head = [t for t in tensors if t.name.startswith("clef.")]
        if head:
            break
    else:
        sys.exit(f"{args.model}: no clef.* tensors found, is it a clef model?")

    if data_start + max(t.offset + t.size for t in head) <= SEEK_LIMIT:
        sys.exit(f"{args.model}: the clef head is already below 4 GiB, nothing to fix")

    modelfile = re.sub(r"^CAPABILITY .*\n", "", modelfile, flags=re.M)  # re-derived from the GGUF on create
    if args.num_ctx:
        modelfile = re.sub(r"^PARAMETER num_ctx .*\n", "", modelfile, flags=re.M) + f"\nPARAMETER num_ctx {args.num_ctx}\n"

    with tempfile.TemporaryDirectory(prefix="clef-fix-") as tmp:
        fixed_gguf, modelfile_path = os.path.join(tmp, "model.gguf"), os.path.join(tmp, "Modelfile")
        print(f"Rewriting {path} ({os.path.getsize(path) / 2**30:.1f} GiB) ...")
        write_reordered(path, fixed_gguf, data_start, tensors)
        with open(modelfile_path, "w", encoding="utf-8") as f:
            f.write(modelfile.replace(path, fixed_gguf, 1))
        subprocess.check_call(["ollama", "create", new_name, "-f", modelfile_path])
    print(f"\nDone: created model '{new_name}'. Use it with POST /v1/systemone.")


if __name__ == "__main__":
    main()