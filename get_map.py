import numpy as np
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen
from pathlib import Path
from tqdm import tqdm
from math import *
from urllib.error import HTTPError, URLError
from socket import timeout

Z, WORKERS = 9, 10
LON, LAT = (122, 154), (20, 46)
MESH_MODEL, ext = "dem", "png" # DEM10B PNG形式 1～14
# MESH_MODEL, ext = "dem5a_png", "png" # DEM5A PNG形式 1～15
# MESH_MODEL, ext = "dem1a_png", "png" # DEM1A PNG形式 1～17
# MESH_MODEL, ext = "seamlessphoto", "jpg"  # 全国最新写真（シームレス）2～18

def tx(lon): return int((lon+180)/360*2**Z)
def ty(lat): return int((1-asinh(tan(radians(lat)))/pi)/2*2**Z)

def fetch(xy):
    x, y = xy
    url = f"https://cyberjapandata.gsi.go.jp/xyz/{MESH_MODEL}/{Z}/{x}/{y}.{ext}"
    try:
        with urlopen(url, timeout=15) as r:
            return x, y, r.read(), None
    except HTTPError as e:
        if e.code == 404:
            return x, y, None, "not_found"
        return x, y, None, f"HTTP {e.code}"
    except (TimeoutError, timeout):
        return x, y, None, "timeout"
    except URLError as e:
        if isinstance(e.reason, (TimeoutError, timeout)):
            return x, y, None, "timeout"
        return x, y, None, f"URL error: {e.reason}"
    except OSError as e:
        return x, y, None, f"OS error: {e}"


def lonlat(x, y):
    n = 2**Z
    lon = x/n*360-180
    lat = degrees(atan(sinh(pi*(1-2*y/n))))
    return lon, lat
    # lon0, lat1 = lonlat(x, y)
    # lon1, lat0 = lonlat(x+1, y+1)

tiles = [
    (x, y)
    for y in range(ty(LAT[1]), ty(LAT[0])+1)
    for x in range(tx(LON[0]), tx(LON[1])+1)
]

outdir = Path(f"xyz/{MESH_MODEL}") / str(Z)
outdir.mkdir(parents=True, exist_ok=True)

with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    with tqdm(
        pool.map(fetch, tiles),
        total=len(tiles),
        desc="Downloading",
        bar_format="{desc}: {n_fmt}/{total_fmt} [{bar:20}] {percentage:3.0f}%",
        dynamic_ncols=True,
    ) as pbar:
        for x, y, data, message in pbar:
            if data is not None:
                (outdir / f"{x}_{y}.{ext}").write_bytes(data)
            elif message != "not_found":
                tqdm.write(f"Failed: https://cyberjapandata.gsi.go.jp/xyz/{MESH_MODEL}/{Z}/{x}/{y}.{ext} due to {message}")
